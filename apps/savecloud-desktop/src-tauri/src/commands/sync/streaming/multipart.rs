//! Subida multipart de archivos grandes a S3 en modo streaming.
//!
//! Implementa la transferencia de archivos directamente desde la fuente
//! de datos sin necesidad de almacenamiento temporal en disco.
//!
//! La configuración del pipeline (tamaño de parte, concurrencia, capacidad
//! del canal) se delega completamente a `upload_strategy::UploadStrategy`,
//! que elige los valores óptimos en función del tamaño estimado del archivo.
//!
//! La concurrencia se ajusta dinámicamente durante la subida a través de
//! `upload_strategy::ConcurrencyController`, que mide el throughput real
//! de las primeras partes completadas y actualiza el número de slots.

use std::collections::HashMap;
use std::sync::LazyLock;
use std::time::Instant;

use tauri::Emitter;

use super::super::api;
use super::super::models::SyncProgressPayload;
use super::super::sync_logger;
use super::tar_stream::TarStreamMsg;
use super::upload_strategy::{ConcurrencyController, UploadStrategy};

/// Número de URLs solicitadas en cada batch al API cuando no están en caché.
const PART_URL_BATCH: u32 = 100;

const MAX_RETRIES: u32 = 3;
const RETRY_DELAY_SECS: u64 = 1;

static S3_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent("SaveCloud-desktop/1.0")
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .expect("Fallo al construir cliente HTTP S3")
});

// Contexto compartido para las operaciones del API.
// Evita repetir los mismos parámetros en cada función auxiliar.
struct UploadCtx<'a> {
    api_base: &'a str,
    user_id: &'a str,
    api_key: &'a str,
    key: &'a str,
    upload_id: &'a str,
}

// Tipos de request/response del API

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

// Helpers de retry y peticiones al API

async fn with_retry<F, Fut, T>(mut op: F) -> Result<T, String>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, String>>,
{
    let mut last_err = String::new();
    for attempt in 0..MAX_RETRIES {
        match op().await {
            Ok(t) => return Ok(t),
            Err(e) => {
                last_err = e.clone();
                if attempt + 1 < MAX_RETRIES {
                    let delay = RETRY_DELAY_SECS * (attempt + 1) as u64;
                    tokio::time::sleep(tokio::time::Duration::from_secs(delay)).await;
                }
            }
        }
    }
    Err(last_err)
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
    let parsed: MultipartInitResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok((parsed.upload_id, parsed.key))
}

