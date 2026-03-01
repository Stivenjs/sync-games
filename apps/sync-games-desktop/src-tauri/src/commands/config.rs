//! Comandos relacionados con la configuración.

use crate::config;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigDto {
    pub api_base_url: Option<String>,
    pub api_key: Option<String>,
    pub user_id: Option<String>,
    pub games: Vec<GameDto>,
    pub custom_scan_paths: Vec<String>,
}

#[derive(Serialize)]
pub struct GameDto {
    pub id: String,
    pub paths: Vec<String>,
}

#[tauri::command]
pub fn get_config() -> ConfigDto {
    let cfg = config::load_config();
    ConfigDto {
        api_base_url: cfg.api_base_url,
        api_key: cfg.api_key,
        user_id: cfg.user_id,
        games: cfg
            .games
            .into_iter()
            .map(|g| GameDto {
                id: g.id,
                paths: g.paths,
            })
            .collect(),
        custom_scan_paths: cfg.custom_scan_paths,
    }
}

#[tauri::command]
pub fn get_config_path() -> String {
    config::config_path()
        .and_then(|p| p.into_os_string().into_string().ok())
        .unwrap_or_else(|| "".to_string())
}
