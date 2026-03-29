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

use crate::network::STEAM_CLIENT;
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

// Helpers compartidos entre media y details

/// Realiza una petición a `appdetails` y retorna el campo `data` tomando
/// ownership del sub-árbol JSON para evitar clones innecesarios.
///
/// Retorna `Ok(None)` cuando `success` es `false` (app no encontrada).
async fn fetch_appdetails_data(
    app_id: &str,
    lang: &str,
    filters: &str,
) -> Result<Option<serde_json::Value>, String> {
    let url = format!(
        "https://store.steampowered.com/api/appdetails?appids={app_id}&l={lang}&filters={filters}"
    );

    let res = STEAM_CLIENT
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Request Error: {e}"))?;

    let status = res.status();
    if !status.is_success() {
        if status.as_u16() == 429 {
            eprintln!("Límite de Steam (429) alcanzado en app_id: {app_id}");
        }
        return Err(format!("HTTP Error: {status}"));
    }

    let body_text = res.text().await.unwrap_or_default();
    if body_text.trim().is_empty() || body_text == "null" {
        return Err("Empty response".into());
    }

    let mut root: serde_json::Value =
        serde_json::from_str(&body_text).map_err(|e| format!("JSON Parse Error: {e}"))?;

    let success = root
        .get(app_id)
        .and_then(|e| e.get("success"))
        .and_then(|e| e.as_bool())
        .unwrap_or(false);

    if !success {
        return Ok(None);
    }

    let data = root
        .as_object_mut()
        .and_then(|obj| obj.remove(app_id))
        .and_then(|mut entry| entry.as_object_mut().and_then(|obj| obj.remove("data")));

    Ok(data)
}

/// Mejor URL de vídeo de un item de `movies`.
///
/// Prioridad: HLS H264 → DASH H264 → WebM (max/480) → MP4 (max/480).
fn extract_best_video_url(movie: &serde_json::Value) -> Option<String> {
    let direct = |key: &str| {
        movie
            .get(key)
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(String::from)
    };

    let nested = |container: &str| {
        movie.get(container).and_then(|obj| {
            obj.get("max")
                .or_else(|| obj.get("480"))
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(String::from)
        })
    };

    direct("hls_h264")
        .or_else(|| direct("dash_h264"))
        .or_else(|| nested("webm"))
        .or_else(|| nested("mp4"))
}

/// Parsea portada, capturas, thumbnails y URL de vídeo del campo `data`
/// de la API de Steam.
fn parse_media_from_data(data: &serde_json::Value) -> SteamAppdetailsMedia {
    let mut media_urls: Vec<String> = Vec::new();
    let mut video_url: Option<String> = None;

    if let Some(header) = data.get("header_image").and_then(|v| v.as_str()) {
        if !header.is_empty() {
            media_urls.push(header.to_owned());
        }
    }

    if let Some(screenshots) = data.get("screenshots").and_then(|v| v.as_array()) {
        for item in screenshots {
            if let Some(path) = item.get("path_full").and_then(|v| v.as_str()) {
                if !path.is_empty() && !media_urls.iter().any(|u| u == path) {
                    media_urls.push(path.to_owned());
                }
            }
        }
    }

    // No añadir `thumbnail` de trailers: son muy pequeñas y se ven pixeladas en hero/carrusel.
    // El vídeo sigue disponible en `video_url` para hover / reproductor.
    if let Some(movies) = data.get("movies").and_then(|v| v.as_array()) {
        for item in movies {
            if video_url.is_none() {
                video_url = extract_best_video_url(item);
            }
        }
    }

    SteamAppdetailsMedia {
        media_urls,
        video_url,
    }
}