async fn multipart_part_urls(
    ctx: &UploadCtx<'_>,
    part_numbers: &[u32],
) -> Result<Vec<(u32, String)>, String> {
    let body = PartUrlsRequest {
        key: ctx.key.to_string(),
        upload_id: ctx.upload_id.to_string(),
        part_numbers: part_numbers.to_vec(),
    };
    let body_bytes = serde_json::to_vec(&body).map_err(|e| e.to_string())?;
    let res = api::api_request(
        ctx.api_base,
        ctx.user_id,
        ctx.api_key,
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
    let parsed: PartUrlsResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(parsed
        .part_urls
        .into_iter()
        .map(|p| (p.part_number, p.url))
        .collect())
}

async fn multipart_complete(ctx: &UploadCtx<'_>, parts: &[(u32, String)]) -> Result<(), String> {
    let body = CompleteRequest {
        key: ctx.key.to_string(),
        upload_id: ctx.upload_id.to_string(),
        parts: parts
            .iter()
            .map(|(n, etag)| CompletedPartReq {
                part_number: *n,
                etag: etag.clone(),
            })
            .collect(),
    };
    let body_bytes = serde_json::to_vec(&body).map_err(|e| e.to_string())?;
    let res = api::api_request(
        ctx.api_base,
        ctx.user_id,
        ctx.api_key,
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

async fn multipart_abort(ctx: &UploadCtx<'_>) -> Result<(), String> {
    let body = serde_json::json!({ "key": ctx.key, "uploadId": ctx.upload_id });
    let res = api::api_request(
        ctx.api_base,
        ctx.user_id,
        ctx.api_key,
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

/// Garantiza que la URL de `part_number` esté en caché, solicitando el siguiente
/// batch si es necesario. Lanza un prefetch especulativo del batch siguiente
/// cuando las URLs disponibles por delante caen bajo `prefetch_threshold`.
async fn ensure_part_urls_cached(
    cache: &mut HashMap<u32, String>,
    ctx: &UploadCtx<'_>,
    part_number: u32,
    prefetch_threshold: u32,
) -> Result<(), String> {
    if !cache.contains_key(&part_number) {
        let batch_end = part_number.saturating_add(PART_URL_BATCH - 1);
        let part_numbers: Vec<u32> = (part_number..=batch_end).collect();
        let urls = with_retry(|| multipart_part_urls(ctx, &part_numbers)).await?;
        for (n, u) in urls {
            cache.insert(n, u);
        }
    }

    // Prefetch especulativo: cuando quedan pocas URLs por delante se solicita
    // el siguiente batch antes de que se agoten, eliminando la espera bloqueante.
    let available_ahead = cache.keys().filter(|&&k| k >= part_number).count() as u32;
    if available_ahead < prefetch_threshold {
        let next_start = part_number + available_ahead;
        let next_end = next_start.saturating_add(PART_URL_BATCH - 1);
        let missing: Vec<u32> = (next_start..=next_end)
            .filter(|n| !cache.contains_key(n))
            .collect();

        if !missing.is_empty() {
            // El error se ignora: si el prefetch falla, la siguiente llamada
            // obligatoria lo reintentará correctamente con backoff.
            if let Ok(urls) = multipart_part_urls(ctx, &missing).await {
                for (n, u) in urls {
                    cache.insert(n, u);
                }
            }
        }
    }

    Ok(())
}

/// Resultado de una tarea de subida de parte.
enum TaskResult {
    Part {
        part_number: u32,
        etag: String,
        bytes_sent: u64,
        elapsed_ms: u128,
    },
    Err(String),
}

/// Normaliza el resultado de `JoinSet::join_next` absorbiendo tanto errores
/// de la tarea como panics del runtime de Tokio.
fn normalize_join_result(
    res: Result<Result<(u32, String, u64, u128), String>, tokio::task::JoinError>,
) -> TaskResult {
    match res {
        Ok(Ok((pn, etag, bytes_sent, elapsed_ms))) => TaskResult::Part {
            part_number: pn,
            etag,
            bytes_sent,
            elapsed_ms,
        },
        Ok(Err(e)) => TaskResult::Err(e),
        Err(e) => TaskResult::Err(format!("Fallo critico en hilo de subida: {}", e)),
    }
}

/// Drena todas las tareas pendientes del JoinSet.
/// En caso de error cancela el resto y llama a `multipart_abort`.
async fn drain_upload_tasks(
    tasks: &mut tokio::task::JoinSet<Result<(u32, String, u64, u128), String>>,
    ctx: &UploadCtx<'_>,
) -> Result<Vec<(u32, String, u64, u128)>, String> {
    let mut collected = Vec::new();
    while let Some(res) = tasks.join_next().await {
        match normalize_join_result(res) {
            TaskResult::Part {
                part_number,
                etag,
                bytes_sent,
                elapsed_ms,
            } => {
                collected.push((part_number, etag, bytes_sent, elapsed_ms));
            }
            TaskResult::Err(e) => {
                tasks.abort_all();
                let _ = multipart_abort(ctx).await;
                return Err(e);
            }
        }
    }
    Ok(collected)
}

/// Recoge sin bloquear las tareas que ya finalizaron.
/// Actualiza `completed_parts`, `loaded` y alimenta el `ConcurrencyController`.
async fn collect_finished_tasks(
    tasks: &mut tokio::task::JoinSet<Result<(u32, String, u64, u128), String>>,
    ctx: &UploadCtx<'_>,
    completed_parts: &mut Vec<(u32, String)>,
    loaded: &mut u64,
    concurrency: &mut ConcurrencyController,
) -> Result<u64, String> {
    let mut newly_loaded: u64 = 0;
    while let Some(res) = tasks.try_join_next() {
        match normalize_join_result(res) {
            TaskResult::Part {
                part_number,
                etag,
                bytes_sent,
                elapsed_ms,
            } => {
                completed_parts.push((part_number, etag));
                *loaded += bytes_sent;
                newly_loaded += bytes_sent;
                concurrency.record_part(bytes_sent, elapsed_ms);
            }
            TaskResult::Err(e) => {
                tasks.abort_all();
                let _ = multipart_abort(ctx).await;
                return Err(e);
            }
        }
    }
    Ok(newly_loaded)
}

/// Espera a que un slot se libere cuando se alcanza el límite de concurrencia actual.
async fn wait_for_one_slot(
    tasks: &mut tokio::task::JoinSet<Result<(u32, String, u64, u128), String>>,
    ctx: &UploadCtx<'_>,
    completed_parts: &mut Vec<(u32, String)>,
    loaded: &mut u64,
    concurrency: &mut ConcurrencyController,
) -> Result<u64, String> {
    if tasks.len() < concurrency.current() {
        return Ok(0);
    }
    if let Some(res) = tasks.join_next().await {
        match normalize_join_result(res) {
            TaskResult::Part {
                part_number,
                etag,
                bytes_sent,
                elapsed_ms,
            } => {
                completed_parts.push((part_number, etag));
                *loaded += bytes_sent;
                concurrency.record_part(bytes_sent, elapsed_ms);
                return Ok(bytes_sent);
            }
            TaskResult::Err(e) => {
                tasks.abort_all();
                let _ = multipart_abort(ctx).await;
                return Err(e);
            }
        }
    }
    Ok(0)
}

/// Sube un archivo a S3 mediante multipart upload en modo streaming.
///
/// La estrategia (tamaño de parte, concurrencia inicial, capacidad del canal)
/// se calcula a partir de `estimated_total` usando `UploadStrategy::for_file`.
/// La concurrencia se ajusta automáticamente tras las primeras partes completadas.
pub(crate) async fn upload_tar_stream_multipart(
    mut rx: tokio::sync::mpsc::Receiver<TarStreamMsg>,
    game_id: &str,
    relative_filename: &str,
    estimated_total: u64,
    api_base: &str,
    user_id: &str,
    api_key: &str,
    app: tauri::AppHandle,
    cancel: Option<std::sync::Arc<crate::tray_state::TrayStateInner>>,
) -> Result<(), String> {
    let strategy = UploadStrategy::for_file(estimated_total);
    let mut concurrency = ConcurrencyController::new(&strategy);

    let (upload_id, key) =
        with_retry(|| multipart_init(api_base, user_id, api_key, game_id, relative_filename))
            .await?;

    let ctx = UploadCtx {
        api_base,
        user_id,
        api_key,
        key: &key,
        upload_id: &upload_id,
    };
    let log_ctx = format!(
        "gameId={} filename={} (streaming) strategy=[{}]",
        game_id,
        relative_filename,
        strategy.describe(),
    );
    sync_logger::log_operation("full_backup_streaming_start", &log_ctx);

    let mut part_urls_cache: HashMap<u32, String> = HashMap::new();
    let mut part_number: u32 = 1;
    let mut part_buf: Vec<u8> = Vec::with_capacity(strategy.part_size);

    let mut completed_parts: Vec<(u32, String)> = Vec::new();
    let mut loaded: u64 = 0;

    let mut upload_tasks: tokio::task::JoinSet<Result<(u32, String, u64, u128), String>> =
        tokio::task::JoinSet::new();

    let _ = app.emit(
        "sync-upload-progress",
        SyncProgressPayload {
            game_id: game_id.to_string(),
            filename: format!("{} (stream)", relative_filename),
            loaded: 0,
            total: estimated_total,
        },
    );

    while let Some(msg) = rx.recv().await {
        if let Some(ref t) = cancel {
            if t.upload_cancel_requested() {
                upload_tasks.abort_all();
                let _ = multipart_abort(&ctx).await;
                return Err("Subida cancelada".to_string());
            }
            if t.upload_pause_requested() {
                upload_tasks.abort_all();
                let _ = multipart_abort(&ctx).await;
                return Err("Pausa no soportada en backups streaming (usa Cancelar).".to_string());
            }
        }

        let newly_loaded = collect_finished_tasks(
            &mut upload_tasks,
            &ctx,
            &mut completed_parts,
            &mut loaded,
            &mut concurrency,
        )
        .await?;

        if newly_loaded > 0 {
            let _ = app.emit(
                "sync-upload-progress",
                SyncProgressPayload {
                    game_id: game_id.to_string(),
                    filename: format!("{} (stream)", relative_filename),
                    loaded,
                    total: estimated_total,
                },
            );
        }

        match msg {
            TarStreamMsg::Chunk(bytes) => {
                let mut offset = 0usize;
                while offset < bytes.len() {
                    let remaining = strategy.part_size - part_buf.len();
                    let take = std::cmp::min(remaining, bytes.len() - offset);
                    part_buf.extend_from_slice(&bytes[offset..offset + take]);
                    offset += take;

                    if part_buf.len() == strategy.part_size {
                        ensure_part_urls_cached(
                            &mut part_urls_cache,
                            &ctx,
                            part_number,
                            strategy.prefetch_threshold,
                        )
                        .await?;

                        let url = part_urls_cache
                            .remove(&part_number)
                            .ok_or_else(|| format!("Falta URL para parte {}", part_number))?;

                        // `Bytes::from(Vec)` transfiere la propiedad sin copiar.
                        // `Bytes::clone` es O(1) (Arc interno), seguro dentro del closure de retry.
                        let bytes_to_send = bytes::Bytes::from(std::mem::take(&mut part_buf));
                        part_buf = Vec::with_capacity(strategy.part_size);

                        let slot_bytes = wait_for_one_slot(
                            &mut upload_tasks,
                            &ctx,
                            &mut completed_parts,
                            &mut loaded,
                            &mut concurrency,
                        )
                        .await?;

                        if slot_bytes > 0 {
                            let _ = app.emit(
                                "sync-upload-progress",
                                SyncProgressPayload {
                                    game_id: game_id.to_string(),
                                    filename: format!("{} (stream)", relative_filename),
                                    loaded,
                                    total: estimated_total,
                                },
                            );
                        }

                        let pn = part_number;
                        upload_tasks.spawn(async move {
                            with_retry(|| {
                                let url = url.clone();
                                let b = bytes_to_send.clone();
                                async move { put_part(url, pn, b).await }
                            })
                            .await
                        });

                        part_number += 1;
                    }
                }
            }
            TarStreamMsg::Err(e) => {
                upload_tasks.abort_all();
                let _ = multipart_abort(&ctx).await;
                sync_logger::log_error("full_backup_streaming_error", &log_ctx, &e);
                return Err(e);
            }
            TarStreamMsg::Done => break,
        }
    }

    // Subir la última parte si quedaron bytes sin enviar (tamaño < part_size).
    if !part_buf.is_empty() {
        ensure_part_urls_cached(
            &mut part_urls_cache,
            &ctx,
            part_number,
            strategy.prefetch_threshold,
        )
        .await?;

        let url = part_urls_cache
            .remove(&part_number)
            .ok_or_else(|| format!("Falta URL para parte {}", part_number))?;

        let bytes_to_send = bytes::Bytes::from(std::mem::take(&mut part_buf));
        let pn = part_number;
        upload_tasks.spawn(async move {
            with_retry(|| {
                let url = url.clone();
                let b = bytes_to_send.clone();
                async move { put_part(url, pn, b).await }
            })
            .await
        });
    }

    // Drenar todas las tareas restantes propagando cualquier error.
    let remaining = drain_upload_tasks(&mut upload_tasks, &ctx).await?;
    for (pn, etag, bytes_sent, elapsed_ms) in remaining {
        completed_parts.push((pn, etag));
        loaded += bytes_sent;
        concurrency.record_part(bytes_sent, elapsed_ms);
    }

    let _ = app.emit(
        "sync-upload-progress",
        SyncProgressPayload {
            game_id: game_id.to_string(),
            filename: format!("{} (stream)", relative_filename),
            loaded,
            total: estimated_total,
        },
    );

    completed_parts.sort_by_key(|p| p.0);
    with_retry(|| multipart_complete(&ctx, &completed_parts)).await?;

    let final_ctx = format!(
        "{} | parts={} bytes={} concurrency=[{}]",
        log_ctx,
        completed_parts.len(),
        loaded,
        concurrency.describe(),
    );
    sync_logger::log_operation("full_backup_streaming_complete", &final_ctx);

    Ok(())
}

/// Dry-run: consume el stream de TAR y emite progreso sin subir nada a la nube.
///
/// El emit de progreso está throttleado a una vez por `strategy.part_size` bytes
/// para alinear la frecuencia de eventos con el path de subida real.
pub(crate) async fn upload_tar_stream_multipart_dry_run(
    mut rx: tokio::sync::mpsc::Receiver<TarStreamMsg>,
    game_id: &str,
    relative_filename: &str,
    estimated_total: u64,
    app: tauri::AppHandle,
    cancel: Option<std::sync::Arc<crate::tray_state::TrayStateInner>>,
) -> Result<(), String> {
    let strategy = UploadStrategy::for_file(estimated_total);

    let ctx = format!(
        "gameId={} filename={} (streaming dry-run) strategy=[{}]",
        game_id,
        relative_filename,
        strategy.describe(),
    );
    sync_logger::log_operation("full_backup_streaming_dry_run_start", &ctx);

    let mut loaded: u64 = 0;
    let mut last_emitted: u64 = 0;

    let _ = app.emit(
        "sync-upload-progress",
        SyncProgressPayload {
            game_id: game_id.to_string(),
            filename: format!("{} (stream dry-run)", relative_filename),
            loaded: 0,
            total: estimated_total,
        },
    );

    while let Some(msg) = rx.recv().await {
        if let Some(ref t) = cancel {
            if t.upload_cancel_requested() {
                let cancel_ctx = format!("{} | cancelled_after_bytes={}", ctx, loaded);
                sync_logger::log_operation("full_backup_streaming_dry_run_cancelled", &cancel_ctx);
                return Err("Subida de prueba cancelada".to_string());
            }
            if t.upload_pause_requested() {
                let pause_ctx = format!("{} | pause_requested_bytes={}", ctx, loaded);
                sync_logger::log_operation(
                    "full_backup_streaming_dry_run_pause_ignored",
                    &pause_ctx,
                );
            }
        }

        match msg {
            TarStreamMsg::Chunk(bytes) => {
                loaded += bytes.len() as u64;

                // Throttle: emitir solo cuando se acumula al menos part_size bytes
                // desde el último emit, alineando la frecuencia con el path real.
                if loaded - last_emitted >= strategy.part_size as u64 {
                    last_emitted = loaded;
                    let _ = app.emit(
                        "sync-upload-progress",
                        SyncProgressPayload {
                            game_id: game_id.to_string(),
                            filename: format!("{} (stream dry-run)", relative_filename),
                            loaded,
                            total: estimated_total,
                        },
                    );
                }
            }
            TarStreamMsg::Err(e) => {
                sync_logger::log_error("full_backup_streaming_dry_run_error", &ctx, &e);
                return Err(e);
            }
            TarStreamMsg::Done => break,
        }
    }

    // Emit final para garantizar que el frontend refleja el 100%
    // aunque el último chunk no haya alcanzado el umbral del throttle.
    let _ = app.emit(
        "sync-upload-progress",
        SyncProgressPayload {
            game_id: game_id.to_string(),
            filename: format!("{} (stream dry-run)", relative_filename),
            loaded,
            total: estimated_total,
        },
    );

    let final_ctx = format!("{} | bytes={}", ctx, loaded);
    sync_logger::log_operation("full_backup_streaming_dry_run_complete", &final_ctx);
    Ok(())
}

/// Sube una parte a S3 mediante PUT y devuelve el número de parte, ETag,
/// bytes enviados y tiempo transcurrido en milisegundos.
///
/// El tiempo se usa en `ConcurrencyController` para ajustar la concurrencia
/// basándose en el throughput real medido, no en estimaciones estáticas.
async fn put_part(
    url: String,
    part_number: u32,
    bytes: bytes::Bytes,
) -> Result<(u32, String, u64, u128), String> {
    let len = bytes.len() as u64;
    let start = Instant::now();

    let res = S3_CLIENT
        .put(&url)
        .body(bytes)
        .header("Content-Type", "application/octet-stream")
        .send()
        .await
        .map_err(|e| format!("PUT parte {}: {}", part_number, e))?;

    if !res.status().is_success() {
        return Err(format!("parte {}: S3 PUT {}", part_number, res.status()));
    }

    let elapsed_ms = start.elapsed().as_millis();
    let throughput_mbps = if elapsed_ms > 0 {
        (len as f64 * 8.0) / (elapsed_ms as f64 / 1000.0) / 1_000_000.0
    } else {
        0.0
    };

    sync_logger::log_operation(
        "put_part_timing",
        &format!(
            "part={} size_mb={:.1} elapsed_ms={} throughput_mbps={:.1}",
            part_number,
            len as f64 / (1024.0 * 1024.0),
            elapsed_ms,
            throughput_mbps,
        ),
    );

    let etag = res
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    Ok((part_number, etag, len, elapsed_ms))
}
