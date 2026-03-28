use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;

use librqbit::api::TorrentIdOrHash;
use librqbit::{AddTorrent, AddTorrentOptions, Session, SessionOptions, TorrentStatsState};
use tauri::{AppHandle, Emitter};

use super::errors::TorrentError;
use super::models::{TorrentDownloadState, TorrentProgressPayload};

/// Nombre del evento Tauri que recibe el frontend para actualizar la barra de progreso.
const TORRENT_PROGRESS_EVENT: &str = "torrent-download-progress";
/// Nombre del evento emitido cuando un torrent termina de descargarse.
const TORRENT_DONE_EVENT: &str = "torrent-download-done";
/// Tras cancelar: el frontend oculta la barra (evita carrera con un progreso ya emitido).
pub const TORRENT_CANCELLED_EVENT: &str = "torrent-download-cancelled";
/// Intervalo entre emisiones de progreso al frontend.
const PROGRESS_INTERVAL: std::time::Duration = std::time::Duration::from_millis(500);

/// Estado del motor de descargas torrent.
pub struct TorrentEngine {
    session: Arc<Session>,
    active: HashSet<String>,
}

impl TorrentEngine {
    pub async fn new(output_folder: PathBuf) -> Result<Self, TorrentError> {
        // Sin `listen_port_range`, librqbit no abre socket TCP para peers entrantes: el anuncio a
        // trackers/DHT va sin puerto útil y UPnP no hace nada. Afecta a magnets (metadatos vía
        // enjambre) y a .torrent (conexión con peers / arranque de la descarga).
        let options = SessionOptions {
            listen_port_range: Some(6881..6890),
            enable_upnp_port_forwarding: true,
            fastresume: true,
            ..Default::default()
        };
        let session = Session::new_with_opts(output_folder, options)
            .await
            .map_err(|e| TorrentError::SessionInit(e.to_string()))?;

        Ok(Self {
            session,
            active: HashSet::new(),
        })
    }

    pub fn session(&self) -> Arc<Session> {
        self.session.clone()
    }

    pub fn register_active(&mut self, info_hash: String) {
        self.active.insert(info_hash);
    }

    pub fn unregister_active(&mut self, info_hash: &str) {
        self.active.remove(info_hash);
    }
}

fn parse_info_hash(info_hash: &str) -> Result<TorrentIdOrHash, TorrentError> {
    TorrentIdOrHash::try_from(info_hash)
        .map_err(|_| TorrentError::NotFound(format!("info_hash inválido: {}", info_hash)))
}

pub fn emit_starting_event(app: &AppHandle, info_hash: &str, name: &str) {
    let payload = TorrentProgressPayload {
        info_hash: info_hash.to_string(),
        name: name.to_string(),
        progress_percent: 0.0,
        download_speed_bytes: 0,
        upload_speed_bytes: 0,
        state: TorrentDownloadState::Starting,
        total_bytes: 0,
        downloaded_bytes: 0,
        eta_seconds: None,
        peers_connected: 0,
    };
    let _ = app.emit(TORRENT_PROGRESS_EVENT, &payload);
}

pub async fn cancel_via_session(
    session: &Arc<Session>,
    info_hash: &str,
) -> Result<(), TorrentError> {
    let id = parse_info_hash(info_hash)?;
    let handle = session
        .get(id)
        .ok_or_else(|| TorrentError::NotFound(info_hash.to_string()))?;
    session
        .delete(TorrentIdOrHash::Id(handle.id()), false)
        .await
        .map_err(|e| TorrentError::Cancel(e.to_string()))
}

pub async fn pause_via_session(
    session: &Arc<Session>,
    info_hash: &str,
) -> Result<(), TorrentError> {
    let id = parse_info_hash(info_hash)?;
    let handle = session
        .get(id)
        .ok_or_else(|| TorrentError::NotFound(info_hash.to_string()))?;
    session
        .pause(&handle)
        .await
        .map_err(|e| TorrentError::Pause(e.to_string()))
}

pub async fn resume_via_session(
    session: &Arc<Session>,
    info_hash: &str,
) -> Result<(), TorrentError> {
    let id = parse_info_hash(info_hash)?;
    let handle = session
        .get(id)
        .ok_or_else(|| TorrentError::NotFound(info_hash.to_string()))?;
    session
        .unpause(&handle)
        .await
        .map_err(|e| TorrentError::Resume(e.to_string()))
}

