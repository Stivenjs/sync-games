//! Comandos Tauri para el catálogo Steam en SQLite.

use std::ops::Deref;

use tauri::State;

use crate::sqlite::AppDb;
use crate::steam_cache::SteamAppDetails;

use super::enrichment::fetch_catalog_app_details;
use super::query;
use super::sync::{reset_catalog_sync_progress, run_catalog_sync, CatalogSyncStats};
use super::types::{CatalogListItem, CatalogPage};

#[tauri::command]
pub async fn sync_steam_catalog(db: State<'_, AppDb>) -> Result<CatalogSyncStats, String> {
    run_catalog_sync(db.deref())
        .await
        .map_err(|e| e.to_string())
}

/// Borra metadatos de sync para que la próxima ejecución vuelva a un sync completo.
#[tauri::command]
pub fn reset_steam_catalog_sync(db: State<'_, AppDb>) -> Result<(), String> {
    reset_catalog_sync_progress(db.deref()).map_err(|e| e.to_string())
}

/// Búsqueda por nombre sobre `name_normalized` (mínimo 2 caracteres).
#[tauri::command]
pub async fn search_steam_catalog(
    db: State<'_, AppDb>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<CatalogListItem>, String> {
    let q = query.trim().to_string();
    let limit = limit.unwrap_or(50).min(200);
    let db = db.deref().clone();
    tokio::task::spawn_blocking(move || db.with_conn(|c| query::search_catalog(c, &q, limit)))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Listado paginado estable por `app_id` + total de filas.
#[tauri::command]
pub async fn list_steam_catalog_page(
    db: State<'_, AppDb>,
    offset: Option<u32>,
    limit: Option<u32>,
) -> Result<CatalogPage, String> {
    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(50).min(500);
    let db = db.deref().clone();
    tokio::task::spawn_blocking(move || db.with_conn(|c| query::catalog_page(c, offset, limit)))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Ficha completa: prioriza caché RAM, luego JSON en SQLite, luego Store API; persiste en disco.
#[tauri::command]
pub async fn get_steam_catalog_app_details(
    db: State<'_, AppDb>,
    app_id: String,
) -> Result<SteamAppDetails, String> {
    let db = db.deref().clone();
    fetch_catalog_app_details(&db, app_id).await
}
