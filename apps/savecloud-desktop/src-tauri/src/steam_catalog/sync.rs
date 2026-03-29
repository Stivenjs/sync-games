//! Orquestación: sync completo (primera vez o reanudación) vs incremental (`if_modified_since`).

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use tokio::time::sleep;

use crate::config::load_settings;
use crate::sqlite::AppDb;

use super::api::fetch_app_list_page;
use super::error::CatalogSyncError;
use super::meta::{
    delete_meta, get_meta, set_meta, META_FULL_SYNC_DONE, META_LAST_INCREMENTAL_AT,
    META_RESUME_LAST_APPID,
};

/// Máximo de peticiones por ejecución para evitar bucles infinitos ante respuestas anómalas.
const MAX_BATCHES_PER_RUN: u32 = 10_000;
/// Pausa entre peticiones a la API de Steam para reducir 429.
const INTER_REQUEST: Duration = Duration::from_millis(250);

/// Resultado expuesto al frontend tras un sync.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSyncStats {
    pub mode: String,
    pub apps_upserted: u64,
    pub batches: u32,
}

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn normalize_display_name(name: &str) -> String {
    name.to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn resolve_api_key() -> Result<String, CatalogSyncError> {
    let s = load_settings();
    s.steam_web_api_key
        .as_ref()
        .map(|k| k.trim().to_string())
        .filter(|k| !k.is_empty())
        .or_else(|| {
            std::env::var("STEAM_WEB_API_KEY")
                .ok()
                .map(|k| k.trim().to_string())
                .filter(|k| !k.is_empty())
        })
        .ok_or(CatalogSyncError::MissingApiKey)
}

fn upsert_apps_batch(conn: &Connection, rows: &[(u32, String)]) -> Result<u64, rusqlite::Error> {
    let mut n = 0u64;
    let mut stmt = conn.prepare_cached(
        "INSERT INTO steam_catalog_apps (app_id, name, name_normalized, last_sync_batch_at)
         VALUES (?1, ?2, ?3, unixepoch())
         ON CONFLICT(app_id) DO UPDATE SET
           name = excluded.name,
           name_normalized = excluded.name_normalized,
           last_sync_batch_at = unixepoch()",
    )?;
    for (app_id, name) in rows {
        let nn = normalize_display_name(name);
        stmt.execute(rusqlite::params![app_id, name, nn])?;
        n += 1;
    }
    Ok(n)
}

fn next_cursor_from_batch(apps: &[(u32, String)], previous_cursor: u32) -> u32 {
    apps.iter()
        .map(|(id, _)| *id)
        .max()
        .unwrap_or(previous_cursor)
}

/// Ejecuta un sync completo (o reanuda) o uno incremental según metadatos en `catalog_sync_meta`.
pub async fn run_catalog_sync(db: &AppDb) -> Result<CatalogSyncStats, CatalogSyncError> {
    let key = resolve_api_key()?;
    let full_done = db
        .with_conn(|c| get_meta(c, META_FULL_SYNC_DONE))?
        .as_deref()
        == Some("1");

    if !full_done {
        run_full_sync(db, &key).await
    } else {
        run_incremental_sync(db, &key).await
    }
}

async fn run_full_sync(db: &AppDb, key: &str) -> Result<CatalogSyncStats, CatalogSyncError> {
    let mut last_appid: u32 = db
        .with_conn(|c| get_meta(c, META_RESUME_LAST_APPID))?
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let mut total: u64 = 0;
    let mut batches: u32 = 0;

    loop {
        batches += 1;
        if batches > MAX_BATCHES_PER_RUN {
            return Err(CatalogSyncError::BatchLimit);
        }

        let (apps, have_more) = fetch_app_list_page(key, last_appid, None).await?;
        if !apps.is_empty() {
            let n = db.with_conn(|c| upsert_apps_batch(c, &apps))?;
            total += n;
            last_appid = next_cursor_from_batch(&apps, last_appid);
            db.with_conn(|c| set_meta(c, META_RESUME_LAST_APPID, &last_appid.to_string()))?;
        }

        sleep(INTER_REQUEST).await;

        if !have_more {
            let ts = now_unix_secs();
            db.with_conn(|c| {
                set_meta(c, META_FULL_SYNC_DONE, "1")?;
                delete_meta(c, META_RESUME_LAST_APPID)?;
                set_meta(c, META_LAST_INCREMENTAL_AT, &ts.to_string())?;
                Ok::<(), rusqlite::Error>(())
            })?;
            return Ok(CatalogSyncStats {
                mode: "full".to_string(),
                apps_upserted: total,
                batches,
            });
        }

        if apps.is_empty() && have_more {
            // Evitar bucle si la API devuelve vacío pero pide más: avanzar de todos modos.
            last_appid = last_appid.saturating_add(1);
            db.with_conn(|c| set_meta(c, META_RESUME_LAST_APPID, &last_appid.to_string()))?;
        }
    }
}

async fn run_incremental_sync(db: &AppDb, key: &str) -> Result<CatalogSyncStats, CatalogSyncError> {
    let since: u32 = db
        .with_conn(|c| get_meta(c, META_LAST_INCREMENTAL_AT))?
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let mut last_appid: u32 = 0;
    let mut total: u64 = 0;
    let mut batches: u32 = 0;

    loop {
        batches += 1;
        if batches > MAX_BATCHES_PER_RUN {
            return Err(CatalogSyncError::BatchLimit);
        }

        let (apps, have_more) = fetch_app_list_page(key, last_appid, Some(since)).await?;
        if !apps.is_empty() {
            let n = db.with_conn(|c| upsert_apps_batch(c, &apps))?;
            total += n;
            last_appid = next_cursor_from_batch(&apps, last_appid);
        }

        sleep(INTER_REQUEST).await;

        if !have_more {
            let ts = now_unix_secs();
            db.with_conn(|c| {
                set_meta(c, META_LAST_INCREMENTAL_AT, &ts.to_string())?;
                Ok::<(), rusqlite::Error>(())
            })?;
            return Ok(CatalogSyncStats {
                mode: "incremental".to_string(),
                apps_upserted: total,
                batches,
            });
        }

        if apps.is_empty() && have_more {
            last_appid = last_appid.saturating_add(1);
        }
    }
}

/// Fuerza un sync completo en la próxima ejecución (borra metadatos de progreso).
/// Útil para “reset” manual; no borra filas ya insertadas.
pub fn reset_catalog_sync_progress(db: &AppDb) -> Result<(), CatalogSyncError> {
    db.with_conn(|c| {
        delete_meta(c, META_FULL_SYNC_DONE)?;
        delete_meta(c, META_RESUME_LAST_APPID)?;
        delete_meta(c, META_LAST_INCREMENTAL_AT)?;
        Ok::<(), rusqlite::Error>(())
    })?;
    Ok(())
}