/// Extrae un array plano de strings (`["Valve", "Hidden Path"]`).
fn extract_plain_string_array(value: &serde_json::Value, field: &str) -> Vec<String> {
    value
        .get(field)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

/// Extrae un array de strings de objetos con sub-campo
/// (ej. `genres: [{"description":"Action"}, ...]`).
fn extract_keyed_string_array(value: &serde_json::Value, field: &str, sub: &str) -> Vec<String> {
    value
        .get(field)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.get(sub).and_then(|v| v.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

// Media fetch (usa helpers compartidos)

async fn fetch_steam_appdetails_media_impl(app_id: &str) -> Result<SteamAppdetailsMedia, String> {
    let data = fetch_appdetails_data(app_id, "english", "basic,screenshots,movies").await?;
    Ok(data
        .as_ref()
        .map(parse_media_from_data)
        .unwrap_or_else(|| SteamAppdetailsMedia {
            media_urls: Vec::new(),
            video_url: None,
        }))
}

#[tauri::command]
pub async fn get_steam_appdetails_media(app_id: String) -> Result<SteamAppdetailsMedia, String> {
    let Some(app_id) = normalize_steam_app_id(&app_id) else {
        return Err("App ID inválido".to_string());
    };

    if let Some(cached) = steam_api_cache().get_media(&app_id) {
        return Ok(cached);
    }

    let result = fetch_steam_appdetails_media_impl(&app_id).await?;

    steam_api_cache().insert_media(app_id, result.clone());

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
    let mut ids_to_fetch = Vec::new();

    let cache = steam_api_cache();
    for id in valid_ids {
        if let Some(cached_data) = cache.get_media(&id) {
            final_results.insert(id, cached_data);
        } else {
            ids_to_fetch.push(id);
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

    let api_cache = steam_api_cache();
    for (id, media) in fetched_results {
        api_cache.insert_media(id.clone(), media.clone());
        final_results.insert(id, media);
    }

    Ok(final_results)
}

/// Filtros para `appdetails`: `basic` no incluye desarrolladores, géneros, etc.
/// Hay que listarlos explícitamente o la API los omite.
const STEAM_APPDETAILS_FILTERS_FULL: &str =
    "basic,developers,publishers,genres,categories,release_date,screenshots,movies";
const STEAM_APPDETAILS_FILTERS_WITHOUT_MEDIA: &str =
    "basic,developers,publishers,genres,categories,release_date";

/// Obtiene la ficha completa de un juego de Steam.
///
/// Reutiliza el caché de medios ([`crate::steam_cache`]) para evitar pedir
/// screenshots/movies si ya se obtuvieron: cuando hay medios en caché se omiten
/// en la URL (payload menor). Los metadatos (devs, géneros, fecha…) se piden siempre.
/// Los textos se solicitan en español (`l=spanish`).
async fn fetch_steam_app_details_impl(app_id: &str) -> Result<SteamAppDetails, String> {
    let cached_media = steam_api_cache().get_media(app_id);

    let filters = if cached_media.is_some() {
        STEAM_APPDETAILS_FILTERS_WITHOUT_MEDIA
    } else {
        STEAM_APPDETAILS_FILTERS_FULL
    };

    let data = fetch_appdetails_data(app_id, "spanish", filters)
        .await?
        .ok_or_else(|| "Juego no encontrado en Steam".to_string())?;

    let str_field = |key: &str| -> String {
        data.get(key)
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_owned()
    };

    let release_date = data
        .get("release_date")
        .and_then(|rd| rd.get("date").and_then(|v| v.as_str()).map(String::from));

    let pc_req = data.get("pc_requirements");
    let pc_requirements_minimum = pc_req
        .and_then(|r| r.get("minimum"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let pc_requirements_recommended = pc_req
        .and_then(|r| r.get("recommended"))
        .and_then(|v| v.as_str())
        .map(String::from);

    let media = if let Some(cached) = cached_media {
        cached
    } else {
        let parsed = parse_media_from_data(&data);
        steam_api_cache().insert_media(app_id.to_owned(), parsed.clone());
        parsed
    };

    Ok(SteamAppDetails {
        name: str_field("name"),
        short_description: str_field("short_description"),
        detailed_description: str_field("detailed_description"),
        header_image: str_field("header_image"),
        developers: extract_plain_string_array(&data, "developers"),
        publishers: extract_plain_string_array(&data, "publishers"),
        genres: extract_keyed_string_array(&data, "genres", "description"),
        categories: extract_keyed_string_array(&data, "categories", "description"),
        release_date,
        pc_requirements_minimum,
        pc_requirements_recommended,
        media,
    })
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

    let result = fetch_steam_app_details_impl(&app_id).await?;

    steam_api_cache().insert_details(app_id, result.clone());

    Ok(result)
}
