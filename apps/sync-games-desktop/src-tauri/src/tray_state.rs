//! Estado del icono de bandeja y tooltip: "Idle", "Sincronizando…", "N juegos con cambios pendientes".

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::tray::TrayIcon;

pub struct TrayStateInner {
    pub tray: TrayIcon,
    syncing_count: AtomicU32,
    unsynced_count: Mutex<Option<u32>>,
}

impl TrayStateInner {
    pub fn new(tray: TrayIcon) -> Self {
        Self {
            tray,
            syncing_count: AtomicU32::new(0),
            unsynced_count: Mutex::new(None),
        }
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
