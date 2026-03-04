//! Cliente HTTP para la API de guardados.

use super::models::SyncResultDto;
use super::models::{RemoteSaveDto, RemoteSaveInfoDto};

pub(crate) async fn api_request(
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

async fn list_remote_saves_for_user(
    api_base: &str,
    api_key: &str,
    user_id: &str,
) -> Result<Vec<RemoteSaveInfoDto>, String> {
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

/// Lista todos los guardados remotos del usuario actual.
#[tauri::command]
pub async fn sync_list_remote_saves() -> Result<Vec<RemoteSaveInfoDto>, String> {
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

    list_remote_saves_for_user(api_base, api_key, user_id).await
}

/// Lista todos los guardados remotos de otro usuario (amigo).
#[tauri::command]
pub async fn sync_list_remote_saves_for_user(
    user_id: String,
) -> Result<Vec<RemoteSaveInfoDto>, String> {
    let cfg = crate::config::load_config();
    let api_base = cfg
        .api_base_url
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or("Configura apiBaseUrl en Configuración")?;
    let api_key = cfg.api_key.as_deref().unwrap_or("");
    let user_id = user_id.trim();
    if user_id.is_empty() {
        return Err("userId vacío".into());
    }
    list_remote_saves_for_user(api_base, api_key, user_id).await
}

/// Copia todos los guardados de un juego desde la cuenta de un amigo a la cuenta actual.
#[tauri::command]
pub async fn copy_friend_saves(
    friend_user_id: String,
    game_id: String,
) -> Result<SyncResultDto, String> {
    let cfg = crate::config::load_config();
    let api_base = cfg
        .api_base_url
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or("Configura apiBaseUrl en Configuración")?;
    let current_user_id = cfg
        .user_id
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or("Configura userId en Configuración")?;
    let api_key = cfg.api_key.as_deref().unwrap_or("");

    let friend_id = friend_user_id.trim();
    if friend_id.is_empty() {
        return Err("friendUserId vacío".into());
    }
    let game_id = game_id.trim().to_string();
    if game_id.is_empty() {
        return Err("gameId vacío".into());
    }

    // 1. Listar todos los saves del amigo para este juego
    let all_saves = list_remote_saves_for_user(api_base, api_key, friend_id).await?;
    let saves: Vec<_> = all_saves
        .into_iter()
        .filter(|s| s.game_id.eq_ignore_ascii_case(&game_id))
        .collect();

    if saves.is_empty() {
        return Ok(SyncResultDto {
            ok_count: 0,
            err_count: 0,
            errors: vec!["El amigo no tiene guardados para este juego".into()],
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
        // 2. Pedir URL de descarga usando el userId del amigo
        let body_download = serde_json::json!({
            "gameId": game_id,
            "key": save.key
        });
        let res_download = api_request(
            api_base,
            friend_id,
            api_key,
            "POST",
            "/download-url",
            Some(body_download.to_string().as_bytes()),
        )
        .await
        .map_err(|e| format!("download-url: {}", e))?;

        if !res_download.status().is_success() {
            errors.push(format!(
                "{}: API download-url {}",
                save.filename,
                res_download.status()
            ));
            err_count += 1;
            continue;
        }

        let json_download: serde_json::Value =
            res_download.json().await.map_err(|e| e.to_string())?;
        let download_url = match json_download.get("downloadUrl").and_then(|v| v.as_str()) {
            Some(u) => u,
            None => {
                errors.push(format!("{}: API no devolvió downloadUrl", save.filename));
                err_count += 1;
                continue;
            }
        };

        // 3. Pedir URL de subida en TU cuenta
        let body_upload = serde_json::json!({
            "gameId": game_id,
            "filename": save.filename
        });
        let res_upload = api_request(
            api_base,
            current_user_id,
            api_key,
            "POST",
            "/upload-url",
            Some(body_upload.to_string().as_bytes()),
        )
        .await
        .map_err(|e| format!("upload-url: {}", e))?;

        if !res_upload.status().is_success() {
            errors.push(format!(
                "{}: API upload-url {}",
                save.filename,
                res_upload.status()
            ));
            err_count += 1;
            continue;
        }

        let json_upload: serde_json::Value = res_upload.json().await.map_err(|e| e.to_string())?;
        let upload_url = match json_upload.get("uploadUrl").and_then(|v| v.as_str()) {
            Some(u) => u,
            None => {
                errors.push(format!("{}: API no devolvió uploadUrl", save.filename));
                err_count += 1;
                continue;
            }
        };

        // 4. Descargar del amigo y subir a tu cuenta
        let bytes = match client.get(download_url).send().await {
            Ok(resp) => match resp.bytes().await {
                Ok(b) => b,
                Err(e) => {
                    errors.push(format!("{}: error leyendo descarga: {}", save.filename, e));
                    err_count += 1;
                    continue;
                }
            },
            Err(e) => {
                errors.push(format!("{}: error HTTP descarga: {}", save.filename, e));
                err_count += 1;
                continue;
            }
        };

        let put_res = match client
            .put(upload_url)
            .body(bytes)
            .header("Content-Type", "application/octet-stream")
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                errors.push(format!("{}: error HTTP subida: {}", save.filename, e));
                err_count += 1;
                continue;
            }
        };

        if !put_res.status().is_success() {
            errors.push(format!("{}: S3 PUT {}", save.filename, put_res.status()));
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
