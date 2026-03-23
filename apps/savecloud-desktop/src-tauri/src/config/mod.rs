//! Módulo de configuración de la aplicación.
//!
//! Contiene las funciones para:
//!
//! - Obtener el directorio de configuración.
//! - Obtener la ruta al archivo de configuración.
//! - Leer el archivo de configuración (Migrando secretos automáticamente).
//! - Escribir el archivo de configuración (Protegiendo secretos).
//!
//! Compatible con la ubicación usada por el CLI.

use chrono::Utc;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub const CONFIG_DIR_NAME: &str = "SaveCloud";
pub const CONFIG_FILE_NAME: &str = "config.json";

pub const KEYRING_SERVICE: &str = "savecloud_api";
pub const KEYRING_ACCOUNT: &str = "default_user";

pub fn config_dir() -> Option<PathBuf> {
    let base = dirs::config_dir()
        .or_else(|| dirs::data_local_dir())
        .or_else(dirs::home_dir)?;
    Some(base.join(CONFIG_DIR_NAME))
}

pub fn config_path() -> Option<PathBuf> {
    config_dir().map(|d| d.join(CONFIG_FILE_NAME))
}

#[derive(Debug, Default, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default)]
    pub api_base_url: Option<String>,

    #[serde(skip_serializing, default)]
    pub api_key: Option<String>,

    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub games: Vec<ConfiguredGame>,
    #[serde(default)]
    pub custom_scan_paths: Vec<String>,
    #[serde(default)]
    pub keep_backups_per_game: Option<u32>,
    #[serde(default)]
    pub full_backup_streaming: Option<bool>,
    #[serde(default)]
    pub full_backup_streaming_dry_run: Option<bool>,
    #[serde(default)]
    pub operation_history: Vec<OperationLogEntry>,
}

#[derive(Debug, Default, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfiguredGame {
    pub id: String,
    #[serde(default)]
    pub paths: Vec<String>,
    #[serde(default)]
    pub steam_app_id: Option<String>,
    #[serde(default)]
    pub image_url: Option<String>,
    #[serde(default)]
    pub executable_names: Option<Vec<String>>,
    #[serde(default)]
    pub edition_label: Option<String>,
    #[serde(default)]
    pub source_url: Option<String>,
    #[serde(default)]
    pub magnet_link: Option<String>,
    #[serde(default)]
    pub playtime_seconds: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationLogEntry {
    pub timestamp: String,
    pub kind: String,
    pub game_id: String,
    pub file_count: u32,
    pub err_count: u32,
}

fn get_secure_api_key() -> Option<String> {
    if let Ok(entry) = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT) {
        if let Ok(password) = entry.get_password() {
            return Some(password);
        }
    }
    None
}

fn set_secure_api_key(key: &str) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| format!("Error en keyring: {}", e))?;
    entry
        .set_password(key)
        .map_err(|e| format!("Error guardando clave: {}", e))
}

#[allow(dead_code)]
pub fn clear_secure_api_key() -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn append_operation_log(
    kind: &str,
    game_id: &str,
    file_count: u32,
    err_count: u32,
) -> Result<(), String> {
    let mut cfg = load_config();
    let entry = OperationLogEntry {
        timestamp: Utc::now().to_rfc3339(),
        kind: kind.to_string(),
        game_id: game_id.to_string(),
        file_count,
        err_count,
    };
    cfg.operation_history.push(entry);

    const MAX_ENTRIES: usize = 200;
    if cfg.operation_history.len() > MAX_ENTRIES {
        let drop = cfg.operation_history.len() - MAX_ENTRIES;
        cfg.operation_history.drain(0..drop);
    }

    save_config(&cfg)
}

pub fn load_config() -> Config {
    let path = match config_path() {
        Some(p) => p,
        None => return config_with_env_defaults(Config::default()),
    };

    let contents = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return config_with_env_defaults(Config::default()),
    };

    let mut cfg: Config = serde_json::from_str(&contents).unwrap_or_default();

    let secure_key = get_secure_api_key();

    if secure_key.is_none() && cfg.api_key.is_some() {
        if let Some(ref k) = cfg.api_key {
            let _ = set_secure_api_key(k);
            let _ = save_config(&cfg);
        }
    } else if let Some(sk) = secure_key {
        cfg.api_key = Some(sk);
    }

    config_with_env_defaults(cfg)
}

#[allow(dead_code)]
pub fn save_config(cfg: &Config) -> Result<(), String> {
    if let Some(ref key) = cfg.api_key {
        if !key.trim().is_empty() {
            set_secure_api_key(key)?;
        }
    }

    let path = config_path().ok_or_else(|| "No config path".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

fn apply_env_fallback(
    field: &mut Option<String>,
    compile_env: Option<&'static str>,
    runtime_env: &str,
) {
    if field.as_deref().map_or(true, str::is_empty) {
        let env_val = compile_env
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(String::from)
            .or_else(|| {
                std::env::var(runtime_env)
                    .ok()
                    .filter(|s| !s.trim().is_empty())
            });

        if let Some(v) = env_val {
            *field = Some(v);
        }
    }
}

fn config_with_env_defaults(mut cfg: Config) -> Config {
    apply_env_fallback(
        &mut cfg.api_base_url,
        option_env!("SYNC_GAMES_API_URL"),
        "SYNC_GAMES_API_URL",
    );
    apply_env_fallback(
        &mut cfg.api_key,
        option_env!("SYNC_GAMES_API_KEY"),
        "SYNC_GAMES_API_KEY",
    );
    apply_env_fallback(
        &mut cfg.user_id,
        option_env!("SYNC_GAMES_USER_ID"),
        "SYNC_GAMES_USER_ID",
    );

    cfg
}
