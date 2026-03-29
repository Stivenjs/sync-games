//! Claves en `catalog_sync_meta` para reanudación e incrementales.

use rusqlite::{Connection, OptionalExtension};

/// `1` cuando al menos una pasada completa por `GetAppList` terminó con `have_more == false`.
pub const META_FULL_SYNC_DONE: &str = "full_sync_done";
/// Último `last_appid` enviado a Steam en un sync completo interrumpido (reanudación).
pub const META_RESUME_LAST_APPID: &str = "resume_last_appid";
/// Epoch Unix (segundos) de la última sincronización exitosa (full o incremental) para `if_modified_since`.
pub const META_LAST_INCREMENTAL_AT: &str = "last_incremental_sync_at";

pub fn get_meta(conn: &Connection, key: &str) -> Result<Option<String>, rusqlite::Error> {
    conn.query_row(
        "SELECT value FROM catalog_sync_meta WHERE key = ?1",
        [key],
        |row| row.get(0),
    )
    .optional()
}

pub fn set_meta(conn: &Connection, key: &str, value: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO catalog_sync_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}

pub fn delete_meta(conn: &Connection, key: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM catalog_sync_meta WHERE key = ?1", [key])?;
    Ok(())
}
