//! Subida de guardados a la nube.

use std::collections::HashMap;
use std::fs;
use std::io::Read;

use super::api;
use super::models::{GameSyncResultDto, SyncProgressPayload, SyncResultDto};
use super::path_utils;
use crate::tray_state::TrayState;
use bytes::Bytes;
use futures_util::stream::{self, Stream, StreamExt};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;

/// Emitir progreso cada N bytes para no saturar el frontend.
const PROGRESS_CHUNK_BYTES: usize = 256 * 1024;

/// Stream que recibe chunks de un canal (llenado por un hilo que lee el archivo).
struct FileProgressStream {
    rx: mpsc::Receiver<Result<Bytes, std::io::Error>>,
}

impl Stream for FileProgressStream {
    type Item = Result<Bytes, std::io::Error>;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        self.rx.poll_recv(cx)
    }
}

/// Crea un stream que lee el archivo en chunks y emite progreso. El stream se consume al hacer el PUT.
fn file_stream_with_progress(
    absolute: &std::path::Path,
    total: u64,
    app: AppHandle,
    game_id: String,
    filename: String,
) -> Result<FileProgressStream, String> {
    let (tx, rx) = mpsc::channel::<Result<Bytes, std::io::Error>>(2);
    let absolute = absolute.to_path_buf();
    std::thread::spawn(move || {
        let file = match fs::File::open(&absolute) {
            Ok(f) => f,
            Err(e) => {
                let _ = tx.blocking_send(Err(e));
                return;
            }
        };
        let mut reader = file;
        let mut loaded: u64 = 0;
        let mut last_emit: u64 = 0;
        let mut buf = vec![0u8; PROGRESS_CHUNK_BYTES];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    loaded += n as u64;
                    if loaded - last_emit >= PROGRESS_CHUNK_BYTES as u64
                        || (total > 0 && loaded >= total)
                    {
                        last_emit = loaded;
                        let _ = app.emit(
                            "sync-upload-progress",
                            SyncProgressPayload {
                                game_id: game_id.clone(),
                                filename: filename.clone(),
                                loaded,
                                total,
                            },
                        );
                    }
                    let chunk = Bytes::from(buf[..n].to_vec());
                    if tx.blocking_send(Ok(chunk)).is_err() {
                        break;
                    }
                }
                Err(e) => {
                    let _ = tx.blocking_send(Err(e));
                    break;
                }
            }
        }
        if loaded > 0 && loaded < total {
            let _ = app.emit(
                "sync-upload-progress",
                SyncProgressPayload {
                    game_id,
                    filename,
                    loaded: total,
                    total,
                },
            );
        }
    });
    Ok(FileProgressStream { rx })
}

#[tauri::command]
pub async fn sync_upload_game(
    game_id: String,
    app: AppHandle,
    tray_state: State<'_, TrayState>,
) -> Result<SyncResultDto, String> {
    tray_state.0.syncing_inc();
    tray_state.0.update_tooltip();

    let result = sync_upload_game_impl(game_id, app.clone()).await;

    tray_state.0.syncing_dec();
    tray_state.0.clone().refresh_unsynced_async();

    let _ = app.emit("sync-upload-done", ());
    result
}

