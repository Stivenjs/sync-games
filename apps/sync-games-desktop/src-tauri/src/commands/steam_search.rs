//! Búsqueda dinámica de Steam App ID por nombre y resolución de App ID a nombre.

use regex::Regex;
use std::sync::OnceLock;

static APP_ID_REGEX: OnceLock<Regex> = OnceLock::new();

/// Obtiene el nombre del juego a partir del Steam App ID (API appdetails).
#[tauri::command]
pub async fn get_steam_app_name(app_id: String) -> Option<String> {
    let app_id = app_id.trim();
    if app_id.is_empty() || !app_id.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }

    let url = format!(
        "https://store.steampowered.com/api/appdetails?appids={}",
        app_id
    );

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .ok()?;

    let res = client.get(&url).send().await.ok()?;
    let data: serde_json::Value = res.json().await.ok()?;
    let entry = data.get(app_id)?;
    let success = entry.get("success")?.as_bool()?;
    if !success {
        return None;
    }
    entry.get("data")?.get("name")?.as_str().map(String::from)
}

/// Busca el Steam App ID por nombre usando el endpoint de sugerencias de Steam.
#[tauri::command]
pub async fn search_steam_app_id(query: String) -> Option<String> {
    let query = query.trim();
    if query.is_empty() {
        return None;
    }

    let term = query.replace('-', " ");
    let url = format!(
        "https://store.steampowered.com/search/suggest?term={}&f=games&cc=US&l=english",
        urlencoding::encode(&term)
    );

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .ok()?;

    let body = client.get(&url).send().await.ok()?.text().await.ok()?;

    let re = APP_ID_REGEX.get_or_init(|| Regex::new(r#"/app/(\d{4,10})/"#).expect("regex válida"));

    re.captures_iter(&body)
        .next()
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}
