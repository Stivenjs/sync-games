//! Sincronización de guardados: subir y descargar a/desde la API (S3).

use crate::config;
use chrono::{DateTime, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileDto {
    pub absolute: String,
    pub relative: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSaveDto {
    pub game_id: String,
    pub key: String,
    pub last_modified: String,
    #[serde(default)]
    pub size: Option<u64>,
}

fn expand_path(raw: &str) -> Option<String> {
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
        Some(result)
    }
}

fn collect_files_recursive(dir: &Path, base: &Path, out: &mut Vec<(PathBuf, String)>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let full = e.path();
        let meta = match e.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.is_dir() {
            if !e.file_name().to_string_lossy().starts_with('.') {
                collect_files_recursive(&full, base, out);
            }
        } else if meta.is_file() {
            if let Ok(rel) = full.strip_prefix(base) {
                let rel_str = rel.to_string_lossy().replace('\\', "/");
                out.push((full, rel_str));
            }
        }
    }
}

fn list_all_files_from_paths(paths: &[String]) -> Vec<(String, String)> {
    let mut seen = std::collections::HashSet::new();
    let mut results = Vec::new();

    for raw in paths {
        let expanded = match expand_path(raw.trim()) {
            Some(p) => PathBuf::from(p),
            None => continue,
        };
        if !expanded.exists() {
            continue;
        }
        let meta = match fs::metadata(&expanded) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.is_file() {
            let abs = expanded.to_string_lossy().to_string();
            if seen.insert(abs.clone()) {
                let rel = expanded
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                results.push((abs, rel));
            }
        } else if meta.is_dir() {
            let mut files = Vec::new();
            collect_files_recursive(&expanded, &expanded, &mut files);
            for (abs_path, rel) in files {
                let abs = abs_path.to_string_lossy().to_string();
                if seen.insert(abs.clone()) {
                    results.push((abs, rel));
                }
            }
        }
    }
    results
}

#[tauri::command]
pub async fn list_save_files(game_id: String) -> Result<Vec<SaveFileDto>, String> {
    let cfg = config::load_config();
    let game = cfg
        .games
        .iter()
        .find(|g| g.id.eq_ignore_ascii_case(&game_id))
        .ok_or_else(|| format!("Juego no encontrado: {}", game_id))?;

    let files = list_all_files_from_paths(&game.paths);
    Ok(files
        .into_iter()
        .map(|(absolute, relative)| SaveFileDto { absolute, relative })
        .collect())
}