pub(crate) async fn sync_upload_game_impl(
    game_id: String,
    app: AppHandle,
) -> Result<SyncResultDto, String> {
    let cfg = crate::config::load_config();
    let game = cfg
        .games
        .iter()
        .find(|g| g.id.eq_ignore_ascii_case(&game_id))
        .ok_or_else(|| format!("Juego no encontrado: {}", game_id))?;

    if crate::process_check::is_game_running(&game_id, &game.paths) {
        return Err(format!(
            "El juego está en ejecución. Cierra {} antes de sincronizar para evitar archivos bloqueados.",
            game.id
        ));
    }

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

    let files = path_utils::list_all_files_from_paths(&game.paths);
    if files.is_empty() {
        return Ok(SyncResultDto {
            ok_count: 0,
            err_count: 0,
            errors: vec!["No se encontraron archivos en las rutas del juego".into()],
        });
    }

    let filenames: Vec<String> = files.iter().map(|(_, r)| r.clone()).collect();
    let upload_urls = api::get_upload_urls(api_base, user_id, api_key, &game_id, &filenames)
        .await
        .map_err(|e| format!("upload-urls: {}", e))?;
    if upload_urls.len() != files.len() {
        return Err(format!(
            "API devolvió {} URLs para {} archivos",
            upload_urls.len(),
            files.len()
        ));
    }

    let client = reqwest::Client::builder()
        .user_agent("sync-games-desktop/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let mut ok_count = 0u32;
    let mut err_count = 0u32;
    let mut errors = Vec::new();

    for ((absolute, relative), (upload_url, _)) in files.into_iter().zip(upload_urls) {
        let total = fs::metadata(&absolute)
            .map_err(|e| format!("{}: {}", relative, e))?
            .len();
        let body_stream = file_stream_with_progress(
            std::path::Path::new(absolute.as_str()),
            total,
            app.clone(),
            game_id.clone(),
            relative.clone(),
        )?;
        let body = reqwest::Body::wrap_stream(body_stream);
        let put_res = client
            .put(&upload_url)
            .body(body)
            .header("Content-Type", "application/octet-stream")
            .header("Content-Length", total.to_string())
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

    let result = SyncResultDto {
        ok_count,
        err_count,
        errors,
    };

    // Registrar en historial (errores o éxito).
    let _ =
        crate::config::append_operation_log("upload", &game_id, result.ok_count, result.err_count);

    Ok(result)
}

/// Número de juegos que se suben en paralelo en "subir todos".
const UPLOAD_BATCH_CONCURRENCY: usize = 4;

/// Sube los guardados de todos los juegos configurados (operación batch, varios juegos en paralelo).
#[tauri::command]
pub async fn sync_upload_all_games(
    app: AppHandle,
    tray_state: State<'_, TrayState>,
) -> Result<Vec<GameSyncResultDto>, String> {
    let cfg = crate::config::load_config();
    let _ = cfg
        .api_base_url
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or("Configura apiBaseUrl en Configuración")?;
    let _ = cfg
        .user_id
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or("Configura userId en Configuración")?;

    tray_state.0.syncing_inc();
    tray_state.0.update_tooltip();

    let mut results_by_id: HashMap<String, GameSyncResultDto> = HashMap::new();
    for game in &cfg.games {
        if crate::process_check::is_game_running(&game.id, &game.paths) {
            let game_id = game.id.clone();
            results_by_id.insert(
                game_id.clone(),
                GameSyncResultDto {
                    game_id,
                    result: SyncResultDto {
                        ok_count: 0,
                        err_count: 1,
                        errors: vec![format!(
                            "{} está en ejecución. Ciérralo antes de sincronizar.",
                            game.id
                        )],
                    },
                },
            );
        }
    }

    let to_sync: Vec<String> = cfg
        .games
        .iter()
        .filter(|g| !results_by_id.contains_key(&g.id))
        .map(|g| g.id.clone())
        .collect();

    let completed: Vec<(String, Result<SyncResultDto, String>)> = stream::iter(to_sync)
        .map(|game_id| {
            let app = app.clone();
            async move {
                let r = sync_upload_game_impl(game_id.clone(), app).await;
                (game_id, r)
            }
        })
        .buffer_unordered(UPLOAD_BATCH_CONCURRENCY)
        .collect()
        .await;

    for (game_id, r) in completed {
        let result = match r {
            Ok(x) => x,
            Err(e) => SyncResultDto {
                ok_count: 0,
                err_count: 1,
                errors: vec![e],
            },
        };
        results_by_id.insert(game_id.clone(), GameSyncResultDto { game_id, result });
    }

    let results: Vec<GameSyncResultDto> = cfg
        .games
        .iter()
        .map(|g| results_by_id.get(&g.id).cloned().expect("result per game"))
        .collect();

    tray_state.0.syncing_dec();
    tray_state.0.clone().refresh_unsynced_async();

    let _ = app.emit("sync-upload-done", ());

    Ok(results)
}
