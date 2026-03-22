//! Módulo para crear el tray.
//!
//! Contiene las funciones para:
//!
//! - Crear el tray.
//! - Mostrar el tray.
//! - Subir todo.
//! - Descargar todo.
//! - Backup completo (primer juego).
//! - Salir.    

use crate::tray_state::TrayState;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{App, Emitter, Manager};

/// Crea el tray.
pub fn create_tray(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let icon_bytes = include_bytes!("../../icons/icon.ico");
    let icon = tauri::image::Image::from_bytes(icon_bytes)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

    let show_item = MenuItem::with_id(app, "show", "Mostrar", true, None::<&str>)?;
    let upload_all_item =
        MenuItem::with_id(app, "upload_all", "Subir todo ahora", true, None::<&str>)?;
    let download_all_item = MenuItem::with_id(
        app,
        "download_all",
        "Descargar todo ahora",
        true,
        None::<&str>,
    )?;
    let backup_first_item = MenuItem::with_id(
        app,
        "backup_first",
        "Backup completo (primer juego)",
        true,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &show_item,
            &upload_all_item,
            &download_all_item,
            &backup_first_item,
            &quit_item,
        ],
    )?;

    let tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("Listo")
        .on_menu_event(move |app, event| {
            let id = event.id.as_ref();
            match id {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => app.exit(0),
                "upload_all" => {
                    let _ = app.emit("tray-action-upload-all", ());
                }
                "download_all" => {
                    let _ = app.emit("tray-action-download-all", ());
                }
                "backup_first" => {
                    let _ = app.emit("tray-action-backup-first", ());
                }
                _ => {}
            }
        })
        .build(app)?;

    let tray_state = TrayState::new(tray);
    app.manage(tray_state);

    Ok(())
}
