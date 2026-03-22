//! Resolución de identificadores, nombres y metadata de aplicaciones de Steam.
//!
//! Proporciona mecanismos para:
//!
//! - Buscar dinámicamente el App ID a partir del nombre del juego.
//! - Resolver el nombre del juego a partir de un App ID.
//! - Obtener metadata asociada, como imágenes, videos y otros recursos.
//!
//! Facilita la integración con servicios que requieren identificación
//! consistente y enriquecimiento de datos dentro del ecosistema de Steam.

use futures_util::StreamExt;
use regex::{Regex, RegexBuilder};
use std::collections::{HashMap, HashSet};
use std::sync::{LazyLock, RwLock};

static STEAM_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .expect("Fallo al construir el cliente HTTP de Steam")
});

static APP_ID_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"/app/(\d{4,10})/"#).unwrap());
static SUGGEST_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    RegexBuilder::new(r#"<a[^>]+data-ds-appid="(\d{4,10})"[^>]*>(.*?)</a>"#)
        .dot_matches_new_line(true)
        .build()
        .unwrap()
});
static NAME_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"class="[^"]*match_name[^"]*"[^>]*>([^<]+)<"#).unwrap());

const STEAM_CONCURRENCY_LIMIT: usize = 3;

static MEDIA_CACHE: LazyLock<RwLock<HashMap<String, SteamAppdetailsMedia>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

async fn fetch_single_app_name(app_id: &str) -> Option<(String, String)> {
    let url = format!(
        "https://store.steampowered.com/api/appdetails?appids={}",
        app_id
    );

    let res = STEAM_CLIENT.get(&url).send().await.ok()?;
    let data: serde_json::Value = res.json().await.ok()?;

    let entry = data.get(app_id)?;
    if entry.get("success")?.as_bool()? {
        let name = entry.get("data")?.get("name")?.as_str()?;
        return Some((app_id.to_string(), name.to_string()));
    }

    None
}

#[tauri::command]
pub async fn get_steam_app_names_batch(app_ids: Vec<String>) -> HashMap<String, String> {
    let mut valid_ids: Vec<String> = app_ids
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
        .collect();

    valid_ids.sort_unstable();
    valid_ids.dedup();

    if valid_ids.is_empty() {
        return HashMap::new();
    }

    let stream = futures_util::stream::iter(valid_ids.into_iter().map(|app_id| async move {
        for _ in 0..2 {
            if let Some(result) = fetch_single_app_name(&app_id).await {
                return Some(result);
            }
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        }
        None
    }))
    .buffer_unordered(STEAM_CONCURRENCY_LIMIT);

    let results: Vec<Option<(String, String)>> = stream.collect().await;

    let mut final_map = HashMap::new();
    for (id, name) in results.into_iter().flatten() {
        final_map.insert(id, name);
    }

    final_map
}

#[tauri::command]
pub async fn get_steam_app_name(app_id: String) -> Option<String> {
    let app_id = app_id.trim().to_string();
    if app_id.is_empty() || !app_id.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }

    let mut results = get_steam_app_names_batch(vec![app_id.clone()]).await;
    results.remove(&app_id)
}

async fn search_steam_app_id_impl(query: String) -> Option<String> {
    let term = query.replace('-', " ");
    let url = format!(
        "https://store.steampowered.com/search/suggest?term={}&f=games&cc=US&l=english",
        urlencoding::encode(&term)
    );

    let body = STEAM_CLIENT
        .get(&url)
        .send()
        .await
        .ok()?
        .text()
        .await
        .ok()?;

    APP_ID_REGEX
        .captures_iter(&body)
        .next()
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}

#[tauri::command]
pub async fn search_steam_app_id(query: String) -> Option<String> {
    let query = query.trim();
    if query.is_empty() {
        return None;
    }
    search_steam_app_id_impl(query.to_string()).await
}

