//! Subida multipart a S3 para archivos grandes (pausable/cancelable).
//!
//! Flujo: init → part-urls (por lotes) → PUT cada parte a S3 → complete (o abort si cancel).
//! Si se pide pausa, se guarda estado en disco y se retorna PAUSED para poder reanudar después.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use super::api;
use super::models::SyncProgressPayload;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

/// Mensaje de error cuando la subida se pausó (el caller puede emitir evento y no contar como error).
pub const PAUSED_ERR_MSG: &str = "PAUSED";

const PAUSED_STATE_FILE: &str = "paused_upload.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PausedUploadState {
    pub upload_id: String,
    pub key: String,
    pub game_id: String,
    pub filename: String,
    pub absolute_path: String,
    pub total_size: u64,
    pub completed_parts: Vec<CompletedPartState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletedPartState {
    pub part_number: u32,
    pub etag: String,
}

fn paused_state_path() -> Option<std::path::PathBuf> {
    crate::config::config_dir().map(|d| d.join(PAUSED_STATE_FILE))
}

fn save_paused_state(state: &PausedUploadState) -> Result<(), String> {
    let path = paused_state_path().ok_or("No se pudo obtener directorio de config")?;
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Guardar estado pausado: {}", e))?;
    Ok(())
}

/// Carga el estado de una subida pausada, si existe.
pub fn load_paused_state() -> Option<PausedUploadState> {
    let path = paused_state_path()?;
    let json = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&json).ok()
}

/// Elimina el archivo de estado pausado (tras reanudar con éxito o al cancelar).
pub fn remove_paused_state_file() {
    if let Some(p) = paused_state_path() {
        let _ = std::fs::remove_file(p);
    }
}

/// Tamaño de cada parte (S3 mínimo 5 MiB excepto la última). 10 MiB es un buen equilibrio.
pub(crate) const PART_SIZE: u64 = 10 * 1024 * 1024;

