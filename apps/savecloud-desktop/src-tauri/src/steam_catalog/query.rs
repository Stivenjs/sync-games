//! Consultas de solo lectura sobre [`steam_catalog_apps`](crate::sqlite).

use rusqlite::Connection;

use super::types::{CatalogListItem, CatalogPage};

/// Misma heurística que el sync (`name_normalized`): minúsculas y espacios colapsados.
pub fn normalize_for_search(s: &str) -> String {
    s.to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Búsqueda por subcadena sobre `name_normalized` (mínimo 2 caracteres útiles).
pub fn search_catalog(
    conn: &Connection,
    q: &str,
    limit: u32,
) -> Result<Vec<CatalogListItem>, rusqlite::Error> {
    let needle = normalize_for_search(q.trim());
    if needle.len() < 2 {
        return Ok(Vec::new());
    }
    let pattern = format!("%{needle}%");
    let mut stmt = conn.prepare(
        "SELECT app_id, name FROM steam_catalog_apps
         WHERE name_normalized LIKE ?1
         ORDER BY name_normalized ASC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(rusqlite::params![pattern, i64::from(limit)], |row| {
        let id: i64 = row.get(0)?;
        Ok(CatalogListItem {
            steam_app_id: id.to_string(),
            name: row.get(1)?,
        })
    })?;
    rows.collect()
}

pub fn count_catalog(conn: &Connection) -> Result<u64, rusqlite::Error> {
    conn.query_row("SELECT COUNT(*) FROM steam_catalog_apps", [], |row| {
        row.get::<_, i64>(0).map(|n| n as u64)
    })
}

/// Listado estable por `app_id` ascendente (paginación).
pub fn list_catalog_page(
    conn: &Connection,
    offset: u32,
    limit: u32,
) -> Result<Vec<CatalogListItem>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT app_id, name FROM steam_catalog_apps
         ORDER BY app_id ASC
         LIMIT ?1 OFFSET ?2",
    )?;
    let rows = stmt.query_map(
        rusqlite::params![i64::from(limit), i64::from(offset)],
        |row| {
            let id: i64 = row.get(0)?;
            Ok(CatalogListItem {
                steam_app_id: id.to_string(),
                name: row.get(1)?,
            })
        },
    )?;
    rows.collect()
}

pub fn catalog_page(
    conn: &Connection,
    offset: u32,
    limit: u32,
) -> Result<CatalogPage, rusqlite::Error> {
    let total = count_catalog(conn)?;
    let items = list_catalog_page(conn, offset, limit)?;
    Ok(CatalogPage {
        total,
        offset,
        limit,
        items,
    })
}
