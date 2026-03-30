//! Tendencia aproximada desde la API pública de la tienda (`/api/featuredcategories`):
//! más vendidos → ofertas destacadas → novedades (solo `type == 0` apps, sin subs/bundles).

use std::collections::HashSet;

use serde_json::Value;

use crate::network::API_CLIENT;
use crate::sqlite::AppDb;

const FEATURED_URL: &str = "https://store.steampowered.com/api/featuredcategories?cc=ES&l=spanish";

/// Parsea `top_sellers`, `specials` y `new_releases`; deduplica por primera aparición (mejor rango).
fn parse_trending_app_ids(root: &Value) -> Vec<u32> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for key in ["top_sellers", "specials", "new_releases"] {
        let Some(items) = root
            .get(key)
            .and_then(|s| s.get("items"))
            .and_then(|i| i.as_array())
        else {
            continue;
        };
        for item in items {
            if item.get("type").and_then(|t| t.as_u64()) != Some(0) {
                continue;
            }
            let Some(id) = item
                .get("id")
                .and_then(|v| v.as_u64())
                .and_then(|n| u32::try_from(n).ok())
            else {
                continue;
            };
            if seen.insert(id) {
                out.push(id);
            }
        }
    }
    out
}

/// Descarga listas de la tienda y reemplaza `steam_catalog_trending`. Devuelve cuántas entradas se guardaron.
pub async fn sync_store_trending(db: &AppDb) -> Result<usize, String> {
    let res = API_CLIENT
        .get(FEATURED_URL)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!(
            "HTTP {} al descargar tendencias de la tienda",
            res.status()
        ));
    }
    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    let ranked = parse_trending_app_ids(&body);
    let n = ranked.len();
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        db.with_conn(|c| {
            c.execute_batch("BEGIN IMMEDIATE; DELETE FROM steam_catalog_trending;")?;
            for (rank, app_id) in ranked.iter().enumerate() {
                c.execute(
                    "INSERT INTO steam_catalog_trending (app_id, rank, updated_at) VALUES (?1, ?2, unixepoch())",
                    rusqlite::params![*app_id as i64, rank as i64],
                )?;
            }
            c.execute_batch("COMMIT;")?;
            Ok(())
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e: crate::sqlite::error::SqliteError| e.to_string())?;

    Ok(n)
}
