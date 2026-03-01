//! Comandos relacionados con la configuración.

use crate::config;
use crate::steam;
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
#[serde(rename_all = "camelCase")]
pub struct GameDto {
    pub id: String,
    pub paths: Vec<String>,
    pub steam_app_id: Option<String>,
    pub image_url: Option<String>,
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
            .map(|g| {
                let steam_app_id = g.steam_app_id.clone().or_else(|| {
                    if g.image_url.is_none() {
                        steam::resolve_app_id_for_game(&g.paths)
                    } else {
                        None
                    }
                });
                GameDto {
                    id: g.id,
                    paths: g.paths,
                    steam_app_id,
                    image_url: g.image_url,
                }
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
