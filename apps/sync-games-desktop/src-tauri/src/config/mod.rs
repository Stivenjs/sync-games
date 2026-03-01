//! Lógica de rutas y lectura del archivo de configuración.
//! Compatible con la ubicación usada por el CLI.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub const CONFIG_DIR_NAME: &str = "sync-games";
pub const CONFIG_FILE_NAME: &str = "config.json";

/// Directorio de configuración según la plataforma.
/// Windows: %APPDATA%/sync-games
/// macOS: ~/Library/Application Support/sync-games
/// Linux: ~/.config/sync-games
pub fn config_dir() -> Option<PathBuf> {
    let base = dirs::config_dir()
        .or_else(|| dirs::data_local_dir())
        .or_else(dirs::home_dir)?;
    Some(base.join(CONFIG_DIR_NAME))
}

/// Ruta completa al archivo config.json.
pub fn config_path() -> Option<PathBuf> {
    config_dir().map(|d| d.join(CONFIG_FILE_NAME))
}

/// Estructura mínima para deserializar el config del CLI.
#[derive(Debug, Default, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default)]
    pub api_base_url: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub games: Vec<ConfiguredGame>,
    #[serde(default)]
    pub custom_scan_paths: Vec<String>,
}

#[derive(Debug, Default, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfiguredGame {
    pub id: String,
    #[serde(default)]
    pub paths: Vec<String>,
    /// Steam App ID: si está definido, se usa la imagen del CDN de Steam.
    #[serde(default)]
    pub steam_app_id: Option<String>,
    /// URL personalizada de imagen. Prioridad sobre steam_app_id. Para juegos no-Steam.
    #[serde(default)]
    pub image_url: Option<String>,
}

/// Lee el archivo de config desde disco.
/// Devuelve config por defecto si no existe.
pub fn load_config() -> Config {
    let path = match config_path() {
        Some(p) => p,
        None => return Config::default(),
    };

    let contents = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Config::default(),
    };

    serde_json::from_str(&contents).unwrap_or_default()
}

/// Guarda el config en disco.
/// Usada por commands::add_game y commands::remove_game.
#[allow(dead_code)]
pub fn save_config(cfg: &Config) -> Result<(), String> {
    let path = config_path().ok_or_else(|| "No config path".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}
