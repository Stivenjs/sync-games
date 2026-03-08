//! Estado del icono de bandeja y tooltip: "Idle", "Sincronizando…", "N juegos con cambios pendientes".

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::tray::TrayIcon;

pub struct TrayStateInner {
    pub tray: TrayIcon,
    syncing_count: AtomicU32,
    unsynced_count: Mutex<Option<u32>>,
    /// Pide cancelar la subida en curso (subida multipart lo comprueba entre partes).
    upload_cancel: AtomicBool,
    /// Pide pausar la subida (se guarda estado en disco y se puede reanudar después).
    upload_pause: AtomicBool,
}

impl TrayStateInner {
    pub fn new(tray: TrayIcon) -> Self {
        Self {
            tray,
            syncing_count: AtomicU32::new(0),
            unsynced_count: Mutex::new(None),
            upload_cancel: AtomicBool::new(false),
            upload_pause: AtomicBool::new(false),
        }
    }

    /// Marca que se solicita pausar la subida en curso.
    pub fn request_upload_pause(&self) {
        self.upload_pause.store(true, Ordering::Release);
    }

    /// Resetea el flag de pausa (llamar al iniciar una subida).
    pub fn reset_upload_pause(&self) {
        self.upload_pause.store(false, Ordering::Release);
    }

    /// True si se ha pedido pausar la subida.
    pub fn upload_pause_requested(&self) -> bool {
        self.upload_pause.load(Ordering::Acquire)
    }

    /// Marca que se solicita cancelar la subida en curso.
    pub fn request_upload_cancel(&self) {
        self.upload_cancel.store(true, Ordering::Release);
    }

    /// Resetea el flag de cancelación (llamar al iniciar una subida).
    pub fn reset_upload_cancel(&self) {
        self.upload_cancel.store(false, Ordering::Release);
    }

    /// True si se ha pedido cancelar la subida.
    pub fn upload_cancel_requested(&self) -> bool {
        self.upload_cancel.load(Ordering::Acquire)
    }

    pub fn syncing_inc(&self) {
        self.syncing_count.fetch_add(1, Ordering::Relaxed);
    }

    pub fn syncing_dec(&self) {
        self.syncing_count.fetch_sub(1, Ordering::Relaxed);
    }

    pub fn set_unsynced_count(&self, n: Option<u32>) {
        if let Ok(mut g) = self.unsynced_count.lock() {
            *g = n;
        }
    }

    /// Actualiza el tooltip según el estado actual.
    pub fn update_tooltip(&self) {
        let text = self.tooltip_text();
        let _ = self.tray.set_tooltip(Some(text.as_str()));
    }

    fn tooltip_text(&self) -> String {
        let syncing = self.syncing_count.load(Ordering::Relaxed);
        if syncing > 0 {
            return "Sincronizando…".to_string();
        }
        if let Ok(g) = self.unsynced_count.lock() {
            if let Some(n) = *g {
                if n > 0 {
                    return format!("{} juegos con cambios pendientes", n);
                }
            }
        }
        "Listo".to_string()
    }

    /// Actualiza en segundo plano el conteo de juegos sin sincronizar y el tooltip.
    pub fn refresh_unsynced_async(self: std::sync::Arc<Self>) {
        tauri::async_runtime::spawn(async move {
            if let Ok(list) = crate::commands::sync::download::sync_check_unsynced_games().await {
                self.set_unsynced_count(Some(list.len() as u32));
            }
            self.update_tooltip();
        });
    }
}

/// Estado compartido del tray (para app.manage y para pasar a threads).
#[derive(Clone)]
pub struct TrayState(pub std::sync::Arc<TrayStateInner>);

impl TrayState {
    pub fn new(tray: TrayIcon) -> Self {
        Self(std::sync::Arc::new(TrayStateInner::new(tray)))
    }
}
