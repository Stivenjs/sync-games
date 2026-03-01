mod commands;
mod config;
mod steam;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
