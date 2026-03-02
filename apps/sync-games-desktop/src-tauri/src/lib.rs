mod commands;
mod config;
mod steam;

/// Carga .env desde el directorio de trabajo o directorios padres (como hace la CLI).
fn load_dotenv() {
    // Buscar .env ascendiendo desde el cwd (ej. raíz del repo al ejecutar `bun run desktop`)
    let _ = dotenvy::dotenv();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    load_dotenv();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::get_config_path,
            commands::get_steam_app_name,
            commands::search_steam_app_id,
            commands::add_game,
            commands::remove_game,
            commands::scan_path_candidates,
            commands::list_save_files,
            commands::sync_upload_game,
            commands::sync_list_remote_saves,
            commands::sync_check_download_conflicts,
            commands::sync_download_game,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
