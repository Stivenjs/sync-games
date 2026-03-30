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

use std::ops::Deref;

use rusqlite::Connection;
use tauri::State;

use crate::network::STEAM_CLIENT;
use crate::sqlite::AppDb;
use crate::steam::appdetails::fetch_steam_app_details_from_store;
use crate::steam::appdetails::fetch_steam_appdetails_media_from_store;
use crate::steam_cache::{normalize_steam_app_id, steam_api_cache};
use futures_util::StreamExt;
use regex::{Regex, RegexBuilder};
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;


pub use crate::steam_cache::{SteamAppDetails, SteamAppdetailsMedia};

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

/// Medios ya enriquecidos en el catálogo local (`details_json`); evita golpear la Store.
fn load_catalog_media_map(
    conn: &Connection,
    app_ids: &[String],
) -> Result<HashMap<String, SteamAppdetailsMedia>, rusqlite::Error> {
    let mut stmt = conn.prepare_cached(
        "SELECT details_json FROM steam_catalog_apps WHERE app_id = ?1 \
         AND details_json IS NOT NULL AND length(trim(details_json)) > 0",
    )?;
    let mut out = HashMap::new();
    for id in app_ids {
        let Ok(pid) = id.parse::<i64>() else {
            continue;
        };
        let json: Option<String> = match stmt.query_row([pid], |row| row.get::<_, String>(0)) {
            Ok(s) => Some(s),
            Err(rusqlite::Error::QueryReturnedNoRows) => None,
            Err(e) => return Err(e),
        };
        let Some(json) = json else {
            continue;
        };
        if let Ok(details) = serde_json::from_str::<SteamAppDetails>(&json) {
            out.insert(id.clone(), details.media);
        }
    }
    Ok(out)
}

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
    let app_id = normalize_steam_app_id(&app_id)?;

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

#[tauri::command]
pub async fn get_steam_appdetails_media(app_id: String) -> Result<SteamAppdetailsMedia, String> {
    let Some(app_id) = normalize_steam_app_id(&app_id) else {
        return Err("App ID inválido".to_string());
    };

    if let Some(cached) = steam_api_cache().get_media(&app_id) {
        return Ok(cached);
    }

    let result = fetch_steam_appdetails_media_from_store(&app_id).await?;

    steam_api_cache().insert_media(app_id, result.clone());

    Ok(result)
}

#[tauri::command]
pub async fn get_steam_appdetails_media_batch(
    db: State<'_, AppDb>,
    app_ids: Vec<String>,
) -> Result<HashMap<String, SteamAppdetailsMedia>, String> {
    let mut seen = HashSet::new();
    let valid_ids: Vec<String> = app_ids
        .into_iter()
        .filter_map(|id| {
            let id = normalize_steam_app_id(&id)?;
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
    let mut missing_after_cache = Vec::new();

    let cache = steam_api_cache();
    for id in valid_ids {
        if let Some(cached_data) = cache.get_media(&id) {
            final_results.insert(id, cached_data);
        } else {
            missing_after_cache.push(id);
        }
    }

    if !missing_after_cache.is_empty() {
        let db = db.deref().clone();
        let ids_for_db = missing_after_cache.clone();
        let from_db = tokio::task::spawn_blocking(move || {
            db.with_conn(|c| load_catalog_media_map(c, &ids_for_db))
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e: crate::sqlite::error::SqliteError| e.to_string())?;

        let api_cache = steam_api_cache();
        for (id, media) in from_db {
            api_cache.insert_media(id.clone(), media.clone());
            final_results.insert(id, media);
        }
    }

    let ids_to_fetch: Vec<String> = missing_after_cache
        .into_iter()
        .filter(|id| !final_results.contains_key(id))
        .collect();

    if ids_to_fetch.is_empty() {
        return Ok(final_results);
    }

    let empty = SteamAppdetailsMedia {
        media_urls: Vec::new(),
        video_url: None,
        genres: Vec::new(),
        name: String::new(),
    };

    let stream = futures_util::stream::iter(ids_to_fetch.into_iter().map(|app_id| {
        let fallback = empty.clone();
        async move {
            let result = fetch_steam_appdetails_media_from_store(&app_id).await;
            (app_id, result.unwrap_or(fallback))
        }
    }))
    .buffer_unordered(5);

    let fetched_results: Vec<(String, SteamAppdetailsMedia)> = stream.collect().await;

    let api_cache = steam_api_cache();
    for (id, media) in fetched_results {
        api_cache.insert_media(id.clone(), media.clone());
        final_results.insert(id, media);
    }

    Ok(final_results)
}

/// Obtiene la ficha completa de un juego de Steam por su App ID.
///
/// # Errors
///
/// Retorna `Err` si el `app_id` no es numérico, si hay error de red,
/// o si Steam no tiene datos para esa app.
#[tauri::command]
pub async fn get_steam_app_details(app_id: String) -> Result<SteamAppDetails, String> {
    let Some(app_id) = normalize_steam_app_id(&app_id) else {
        return Err("App ID inválido".to_string());
    };

    if let Some(cached) = steam_api_cache().get_details(&app_id) {
        return Ok(cached);
    }

    let result = fetch_steam_app_details_from_store(&app_id).await?;

    steam_api_cache().insert_details(app_id, result.clone());

    Ok(result)
}
