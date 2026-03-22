//! Módulo para inicializar los estados y las tareas en segundo plano.
//!
//! Contiene las funciones para:
//!
//! - Inicializar los estados y las tareas en segundo plano.
//! - Inicializar el motor de torrenting.
//! - Inicializar el sistema de plugins y crear sus directorios.
//! - Inicializar el tray.
//! - Inicializar el watcher de procesos.
//! - Inicializar el bucle de eventos del Gamepad.

use crate::commands::game_exit_sync;
use crate::controller::start_gamepad_loop;
use crate::plugins::AppPluginManager;
use crate::process_check::start_process_watcher;
use crate::torrent::{engine::TorrentEngine, state::TorrentState};
use crate::tray_state::TrayState;

use std::sync::Arc;
use tauri::{App, Manager};
use tokio::sync::Mutex;

pub fn init_states_and_background_tasks(app: &mut App) {
    #[cfg(debug_assertions)]
    {
        if let Some(window) = app.get_webview_window("main") {
            window.open_devtools();
        }
    }

    let plugins_dir = app
        .path()
        .data_dir()
        .map(|base| base.join("SaveCloud").join("plugins"))
        .unwrap_or_else(|_| std::env::current_dir().unwrap().join("plugins"));

    if !plugins_dir.exists() {
        let _ = std::fs::create_dir_all(&plugins_dir);
    }

    let mut manager = crate::plugins::manager::PluginManager::new();
    manager.load_all(plugins_dir, app.handle().clone());

    let shared_manager: AppPluginManager = Arc::new(Mutex::new(manager));
    app.manage(shared_manager);

    app.manage(TorrentState {
        engine: std::sync::Arc::new(tokio::sync::Mutex::new(tauri::async_runtime::block_on(
            TorrentEngine::new(std::env::temp_dir().join("SaveCloud-torrents")),
        ))),
        app_handle: app.handle().clone(),
    });

    let tray_state = app.state::<TrayState>();

    game_exit_sync::spawn_exit_watcher(app.handle().clone(), tray_state.inner().0.clone());
    start_process_watcher(app.handle().clone());
    start_gamepad_loop(app.handle().clone());
}
