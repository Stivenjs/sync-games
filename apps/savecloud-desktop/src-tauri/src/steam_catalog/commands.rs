//! Comandos Tauri para sincronizar el catálogo Steam en SQLite.

use tauri::State;

use crate::sqlite::AppDb;
use crate::steam_catalog::sync::{reset_catalog_sync_progress, run_catalog_sync, CatalogSyncStats};

#[tauri::command]
pub async fn sync_steam_catalog(db: State<'_, AppDb>) -> Result<CatalogSyncStats, String> {
    run_catalog_sync(&db).await.map_err(|e| e.to_string())
}

/// Borra metadatos de sync para que la próxima ejecución vuelva a un sync completo.
#[tauri::command]
pub fn reset_steam_catalog_sync(db: State<'_, AppDb>) -> Result<(), String> {
    reset_catalog_sync_progress(&db).map_err(|e| e.to_string())
}