#[tauri::command]
pub async fn search_steam_app_ids_batch(queries: Vec<String>) -> Vec<Option<String>> {
    if queries.is_empty() {
        return Vec::new();
    }

    let trimmed: Vec<String> = queries.into_iter().map(|q| q.trim().to_string()).collect();

    let stream = futures_util::stream::iter(trimmed.into_iter().map(|q| async move {
        if q.is_empty() {
            None
        } else {
            search_steam_app_id_impl(q).await
        }
    }))
    .buffer_unordered(5);

    stream.collect().await
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamSearchResult {
    pub steam_app_id: String,
    pub name: String,
}

#[tauri::command]
pub async fn search_steam_games(query: String) -> Vec<SteamSearchResult> {
    let query = query.trim();
    if query.len() < 3 {
        return Vec::new();
    }

    let term = query.replace('-', " ");
    let url = format!(
        "https://store.steampowered.com/search/suggest?term={}&f=games&cc=US&l=english",
        urlencoding::encode(&term)
    );

    let body = match STEAM_CLIENT.get(&url).send().await {
        Ok(resp) => resp.text().await.unwrap_or_default(),
        Err(_) => return Vec::new(),
    };

    let mut results = Vec::new();

    for cap in SUGGEST_REGEX.captures_iter(&body) {
        let app_id = match cap.get(1) {
            Some(m) => m.as_str().to_string(),
            None => continue,
        };
        let inner = cap.get(2).map(|m| m.as_str()).unwrap_or("");

        let name = match NAME_REGEX.captures(inner) {
            Some(c) => c
                .get(1)
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_default(),
            None => String::new(),
        };

        if name.is_empty() {
            continue;
        }
        results.push(SteamSearchResult {
            steam_app_id: app_id,
            name,
        });
    }

    results
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamAppdetailsMedia {
    pub media_urls: Vec<String>,
    pub video_url: Option<String>,
}

async fn fetch_steam_appdetails_media_impl(app_id: &str) -> Result<SteamAppdetailsMedia, String> {
    let url = format!(
        "https://store.steampowered.com/api/appdetails?appids={}&l=english&filters=basic,screenshots,movies",
        app_id
    );

    let res = STEAM_CLIENT
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Request Error: {}", e))?;

    let status = res.status();
    if !status.is_success() {
        if status.as_u16() == 429 {
            eprintln!("Límite de Steam (429) alcanzado en app_id: {}", app_id);
        }
        return Err(format!("HTTP Error: {}", status));
    }

    let body_text = res.text().await.unwrap_or_default();
    if body_text.trim().is_empty() || body_text == "null" {
        return Err("Empty response".into());
    }

    let data: serde_json::Value =
        serde_json::from_str(&body_text).map_err(|e| format!("JSON Parse Error: {}", e))?;

    let mut media_urls = Vec::new();
    let mut video_url: Option<String> = None;

    let success = data
        .get(app_id)
        .and_then(|e| e.get("success"))
        .and_then(|e| e.as_bool())
        .unwrap_or(false);

    if !success {
        return Ok(SteamAppdetailsMedia {
            media_urls,
            video_url,
        });
    }

    let data_obj = match data.get(app_id).and_then(|e| e.get("data")) {
        Some(d) => d,
        None => {
            return Ok(SteamAppdetailsMedia {
                media_urls,
                video_url,
            })
        }
    };

    if let Some(s) = data_obj.get("header_image").and_then(|v| v.as_str()) {
        if !s.is_empty() {
            media_urls.push(s.to_string());
        }
    }

    if let Some(arr) = data_obj.get("screenshots").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(path) = item.get("path_full").and_then(|v| v.as_str()) {
                if !path.is_empty() && !media_urls.contains(&path.to_string()) {
                    media_urls.push(path.to_string());
                }
            }
        }
    }

    if let Some(arr) = data_obj.get("movies").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(thumb) = item.get("thumbnail").and_then(|v| v.as_str()) {
                if !thumb.is_empty() && !media_urls.contains(&thumb.to_string()) {
                    media_urls.push(thumb.to_string());
                }
            }
            if video_url.is_none() {
                let u = item
                    .get("hls_h264")
                    .and_then(|v| v.as_str())
                    .map(String::from)
                    .or_else(|| {
                        item.get("dash_h264")
                            .and_then(|v| v.as_str())
                            .map(String::from)
                    })
                    .or_else(|| {
                        item.get("webm").and_then(|webm| {
                            webm.get("max")
                                .or_else(|| webm.get("480"))
                                .and_then(|v| v.as_str())
                                .map(String::from)
                        })
                    })
                    .or_else(|| {
                        item.get("mp4").and_then(|mp4| {
                            mp4.get("max")
                                .or_else(|| mp4.get("480"))
                                .and_then(|v| v.as_str())
                                .map(String::from)
                        })
                    });

                if let Some(url) = u.filter(|url| !url.is_empty()) {
                    video_url = Some(url);
                }
            }
        }
    }

    Ok(SteamAppdetailsMedia {
        media_urls,
        video_url,
    })
}

#[tauri::command]
pub async fn get_steam_appdetails_media(app_id: String) -> Result<SteamAppdetailsMedia, String> {
    let app_id = app_id.trim().to_string();
    if app_id.is_empty() || !app_id.chars().all(|c| c.is_ascii_digit()) {
        return Err("App ID inválido".to_string());
    }

    {
        let cache = MEDIA_CACHE.read().unwrap();
        if let Some(cached_media) = cache.get(&app_id) {
            return Ok(cached_media.clone());
        }
    }

    let result = fetch_steam_appdetails_media_impl(&app_id).await?;

    {
        let mut cache = MEDIA_CACHE.write().unwrap();
        cache.insert(app_id, result.clone());
    }

    Ok(result)
}

#[tauri::command]
pub async fn get_steam_appdetails_media_batch(
    app_ids: Vec<String>,
) -> Result<HashMap<String, SteamAppdetailsMedia>, String> {
    let mut seen = HashSet::new();
    let valid_ids: Vec<String> = app_ids
        .into_iter()
        .filter_map(|id| {
            let id = id.trim().to_string();
            if id.is_empty() || !id.chars().all(|c| c.is_ascii_digit()) {
                return None;
            }
            if seen.insert(id.clone()) {
                Some(id)
            } else {
                None
            }
        })
        .collect();

    if valid_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut final_results = HashMap::new();
    let mut ids_to_fetch = Vec::new();

    {
        let cache = MEDIA_CACHE.read().unwrap();
        for id in valid_ids {
            if let Some(cached_data) = cache.get(&id) {
                final_results.insert(id, cached_data.clone());
            } else {
                ids_to_fetch.push(id);
            }
        }
    }

    if ids_to_fetch.is_empty() {
        return Ok(final_results);
    }

    let empty = SteamAppdetailsMedia {
        media_urls: Vec::new(),
        video_url: None,
    };

    let stream = futures_util::stream::iter(ids_to_fetch.into_iter().map(|app_id| {
        let fallback = empty.clone();
        async move {
            let result = fetch_steam_appdetails_media_impl(&app_id).await;
            (app_id, result.unwrap_or(fallback))
        }
    }))
    .buffer_unordered(5);

    let fetched_results: Vec<(String, SteamAppdetailsMedia)> = stream.collect().await;

    let mut cache = MEDIA_CACHE.write().unwrap();
    for (id, media) in fetched_results {
        cache.insert(id.clone(), media.clone());
        final_results.insert(id, media);
    }

    Ok(final_results)
}