async fn api_request(
    base_url: &str,
    user_id: &str,
    api_key: &str,
    method: &str,
    path: &str,
    body: Option<&[u8]>,
) -> Result<reqwest::Response, String> {
    let url = format!("{}/saves{}", base_url.trim_end_matches('/'), path);
    let client = reqwest::Client::builder()
        .user_agent("sync-games-desktop/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client
        .request(method.parse().unwrap(), &url)
        .header("x-user-id", user_id)
        .header("x-api-key", api_key);

    if let Some(b) = body {
        req = req
            .header("Content-Type", "application/json")
            .body(b.to_vec());
    }

    let res = req.send().await.map_err(|e| e.to_string())?;
    Ok(res)
}

#[tauri::command]
pub async fn sync_upload_game(game_id: String) -> Result<SyncResultDto, String> {
    let cfg = config::load_config();
    let api_base = cfg
        .api_base_url
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or("Configura apiBaseUrl en Configuración")?;
    let user_id = cfg
        .user_id
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or("Configura userId en Configuración")?;
    let api_key = cfg.api_key.as_deref().unwrap_or("");

    let game = cfg
        .games
        .iter()
        .find(|g| g.id.eq_ignore_ascii_case(&game_id))
        .ok_or_else(|| format!("Juego no encontrado: {}", game_id))?;

    let files = list_all_files_from_paths(&game.paths);
    if files.is_empty() {
        return Ok(SyncResultDto {
            ok_count: 0,
            err_count: 0,
            errors: vec!["No se encontraron archivos en las rutas del juego".into()],
        });
    }

    let client = reqwest::Client::builder()
        .user_agent("sync-games-desktop/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let mut ok_count = 0u32;
    let mut err_count = 0u32;
    let mut errors = Vec::new();

    for (absolute, relative) in files {
        // 1. Obtener URL de subida
        let body = serde_json::json!({
            "gameId": game_id,
            "filename": relative
        });
        let res = api_request(
            api_base,
            user_id,
            api_key,
            "POST",
            "/upload-url",
            Some(body.to_string().as_bytes()),
        )
        .await
        .map_err(|e| format!("upload-url: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            errors.push(format!("{}: {} ({})", relative, status, text));
            err_count += 1;
            continue;
        }

        let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        let upload_url = json
            .get("uploadUrl")
            .and_then(|v| v.as_str())
            .ok_or("API no devolvió uploadUrl")?;

        // 2. Leer archivo y subir
        let bytes = fs::read(&absolute).map_err(|e| format!("{}: {}", relative, e))?;
        let put_res = client
            .put(upload_url)
            .body(bytes)
            .header("Content-Type", "application/octet-stream")
            .send()
            .await
            .map_err(|e| format!("{}: {}", relative, e))?;

        if !put_res.status().is_success() {
            errors.push(format!("{}: S3 PUT {}", relative, put_res.status()));
            err_count += 1;
        } else {
            ok_count += 1;
        }
    }

    Ok(SyncResultDto {
        ok_count,
        err_count,
        errors,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResultDto {
    pub ok_count: u32,
    pub err_count: u32,
    pub errors: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSaveInfoDto {
    pub game_id: String,
    pub key: String,
    pub filename: String,
    pub last_modified: String,
    pub size: Option<u64>,
}

#[tauri::command]
pub async fn sync_list_remote_saves() -> Result<Vec<RemoteSaveInfoDto>, String> {
    let cfg = config::load_config();
    let api_base = cfg
        .api_base_url
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or("Configura apiBaseUrl en Configuración")?;
    let user_id = cfg
        .user_id
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or("Configura userId en Configuración")?;
    let api_key = cfg.api_key.as_deref().unwrap_or("");

    let res = api_request(api_base, user_id, api_key, "GET", "", None)
        .await
        .map_err(|e| format!("GET /saves: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("API: {} {}", status, text));
    }

    let raw: Vec<RemoteSaveDto> = res.json().await.map_err(|e| e.to_string())?;
    let out: Vec<RemoteSaveInfoDto> = raw
        .into_iter()
        .map(|s| {
            let parts: Vec<&str> = s.key.split('/').collect();
            let filename = if parts.len() >= 3 {
                parts[2..].join("/")
            } else {
                s.key.clone()
            };
            RemoteSaveInfoDto {
                game_id: s.game_id,
                key: s.key,
                filename,
                last_modified: s.last_modified,
                size: s.size,
            }
        })
        .collect();
    Ok(out)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadConflictDto {
    pub filename: String,
    pub local_modified: String,
    pub cloud_modified: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadConflictsResultDto {
    pub conflicts: Vec<DownloadConflictDto>,
}

#[tauri::command]
pub async fn sync_check_download_conflicts(
    game_id: String,
) -> Result<DownloadConflictsResultDto, String> {
    let cfg = config::load_config();
    let game = cfg
        .games
        .iter()
        .find(|g| g.id.eq_ignore_ascii_case(&game_id))
        .ok_or_else(|| format!("Juego no encontrado: {}", game_id))?;

    let dest_base = match expand_path(game.paths[0].trim()) {
        Some(p) => PathBuf::from(p),
        None => return Err("No se pudo expandir la ruta de destino".into()),
    };

    let all = sync_list_remote_saves().await?;
    let saves: Vec<_> = all
        .into_iter()
        .filter(|s| s.game_id.eq_ignore_ascii_case(&game_id))
        .collect();

    let mut conflicts = Vec::new();

    for save in saves {
        let dest_path = dest_base.join(&save.filename);
        let Ok(meta) = fs::metadata(&dest_path) else {
            continue; // archivo no existe localmente, no hay conflicto
        };
        let Ok(local_mtime) = meta.modified() else {
            continue;
        };

        let cloud_dt: DateTime<Utc> = match DateTime::parse_from_rfc3339(&save.last_modified)
            .or_else(|_| DateTime::parse_from_rfc2822(&save.last_modified))
        {
            Ok(dt) => dt.with_timezone(&Utc),
            Err(_) => continue, // no podemos parsear, asumir sin conflicto
        };

        let Ok(duration) = local_mtime.duration_since(UNIX_EPOCH) else {
            continue;
        };
        let Some(local_dt) =
            DateTime::from_timestamp(duration.as_secs() as i64, duration.subsec_nanos())
        else {
            continue;
        };

        if local_dt > cloud_dt {
            conflicts.push(DownloadConflictDto {
                filename: save.filename.clone(),
                local_modified: local_dt.to_rfc3339(),
                cloud_modified: save.last_modified.clone(),
            });
        }
    }

    Ok(DownloadConflictsResultDto { conflicts })
}

#[tauri::command]
pub async fn sync_download_game(game_id: String) -> Result<SyncResultDto, String> {
    let cfg = config::load_config();
    let api_base = cfg
        .api_base_url
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or("Configura apiBaseUrl en Configuración")?;
    let user_id = cfg
        .user_id
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or("Configura userId en Configuración")?;
    let api_key = cfg.api_key.as_deref().unwrap_or("");

    let game = cfg
        .games
        .iter()
        .find(|g| g.id.eq_ignore_ascii_case(&game_id))
        .ok_or_else(|| format!("Juego no encontrado: {}", game_id))?;

    let dest_base = match expand_path(game.paths[0].trim()) {
        Some(p) => PathBuf::from(p),
        None => return Err("No se pudo expandir la ruta de destino".into()),
    };

    let all = sync_list_remote_saves().await?;
    let saves: Vec<_> = all
        .into_iter()
        .filter(|s| s.game_id.eq_ignore_ascii_case(&game_id))
        .collect();

    if saves.is_empty() {
        return Ok(SyncResultDto {
            ok_count: 0,
            err_count: 0,
            errors: vec!["No hay guardados de este juego en la nube".into()],
        });
    }

    let client = reqwest::Client::builder()
        .user_agent("sync-games-desktop/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let mut ok_count = 0u32;
    let mut err_count = 0u32;
    let mut errors = Vec::new();

    for save in saves {
        let body = serde_json::json!({
            "gameId": game_id,
            "key": save.key
        });
        let res = api_request(
            api_base,
            user_id,
            api_key,
            "POST",
            "/download-url",
            Some(body.to_string().as_bytes()),
        )
        .await
        .map_err(|e| format!("download-url: {}", e))?;

        if !res.status().is_success() {
            errors.push(format!("{}: {}", save.filename, res.status()));
            err_count += 1;
            continue;
        }

        let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        let download_url = json
            .get("downloadUrl")
            .and_then(|v| v.as_str())
            .ok_or("API no devolvió downloadUrl")?;

        let bytes = client
            .get(download_url)
            .send()
            .await
            .map_err(|e| format!("{}: {}", save.filename, e))?
            .bytes()
            .await
            .map_err(|e| format!("{}: {}", save.filename, e))?;

        let dest_path = dest_base.join(&save.filename);
        if let Some(parent) = dest_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        match fs::File::create(&dest_path).and_then(|mut f| f.write_all(&bytes)) {
            Ok(_) => ok_count += 1,
            Err(e) => {
                errors.push(format!("{}: {}", save.filename, e));
                err_count += 1;
            }
        }
    }

    Ok(SyncResultDto {
        ok_count,
        err_count,
        errors,
    })
}
