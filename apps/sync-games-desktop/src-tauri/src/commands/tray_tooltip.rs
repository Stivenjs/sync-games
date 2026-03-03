//! Comando para actualizar el tooltip de la bandeja (p. ej. tras cargar la app).

use crate::tray_state::TrayState;
use tauri::State;

/// Actualiza el conteo de juegos con cambios pendientes y el tooltip del tray.
#[tauri::command]
pub async fn refresh_tray_tooltip(tray_state: State<'_, TrayState>) -> Result<(), String> {
    let count = match crate::commands::sync::download::sync_check_unsynced_games().await {
        Ok(list) => Some(list.len() as u32),
        Err(_) => None,
    };
    tray_state.0.set_unsynced_count(count);
    tray_state.0.update_tooltip();
    Ok(())
}
