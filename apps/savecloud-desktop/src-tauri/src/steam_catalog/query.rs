//! Consultas de solo lectura sobre [`steam_catalog_apps`](crate::sqlite).

use rusqlite::{params_from_iter, Connection, Row};

use super::types::{CatalogFilterFacet, CatalogFilterFacets, CatalogListItem, CatalogPage};

fn map_catalog_row(row: &Row<'_>) -> Result<CatalogListItem, rusqlite::Error> {
    let id: i64 = row.get(0)?;
    Ok(CatalogListItem {
        steam_app_id: id.to_string(),
        name: row.get(1)?,
    })
}

/// Misma heurística que el sync (`name_normalized`): minúsculas y espacios colapsados.
pub fn normalize_for_search(s: &str) -> String {
    s.to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn append_json_genre_filter(
    sql: &mut String,
    params: &mut Vec<String>,
    genres: &[String],
    table_alias: &str,
) {
    if genres.is_empty() {
        return;
    }
    sql.push_str(&format!(
        " AND EXISTS (SELECT 1 FROM json_each(json_extract({table_alias}.details_json, '$.genres')) AS _gf WHERE _gf.value IN (",
    ));
    for (i, _) in genres.iter().enumerate() {
        if i > 0 {
            sql.push_str(", ");
        }
        sql.push('?');
        params.push(genres[i].clone());
    }
    sql.push_str("))");
}

fn append_json_tag_filter(
    sql: &mut String,
    params: &mut Vec<String>,
    tags: &[String],
    table_alias: &str,
) {
    if tags.is_empty() {
        return;
    }
    sql.push_str(&format!(
        " AND EXISTS (SELECT 1 FROM json_each(json_extract({table_alias}.details_json, '$.categories')) AS _tf WHERE _tf.value IN (",
    ));
    for (i, _) in tags.iter().enumerate() {
        if i > 0 {
            sql.push_str(", ");
        }
        sql.push('?');
        params.push(tags[i].clone());
    }
    sql.push_str("))");
}

/// Recuento de filas que cumplen filtros por JSON enriquecido (`details_json`).
pub fn count_catalog_filtered(
    conn: &Connection,
    genres: &[String],
    tags: &[String],
) -> Result<u64, rusqlite::Error> {
    let mut sql = String::from("SELECT COUNT(*) FROM steam_catalog_apps WHERE 1=1");
    let mut params: Vec<String> = Vec::new();
    append_json_genre_filter(&mut sql, &mut params, genres, "steam_catalog_apps");
    append_json_tag_filter(&mut sql, &mut params, tags, "steam_catalog_apps");

    let count: i64 = if params.is_empty() {
        conn.query_row(&sql, [], |row| row.get(0))?
    } else {
        conn.query_row(
            &sql,
            params_from_iter(params.iter().map(|s| s.as_str())),
            |row| row.get(0),
        )?
    };
    Ok(count as u64)
}

/// Listado: primero juegos con ranking de tendencia (`steam_catalog_trending`, sync desde la tienda),
/// luego el resto por `app_id` descendente.
pub fn list_catalog_page_filtered(
    conn: &Connection,
    offset: u32,
    limit: u32,
    genres: &[String],
    tags: &[String],
) -> Result<Vec<CatalogListItem>, rusqlite::Error> {
    let mut sql = String::from(
        "SELECT a.app_id, a.name FROM steam_catalog_apps a \
         LEFT JOIN steam_catalog_trending tr ON tr.app_id = a.app_id \
         WHERE 1=1",
    );
    let mut params: Vec<String> = Vec::new();
    append_json_genre_filter(&mut sql, &mut params, genres, "a");
    append_json_tag_filter(&mut sql, &mut params, tags, "a");
    sql.push_str(&format!(
        " ORDER BY (tr.rank IS NOT NULL) DESC, tr.rank ASC, a.app_id DESC LIMIT {} OFFSET {}",
        limit, offset
    ));

    let mut stmt = conn.prepare(&sql)?;
    let rows = if params.is_empty() {
        stmt.query_map([], map_catalog_row)?
    } else {
        stmt.query_map(
            params_from_iter(params.iter().map(|s| s.as_str())),
            map_catalog_row,
        )?
    };
    rows.collect()
}

pub fn catalog_page_filtered(
    conn: &Connection,
    offset: u32,
    limit: u32,
    genres: &[String],
    tags: &[String],
) -> Result<CatalogPage, rusqlite::Error> {
    let total = count_catalog_filtered(conn, genres, tags)?;
    let items = list_catalog_page_filtered(conn, offset, limit, genres, tags)?;
    Ok(CatalogPage {
        total,
        offset,
        limit,
        items,
    })
}

/// Búsqueda por subcadena sobre `name_normalized` (mínimo 2 caracteres útiles).
pub fn search_catalog_filtered(
    conn: &Connection,
    q: &str,
    limit: u32,
    genres: &[String],
    tags: &[String],
) -> Result<Vec<CatalogListItem>, rusqlite::Error> {
    let needle = normalize_for_search(q.trim());
    if needle.len() < 2 {
        return Ok(Vec::new());
    }
    let pattern = format!("%{needle}%");
    let mut sql = String::from(
        "SELECT a.app_id, a.name FROM steam_catalog_apps a \
         LEFT JOIN steam_catalog_trending tr ON tr.app_id = a.app_id \
         WHERE a.name_normalized LIKE ?",
    );
    let mut params: Vec<String> = vec![pattern];
    append_json_genre_filter(&mut sql, &mut params, genres, "a");
    append_json_tag_filter(&mut sql, &mut params, tags, "a");
    sql.push_str(" ORDER BY (tr.rank IS NOT NULL) DESC, tr.rank ASC, a.app_id DESC LIMIT ");
    sql.push_str(&limit.to_string());

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        params_from_iter(params.iter().map(|s| s.as_str())),
        map_catalog_row,
    )?;
    rows.collect()
}

/// Facetas desde `details_json` (apps enriquecidas). Etiquetas = categorías Steam (`categories`).
pub fn filter_facets(conn: &Connection) -> Result<CatalogFilterFacets, rusqlite::Error> {
    let genres = collect_facet_rows(
        conn,
        "SELECT g.value AS label, COUNT(DISTINCT steam_catalog_apps.app_id) AS cnt \
         FROM steam_catalog_apps, \
              json_each(json_extract(steam_catalog_apps.details_json, '$.genres')) AS g \
         WHERE steam_catalog_apps.details_json IS NOT NULL \
           AND length(trim(steam_catalog_apps.details_json)) > 0 \
         GROUP BY g.value \
         ORDER BY cnt DESC, label COLLATE NOCASE ASC",
    )?;

    let tags = collect_facet_rows(
        conn,
        "SELECT t.value AS label, COUNT(DISTINCT steam_catalog_apps.app_id) AS cnt \
         FROM steam_catalog_apps, \
              json_each(json_extract(steam_catalog_apps.details_json, '$.categories')) AS t \
         WHERE steam_catalog_apps.details_json IS NOT NULL \
           AND length(trim(steam_catalog_apps.details_json)) > 0 \
         GROUP BY t.value \
         ORDER BY cnt DESC, label COLLATE NOCASE ASC",
    )?;

    Ok(CatalogFilterFacets { genres, tags })
}

fn collect_facet_rows(
    conn: &Connection,
    sql: &str,
) -> Result<Vec<CatalogFilterFacet>, rusqlite::Error> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |row| {
        Ok(CatalogFilterFacet {
            label: row.get(0)?,
            count: row.get::<_, i64>(1)? as u64,
        })
    })?;
    rows.collect()
}
