//! Búsqueda dinámica de Steam App ID por nombre de juego.

use regex::Regex;
use std::sync::OnceLock;

static APP_ID_REGEX: OnceLock<Regex> = OnceLock::new();

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
