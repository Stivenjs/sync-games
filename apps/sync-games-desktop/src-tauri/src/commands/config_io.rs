//! Exportar e importar configuración (lista de juegos) a/desde JSON.

use crate::config;
use regex::Regex;
use std::fs;
use std::path::PathBuf;

fn expand_path(raw: &str) -> Option<PathBuf> {
    let mut result = raw.to_string();
    let re = Regex::new(r"%([^%]+)%").ok()?;
    for cap in re.captures_iter(raw) {
        let var = cap.get(1)?.as_str();
        let val = std::env::var(var).unwrap_or_default();
        result = result.replace(&format!("%{}%", var), &val);
    }
    if result.starts_with('~') {
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_default();
        if !home.is_empty() {
            let rest = result.trim_start_matches('~').trim_start_matches('/');
            result = if rest.is_empty() {
                home
            } else {
                format!("{}/{}", home.trim_end_matches(&['/', '\\']), rest)
            };
        }
    }
    if result.is_empty() {
        None
    } else {
        Some(PathBuf::from(result))
    }
}

/// Devuelve la primera ruta expandida del juego (para abrir en explorador).
#[tauri::command]
pub fn get_game_save_path(game_id: String) -> Result<String, String> {
    let cfg = config::load_config();
    let game = cfg
        .games
        .iter()
        .find(|g| g.id.eq_ignore_ascii_case(&game_id))
        .ok_or_else(|| format!("Juego no encontrado: {}", game_id))?;

    let first = game
        .paths
        .first()
        .ok_or("El juego no tiene rutas configuradas")?;
    expand_path(first.trim())
        .ok_or("No se pudo expandir la ruta")?
        .into_os_string()
        .into_string()
        .map_err(|_| "Ruta no válida".to_string())
}

#[tauri::command]
pub fn open_save_folder(game_id: String) -> Result<(), String> {
    let path = get_game_save_path(game_id)?;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Exporta la configuración a un archivo JSON. Devuelve el path escrito.
#[tauri::command]
pub fn export_config_to_file(path: String) -> Result<String, String> {
    let cfg = config::load_config();
    let json = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Importa configuración desde archivo. mode: "merge" fusiona juegos, "replace" reemplaza todo.
#[tauri::command]
pub fn import_config_from_file(path: String, mode: String) -> Result<(), String> {
    let contents = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let imported: config::Config =
        serde_json::from_str(&contents).map_err(|e| format!("JSON inválido: {}", e))?;

    let mut cfg = config::load_config();

    match mode.as_str() {
        "replace" => {
            cfg = imported;
        }
        "merge" => {
            for imp_game in imported.games {
                if let Some(existing) = cfg
                    .games
                    .iter_mut()
                    .find(|g| g.id.eq_ignore_ascii_case(&imp_game.id))
                {
                    for p in imp_game.paths {
                        if !existing.paths.contains(&p) {
                            existing.paths.push(p);
                        }
                    }
                    if imp_game.steam_app_id.is_some() && existing.steam_app_id.is_none() {
                        existing.steam_app_id = imp_game.steam_app_id;
                    }
                    if imp_game.image_url.is_some() && existing.image_url.is_none() {
                        existing.image_url = imp_game.image_url;
                    }
                } else {
                    cfg.games.push(imp_game);
                }
            }
            for cp in imported.custom_scan_paths {
                if !cfg.custom_scan_paths.contains(&cp) {
                    cfg.custom_scan_paths.push(cp);
                }
            }
        }
        _ => return Err("mode debe ser 'merge' o 'replace'".to_string()),
    }

    config::save_config(&cfg)
}
