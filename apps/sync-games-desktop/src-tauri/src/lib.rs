mod commands;
mod config;
mod steam;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::get_config_path,
            commands::search_steam_app_id,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
