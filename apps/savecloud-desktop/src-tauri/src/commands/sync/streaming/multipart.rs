//! Subida multipart de archivos grandes a S3 en modo streaming.
//!
//! Implementa la transferencia de archivos directamente desde la fuente
//! de datos sin necesidad de almacenamiento temporal en disco.
//!
//! Utiliza multipart upload para dividir el flujo en partes manejables,
//! optimizando el uso de memoria y permitiendo la subida de archivos
//! de gran tamaño de forma eficiente.
//!
//! Incluye soporte para control de flujo, manejo de errores y reintentos
//! en operaciones críticas.
//!
//! Consideraciones de diseño:
//!
//!   Backpressure: la capacidad del canal entre el hilo TAR y este módulo debe ser
//!   TAR_CHANNEL_CAPACITY (ver tar_stream.rs). Esto limita la memoria
//!   en tránsito a ~una parte de 32 MB independientemente de la velocidad del disco.
//!
//!   Prefetch de URLs: cuando la caché tiene menos de PART_URL_PREFETCH_THRESHOLD URLs
//!   disponibles, se solicita el siguiente batch de forma anticipada para que las URLs
//!   estén listas antes de que el buffer de la parte actual se llene.
//!
//!   Dry-run throttle: el emit de progreso se limita a una vez por PART_SIZE bytes
//!   procesados, alineándolo con la frecuencia del path de subida real y evitando
//!   miles de cruces Rust→JS por backup.

use std::collections::HashMap;
use std::sync::LazyLock;

use tauri::Emitter;

use super::super::api;
use super::super::models::SyncProgressPayload;
use super::super::sync_logger;
use super::tar_stream::TarStreamMsg;

/// Tamaño mínimo de parte según la especificación de S3 (excepto la última).
/// 32 MB reduce el número total de partes en backups grandes y minimiza
/// la sobrecarga de peticiones HTTP al API de presigned URLs.
const PART_SIZE: usize = 32 * 1024 * 1024;

/// Número de URLs solicitadas en cada batch al API.
const PART_URL_BATCH: u32 = 100;

/// Cuando la caché tiene menos URLs disponibles que este umbral,
/// se lanza un prefetch del siguiente batch de forma anticipada.
const PART_URL_PREFETCH_THRESHOLD: u32 = 20;

const MAX_RETRIES: u32 = 3;
const RETRY_DELAY_SECS: u64 = 1;

/// Número máximo de partes subiéndose concurrentemente.
/// Con 4 partes de 32 MB el consumo máximo aproximado es ~128 MB de RAM,
/// lo que previene el agotamiento de memoria en equipos con red lenta.
const MAX_CONCURRENT_PARTS: usize = 4;

static S3_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent("SaveCloud-desktop/1.0")
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .expect("Fallo al construir cliente HTTP S3")
});

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

// Contexto compartido para las operaciones del API, evita repetir
// los mismos parámetros en cada llamada a funciones auxiliares.
struct UploadCtx<'a> {
    api_base: &'a str,
    user_id: &'a str,
    api_key: &'a str,
    key: &'a str,
    upload_id: &'a str,
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
/// batch si es necesario. Adicionalmente, cuando la cantidad de URLs disponibles
/// cae por debajo de `PART_URL_PREFETCH_THRESHOLD`, lanza un fetch anticipado del
/// batch siguiente para que las URLs estén listas antes de que se necesiten.
async fn ensure_part_urls_cached(
    cache: &mut HashMap<u32, String>,
    ctx: &UploadCtx<'_>,
    part_number: u32,
) -> Result<(), String> {
    if !cache.contains_key(&part_number) {
        let batch_end = part_number.saturating_add(PART_URL_BATCH - 1);
        let part_numbers: Vec<u32> = (part_number..=batch_end).collect();
        let urls = with_retry(|| multipart_part_urls(ctx, &part_numbers)).await?;
        for (n, u) in urls {
            cache.insert(n, u);
        }
    }

    // Prefetch especulativo: si quedan pocas URLs en caché (contando solo las
    // que están por delante del número de parte actual), solicitamos el siguiente
    // batch antes de que se agoten para eliminar la espera bloqueante.
    let available_ahead = cache.keys().filter(|&&k| k >= part_number).count() as u32;

    if available_ahead < PART_URL_PREFETCH_THRESHOLD {
        let next_batch_start = part_number + available_ahead;
        let next_batch_end = next_batch_start.saturating_add(PART_URL_BATCH - 1);
        let missing: Vec<u32> = (next_batch_start..=next_batch_end)
            .filter(|n| !cache.contains_key(n))
            .collect();

        if !missing.is_empty() {
            // Ignoramos el error: si el prefetch falla, la siguiente llamada
            // obligatoria lo reintentará correctamente.
            if let Ok(urls) = multipart_part_urls(ctx, &missing).await {
                for (n, u) in urls {
                    cache.insert(n, u);
                }
            }
        }
    }

    Ok(())
}