/// Umbral: archivos mayores usan multipart; menores usan PUT simple.
pub(crate) const MULTIPART_THRESHOLD: u64 = 5 * 1024 * 1024;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct MultipartInitResponse {
    upload_id: String,
    key: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PartUrlsRequest {
    key: String,
    upload_id: String,
    part_numbers: Vec<u32>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartUrlItem {
    part_number: u32,
    url: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartUrlsResponse {
    part_urls: Vec<PartUrlItem>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CompleteRequest {
    key: String,
    upload_id: String,
    parts: Vec<CompletedPartReq>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CompletedPartReq {
    part_number: u32,
    etag: String,
}

async fn multipart_init(
    api_base: &str,
    user_id: &str,
    api_key: &str,
    game_id: &str,
    filename: &str,
) -> Result<(String, String), String> {
    let body = serde_json::json!({
        "gameId": game_id,
        "filename": filename
    });
    let res = api::api_request(
        api_base,
        user_id,
        api_key,
        "POST",
        "/multipart/init",
        Some(body.to_string().as_bytes()),
    )
    .await
    .map_err(|e| format!("multipart/init: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("API multipart/init: {} {}", status, text));
    }

    let parsed: MultipartInitResponse =
        res.json().await.map_err(|e| format!("parse init: {}", e))?;
    Ok((parsed.upload_id, parsed.key))
}

async fn multipart_part_urls(
    api_base: &str,
    user_id: &str,
    api_key: &str,
    key: &str,
    upload_id: &str,
    part_numbers: &[u32],
) -> Result<Vec<(u32, String)>, String> {
    if part_numbers.is_empty() {
        return Ok(Vec::new());
    }
    let body = PartUrlsRequest {
        key: key.to_string(),
        upload_id: upload_id.to_string(),
        part_numbers: part_numbers.to_vec(),
    };
    let body_bytes =
        serde_json::to_vec(&body).map_err(|e| format!("serialize part-urls: {}", e))?;
    let res = api::api_request(
        api_base,
        user_id,
        api_key,
        "POST",
        "/multipart/part-urls",
        Some(&body_bytes),
    )
    .await
    .map_err(|e| format!("multipart/part-urls: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("API multipart/part-urls: {} {}", status, text));
    }

    let parsed: PartUrlsResponse = res
        .json()
        .await
        .map_err(|e| format!("parse part-urls: {}", e))?;
    Ok(parsed
        .part_urls
        .into_iter()
        .map(|p| (p.part_number, p.url))
        .collect())
}

async fn multipart_complete(
    api_base: &str,
    user_id: &str,
    api_key: &str,
    key: &str,
    upload_id: &str,
    parts: &[(u32, String)],
) -> Result<(), String> {
    let body = CompleteRequest {
        key: key.to_string(),
        upload_id: upload_id.to_string(),
        parts: parts
            .iter()
            .map(|(n, etag)| CompletedPartReq {
                part_number: *n,
                etag: etag.clone(),
            })
            .collect(),
    };
    let body_bytes = serde_json::to_vec(&body).map_err(|e| format!("serialize complete: {}", e))?;
    let res = api::api_request(
        api_base,
        user_id,
        api_key,
        "POST",
        "/multipart/complete",
        Some(&body_bytes),
    )
    .await
    .map_err(|e| format!("multipart/complete: {}", e))?;

    if !res.status().is_success() && res.status().as_u16() != 204 {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("API multipart/complete: {} {}", status, text));
    }
    Ok(())
}

async fn multipart_abort(
    api_base: &str,
    user_id: &str,
    api_key: &str,
    key: &str,
    upload_id: &str,
) -> Result<(), String> {
    let body = serde_json::json!({ "key": key, "uploadId": upload_id });
    let res = api::api_request(
        api_base,
        user_id,
        api_key,
        "POST",
        "/multipart/abort",
        Some(body.to_string().as_bytes()),
    )
    .await
    .map_err(|e| format!("multipart/abort: {}", e))?;

    if !res.status().is_success() && res.status().as_u16() != 204 {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("API multipart/abort: {} {}", status, text));
    }
    Ok(())
}

/// Sube un archivo mediante multipart. Emite progreso y respeta cancelación entre partes.
///
/// `cancel`: si se proporciona (p. ej. `Arc<TrayStateInner>`), se comprueba entre partes; si está en true se hace abort y se devuelve error.
pub(crate) async fn upload_one_file_multipart(
    absolute_path: &Path,
    relative_filename: &str,
    total_size: u64,
    game_id: &str,
    api_base: &str,
    user_id: &str,
    api_key: &str,
    app: tauri::AppHandle,
    cancel: Option<std::sync::Arc<crate::tray_state::TrayStateInner>>,
) -> Result<(), String> {
    let (upload_id, key) =
        multipart_init(api_base, user_id, api_key, game_id, relative_filename).await?;

    let num_parts = if total_size == 0 {
        0u32
    } else {
        ((total_size + PART_SIZE - 1) / PART_SIZE) as u32
    };

    if num_parts == 0 {
        // Archivo vacío: completar con 0 partes (S3 lo acepta) o usar PUT simple en el caller.
        multipart_complete(api_base, user_id, api_key, &key, &upload_id, &[]).await?;
        let _ = app.emit(
            "sync-upload-progress",
            SyncProgressPayload {
                game_id: game_id.to_string(),
                filename: relative_filename.to_string(),
                loaded: total_size,
                total: total_size,
            },
        );
        return Ok(());
    }

    let client = reqwest::Client::builder()
        .user_agent("sync-games-desktop/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let mut file = File::open(absolute_path).map_err(|e| format!("abrir archivo: {}", e))?;
    let mut completed_parts: Vec<(u32, String)> = Vec::with_capacity(num_parts as usize);

    for part_number in 1..=num_parts {
        if let Some(ref t) = cancel {
            if t.upload_cancel_requested() {
                let _ = multipart_abort(api_base, user_id, api_key, &key, &upload_id).await;
                return Err("Subida cancelada".to_string());
            }
            if t.upload_pause_requested() {
                let state = PausedUploadState {
                    upload_id: upload_id.clone(),
                    key: key.clone(),
                    game_id: game_id.to_string(),
                    filename: relative_filename.to_string(),
                    absolute_path: absolute_path.to_string_lossy().to_string(),
                    total_size,
                    completed_parts: completed_parts
                        .iter()
                        .map(|(n, e)| CompletedPartState {
                            part_number: *n,
                            etag: e.clone(),
                        })
                        .collect(),
                };
                save_paused_state(&state).map_err(|e| format!("guardar pausa: {}", e))?;
                return Err(PAUSED_ERR_MSG.to_string());
            }
        }

        let start = (part_number - 1) as u64 * PART_SIZE;
        let part_len = std::cmp::min(PART_SIZE, total_size.saturating_sub(start));
        let mut buf = vec![0u8; part_len as usize];
        file.read_exact(&mut buf)
            .map_err(|e| format!("leer parte {}: {}", part_number, e))?;

        let part_numbers = vec![part_number];
        let urls = multipart_part_urls(api_base, user_id, api_key, &key, &upload_id, &part_numbers)
            .await?;
        let (_, url) = urls
            .into_iter()
            .next()
            .ok_or("API no devolvió URL para la parte")?;

        let put_res = client
            .put(&url)
            .body(buf)
            .header("Content-Type", "application/octet-stream")
            .send()
            .await
            .map_err(|e| format!("PUT parte {}: {}", part_number, e))?;

        if !put_res.status().is_success() {
            let _ = multipart_abort(api_base, user_id, api_key, &key, &upload_id).await;
            return Err(format!(
                "parte {}: S3 PUT {}",
                part_number,
                put_res.status()
            ));
        }

        let etag = put_res
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();

        completed_parts.push((part_number, etag));

        let loaded = std::cmp::min(start + part_len, total_size);
        let _ = app.emit(
            "sync-upload-progress",
            SyncProgressPayload {
                game_id: game_id.to_string(),
                filename: relative_filename.to_string(),
                loaded,
                total: total_size,
            },
        );

        if let Some(ref t) = cancel {
            if t.upload_pause_requested() {
                let state = PausedUploadState {
                    upload_id: upload_id.clone(),
                    key: key.clone(),
                    game_id: game_id.to_string(),
                    filename: relative_filename.to_string(),
                    absolute_path: absolute_path.to_string_lossy().to_string(),
                    total_size,
                    completed_parts: completed_parts
                        .iter()
                        .map(|(n, e)| CompletedPartState {
                            part_number: *n,
                            etag: e.clone(),
                        })
                        .collect(),
                };
                save_paused_state(&state).map_err(|e| format!("guardar pausa: {}", e))?;
                return Err(PAUSED_ERR_MSG.to_string());
            }
        }
    }

    multipart_complete(
        api_base,
        user_id,
        api_key,
        &key,
        &upload_id,
        &completed_parts,
    )
    .await?;

    Ok(())
}

/// Reanuda una subida multipart desde el estado guardado en disco.
pub(crate) async fn resume_paused_upload(app: tauri::AppHandle) -> Result<(), String> {
    let state = load_paused_state().ok_or("No hay ninguna subida pausada")?;

    let cfg = crate::config::load_config();
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

    let num_parts = if state.total_size == 0 {
        0u32
    } else {
        ((state.total_size + PART_SIZE - 1) / PART_SIZE) as u32
    };

    let completed_set: std::collections::HashSet<u32> = state
        .completed_parts
        .iter()
        .map(|p| p.part_number)
        .collect();
    let remaining: Vec<u32> = (1..=num_parts)
        .filter(|n| !completed_set.contains(n))
        .collect();

    if remaining.is_empty() {
        multipart_complete(
            api_base,
            user_id,
            api_key,
            &state.key,
            &state.upload_id,
            &state
                .completed_parts
                .iter()
                .map(|p| (p.part_number, p.etag.clone()))
                .collect::<Vec<_>>(),
        )
        .await?;
        remove_paused_state_file();
        let _ = app.emit(
            "sync-upload-progress",
            SyncProgressPayload {
                game_id: state.game_id.clone(),
                filename: state.filename.clone(),
                loaded: state.total_size,
                total: state.total_size,
            },
        );
        return Ok(());
    }

    let client = reqwest::Client::builder()
        .user_agent("sync-games-desktop/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let mut file = File::open(&state.absolute_path)
        .map_err(|e| format!("abrir archivo para reanudar: {}", e))?;
    let mut all_parts: Vec<(u32, String)> = state
        .completed_parts
        .iter()
        .map(|p| (p.part_number, p.etag.clone()))
        .collect();

    for part_number in &remaining {
        let start = (*part_number - 1) as u64 * PART_SIZE;
        let part_len = std::cmp::min(PART_SIZE, state.total_size.saturating_sub(start));
        file.seek(SeekFrom::Start(start))
            .map_err(|e| format!("seek parte {}: {}", part_number, e))?;
        let mut buf = vec![0u8; part_len as usize];
        file.read_exact(&mut buf)
            .map_err(|e| format!("leer parte {}: {}", part_number, e))?;

        let part_numbers = vec![*part_number];
        let urls = multipart_part_urls(
            api_base,
            user_id,
            api_key,
            &state.key,
            &state.upload_id,
            &part_numbers,
        )
        .await?;
        let (_, url) = urls
            .into_iter()
            .next()
            .ok_or("API no devolvió URL para la parte")?;

        let put_res = client
            .put(&url)
            .body(buf)
            .header("Content-Type", "application/octet-stream")
            .send()
            .await
            .map_err(|e| format!("PUT parte {}: {}", part_number, e))?;

        if !put_res.status().is_success() {
            return Err(format!(
                "parte {}: S3 PUT {}",
                part_number,
                put_res.status()
            ));
        }

        let etag = put_res
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();

        all_parts.push((*part_number, etag));

        let loaded = std::cmp::min(start + part_len, state.total_size);
        let _ = app.emit(
            "sync-upload-progress",
            SyncProgressPayload {
                game_id: state.game_id.clone(),
                filename: state.filename.clone(),
                loaded,
                total: state.total_size,
            },
        );
    }

    all_parts.sort_by_key(|p| p.0);
    multipart_complete(
        api_base,
        user_id,
        api_key,
        &state.key,
        &state.upload_id,
        &all_parts,
    )
    .await?;

    remove_paused_state_file();
    Ok(())
}