pub async fn add_magnet_to_session(
    session: &Arc<Session>,
    magnet_link: &str,
    save_path: &str,
) -> Result<(String, String, usize), TorrentError> {
    let add_options = AddTorrentOptions {
        output_folder: Some(save_path.into()),
        ..Default::default()
    };

    let response = session
        .add_torrent(AddTorrent::from_url(magnet_link), Some(add_options))
        .await
        .map_err(|e| TorrentError::AddMagnet(e.to_string()))?;

    let handle = response.into_handle().ok_or(TorrentError::ListOnly)?;
    let info_hash = handle.info_hash().as_string();
    let name = handle
        .name()
        .map(|s| s.to_string())
        .unwrap_or_else(|| info_hash.clone());
    let id = handle.id();

    Ok((info_hash, name, id))
}

pub async fn add_file_to_session(
    session: &Arc<Session>,
    file_path: &str,
    save_path: &str,
) -> Result<(String, String, usize), TorrentError> {
    let add_options = AddTorrentOptions {
        output_folder: Some(save_path.into()),
        ..Default::default()
    };

    let add = AddTorrent::from_local_filename(file_path)
        .map_err(|e| TorrentError::ReadTorrentFile(e.to_string()))?;

    let response = session
        .add_torrent(add, Some(add_options))
        .await
        .map_err(|e| TorrentError::AddTorrent(e.to_string()))?;

    let handle = response.into_handle().ok_or(TorrentError::ListOnly)?;
    let info_hash = handle.info_hash().as_string();
    // No usar `wait_until_initialized()`: bloquearía el comando Tauri hasta que el torrent salga de
    // Initializing (peers, disco…), p. ej. varios minutos; el frontend ya recibe estado vía
    // `spawn_progress_monitor`.

    let name = handle
        .name()
        .map(|s| s.to_string())
        .unwrap_or_else(|| info_hash.clone());
    let id = handle.id();

    Ok((info_hash, name, id))
}

pub fn spawn_progress_monitor(
    session: Arc<Session>,
    torrent_id: usize,
    info_hash: String,
    name: String,
    app: AppHandle,
) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(PROGRESS_INTERVAL);

        loop {
            interval.tick().await;

            let managed = match session.get(TorrentIdOrHash::Id(torrent_id)) {
                Some(m) => m,
                None => break,
            };

            let stats = managed.stats();
            let total_bytes = stats.total_bytes;
            let downloaded_bytes = stats.progress_bytes;

            let progress_percent = if total_bytes > 0 {
                (downloaded_bytes as f64 / total_bytes as f64 * 100.0) as f32
            } else {
                0.0
            };

            let download_speed_bytes = stats
                .live
                .as_ref()
                .map(|live| (live.download_speed.mbps * 1_000_000.0 / 8.0) as u64)
                .unwrap_or(0);

            let upload_speed_bytes = stats
                .live
                .as_ref()
                .map(|live| (live.upload_speed.mbps * 1_000_000.0 / 8.0) as u64)
                .unwrap_or(0);

            let peers_connected = stats
                .live
                .as_ref()
                .map(|live| live.snapshot.peer_stats.live as u32)
                .unwrap_or(0);

            let eta_seconds = if download_speed_bytes > 0 && total_bytes > downloaded_bytes {
                let remaining = total_bytes - downloaded_bytes;
                Some(remaining / download_speed_bytes)
            } else {
                None
            };

            let state = if stats.finished {
                TorrentDownloadState::Completed
            } else {
                match stats.state {
                    TorrentStatsState::Paused => TorrentDownloadState::Paused,
                    TorrentStatsState::Initializing => TorrentDownloadState::Starting,
                    _ => TorrentDownloadState::Downloading,
                }
            };

            // Otro hilo puede haber cancelado el torrent entre el `get` inicial y aquí: no emitir
            // progreso obsoleto (evita que la barra reaparezca tras cancelar).
            if session.get(TorrentIdOrHash::Id(torrent_id)).is_none() {
                break;
            }

            let payload = TorrentProgressPayload {
                info_hash: info_hash.clone(),
                name: name.clone(),
                progress_percent,
                download_speed_bytes,
                upload_speed_bytes,
                state: state.clone(),
                total_bytes,
                downloaded_bytes,
                eta_seconds,
                peers_connected,
            };

            let _ = app.emit(TORRENT_PROGRESS_EVENT, &payload);

            if stats.finished {
                let _ = app.emit(TORRENT_DONE_EVENT, &payload);
                break;
            }
        }
    });
}