async fn put_part(
    url: String,
    part_number: u32,
    bytes: bytes::Bytes,
) -> Result<(u32, String, u64), String> {
    let len = bytes.len() as u64;
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
    let etag = res
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    Ok((part_number, etag, len))
}

// Helpers para el manejo uniforme del JoinSet

/// Resultado normalizado de una tarea de subida.
enum TaskResult {
    Part {
        part_number: u32,
        etag: String,
        bytes_sent: u64,
    },
    Err(String),
}

/// Convierte el resultado de `JoinSet::join_next` en un `TaskResult` uniforme,
/// absorbiendo tanto errores de la tarea como panics del hilo de Tokio.
fn normalize_join_result(
    res: Result<Result<(u32, String, u64), String>, tokio::task::JoinError>,
) -> TaskResult {
    match res {
        Ok(Ok((pn, etag, bytes_sent))) => TaskResult::Part {
            part_number: pn,
            etag,
            bytes_sent,
        },
        Ok(Err(e)) => TaskResult::Err(e),
        Err(e) => TaskResult::Err(format!("Fallo critico en hilo de subida: {}", e)),
    }
}

/// Drena todas las tareas pendientes del JoinSet y llama a abort en S3 si alguna falla.
/// Devuelve los pares (part_number, etag, bytes_sent) de las tareas que completaron con éxito
/// antes del fallo, o el primer error encontrado.
///
/// Si `abort_on_err` es true, llama a `multipart_abort` y cancela el resto del JoinSet
/// en cuanto encuentra el primer error.
async fn drain_upload_tasks(
    tasks: &mut tokio::task::JoinSet<Result<(u32, String, u64), String>>,
    ctx: &UploadCtx<'_>,
) -> Result<Vec<(u32, String, u64)>, String> {
    let mut collected = Vec::new();
    while let Some(res) = tasks.join_next().await {
        match normalize_join_result(res) {
            TaskResult::Part {
                part_number,
                etag,
                bytes_sent,
            } => {
                collected.push((part_number, etag, bytes_sent));
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

/// Recoge las tareas que ya finalizaron sin bloquear (non-blocking poll).
/// Útil para actualizar el progreso durante el loop de recepción de chunks
/// sin detener la producción del TAR.
async fn collect_finished_tasks(
    tasks: &mut tokio::task::JoinSet<Result<(u32, String, u64), String>>,
    ctx: &UploadCtx<'_>,
    completed_parts: &mut Vec<(u32, String)>,
    loaded: &mut u64,
) -> Result<u64, String> {
    let mut newly_loaded: u64 = 0;
    while let Some(res) = tasks.try_join_next() {
        match normalize_join_result(res) {
            TaskResult::Part {
                part_number,
                etag,
                bytes_sent,
            } => {
                completed_parts.push((part_number, etag));
                *loaded += bytes_sent;
                newly_loaded += bytes_sent;
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

/// Espera a que una tarea concurrente termine cuando se alcanza `MAX_CONCURRENT_PARTS`.
/// Bloquea el loop hasta liberar un slot para la siguiente parte.
async fn wait_for_one_slot(
    tasks: &mut tokio::task::JoinSet<Result<(u32, String, u64), String>>,
    ctx: &UploadCtx<'_>,
    completed_parts: &mut Vec<(u32, String)>,
    loaded: &mut u64,
) -> Result<u64, String> {
    if tasks.len() < MAX_CONCURRENT_PARTS {
        return Ok(0);
    }
    if let Some(res) = tasks.join_next().await {
        match normalize_join_result(res) {
            TaskResult::Part {
                part_number,
                etag,
                bytes_sent,
            } => {
                completed_parts.push((part_number, etag));
                *loaded += bytes_sent;
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

// Funciones públicas del módulo

/// Sube un backup completo en modo streaming:
/// - recibe chunks desde el canal TAR
/// - acumula partes de PART_SIZE
/// - las sube concurrentemente a S3 mediante multipart upload
///
/// La concurrencia está limitada a MAX_CONCURRENT_PARTS para controlar
/// el uso de memoria. El canal entre el hilo TAR y esta función aplica
/// backpressure natural cuando todos los slots de subida están ocupados.
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
        "gameId={} filename={} (streaming)",
        game_id, relative_filename
    );
    sync_logger::log_operation("full_backup_streaming_start", &log_ctx);

    let mut part_urls_cache: HashMap<u32, String> = HashMap::new();
    let mut part_number: u32 = 1;
    let mut part_buf: Vec<u8> = Vec::with_capacity(PART_SIZE);

    let mut completed_parts: Vec<(u32, String)> = Vec::new();
    let mut loaded: u64 = 0;

    let mut upload_tasks: tokio::task::JoinSet<Result<(u32, String, u64), String>> =
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
        // Verificar cancelación y pausa antes de procesar cada mensaje.
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

        // Recoger tareas que ya terminaron sin bloquear el loop.
        // Si alguna falló, `collect_finished_tasks` llama a abort y retorna error.
        let newly_loaded =
            collect_finished_tasks(&mut upload_tasks, &ctx, &mut completed_parts, &mut loaded)
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
                    let remaining = PART_SIZE - part_buf.len();
                    let take = std::cmp::min(remaining, bytes.len() - offset);
                    part_buf.extend_from_slice(&bytes[offset..offset + take]);
                    offset += take;

                    if part_buf.len() == PART_SIZE {
                        // Asegurar URL disponible (con prefetch especulativo incluido).
                        ensure_part_urls_cached(&mut part_urls_cache, &ctx, part_number).await?;

                        let url = part_urls_cache
                            .remove(&part_number)
                            .ok_or_else(|| format!("Falta URL para parte {}", part_number))?;

                        // `Bytes::from(Vec)` no copia; transfiere la propiedad del buffer.
                        let bytes_to_send = bytes::Bytes::from(std::mem::take(&mut part_buf));
                        part_buf = Vec::with_capacity(PART_SIZE);

                        // Si todos los slots están ocupados, esperamos a que libere uno.
                        // Esto aplica backpressure desde la red hacia el loop de chunks.
                        let slot_bytes = wait_for_one_slot(
                            &mut upload_tasks,
                            &ctx,
                            &mut completed_parts,
                            &mut loaded,
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
                        // `bytes_to_send` es `Bytes` (Arc interno): clone es O(1),
                        // no copia los datos del buffer. Lo mismo aplica a `url`.
                        upload_tasks.spawn(async move {
                            with_retry(|| put_part(url.clone(), pn, bytes_to_send.clone())).await
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

    // Subir la última parte si quedaron bytes sin enviar (tamaño < PART_SIZE).
    if !part_buf.is_empty() {
        ensure_part_urls_cached(&mut part_urls_cache, &ctx, part_number).await?;

        let url = part_urls_cache
            .remove(&part_number)
            .ok_or_else(|| format!("Falta URL para parte {}", part_number))?;

        let bytes_to_send = bytes::Bytes::from(std::mem::take(&mut part_buf));
        let pn = part_number;
        upload_tasks.spawn(async move {
            with_retry(|| put_part(url.clone(), pn, bytes_to_send.clone())).await
        });
    }

    // Drenar todas las tareas restantes, propagando cualquier error y
    // actualizando el progreso con los bytes confirmados.
    let remaining = drain_upload_tasks(&mut upload_tasks, &ctx).await?;
    for (pn, etag, bytes_sent) in remaining {
        completed_parts.push((pn, etag));
        loaded += bytes_sent;
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
        "{} | parts={} bytes={}",
        log_ctx,
        completed_parts.len(),
        loaded
    );
    sync_logger::log_operation("full_backup_streaming_complete", &final_ctx);

    Ok(())
}

/// Dry-run: consume el stream de TAR y emite progreso sin subir nada a la nube.
///
/// El emit de progreso está throttleado a una vez por PART_SIZE bytes procesados
/// para alinear la frecuencia de eventos con el path de subida real y evitar
/// miles de cruces Rust→JS que ralentizaban esta función más que el path real.
pub(crate) async fn upload_tar_stream_multipart_dry_run(
    mut rx: tokio::sync::mpsc::Receiver<TarStreamMsg>,
    game_id: &str,
    relative_filename: &str,
    estimated_total: u64,
    app: tauri::AppHandle,
    cancel: Option<std::sync::Arc<crate::tray_state::TrayStateInner>>,
) -> Result<(), String> {
    let ctx = format!(
        "gameId={} filename={} (streaming dry-run)",
        game_id, relative_filename
    );
    sync_logger::log_operation("full_backup_streaming_dry_run_start", &ctx);

    let mut loaded: u64 = 0;
    // Último valor de `loaded` en el que se emitió un evento de progreso.
    // Se usa para aplicar throttle sin timer adicional.
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

                // Throttle: solo emitir cuando se ha acumulado al menos PART_SIZE bytes
                // desde el último emit. Esto reduce los eventos de ~2000 a ~16 en un
                // backup de 500 MB, eliminando la sobrecarga de cruces Rust→JS que
                // hacía al dry-run más lento que el upload real.
                if loaded - last_emitted >= PART_SIZE as u64 {
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

    // Emit final para asegurar que el frontend refleja el 100% aunque el último
    // chunk no haya alcanzado el umbral del throttle.
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
