//! Cliente mínimo para [`IStoreService/GetAppList`](https://partner.steamgames.com/doc/webapi/IStoreService).

use serde_json::Value;

use crate::network::API_CLIENT;

use super::error::CatalogSyncError;

const GET_APP_LIST_URL: &str = "https://api.steampowered.com/IStoreService/GetAppList/v1/";
pub const MAX_RESULTS_PER_REQUEST: u32 = 50_000;

/// Una página de resultados: lista `(appid, nombre)` y si Steam indica más páginas.
pub async fn fetch_app_list_page(
    api_key: &str,
    last_appid: u32,
    if_modified_since: Option<u32>,
) -> Result<(Vec<(u32, String)>, bool), CatalogSyncError> {
    let mut url = format!(
        "{GET_APP_LIST_URL}?key={}&max_results={}&last_appid={}&include_games=true",
        urlencoding::encode(api_key),
        MAX_RESULTS_PER_REQUEST.min(50_000),
        last_appid
    );
    if let Some(ts) = if_modified_since {
        url.push_str(&format!("&if_modified_since={ts}"));
    }

    let res = API_CLIENT.get(url).send().await?;
    let status = res.status();
    if !status.is_success() {
        return Err(CatalogSyncError::HttpStatus(status.as_u16()));
    }

    let body: Value = res.json().await?;
    parse_app_list_response(&body)
}

fn parse_app_list_response(body: &Value) -> Result<(Vec<(u32, String)>, bool), CatalogSyncError> {
    let response = body
        .get("response")
        .ok_or(CatalogSyncError::InvalidResponse)?;
    let apps_arr = response
        .get("apps")
        .and_then(|a| a.as_array())
        .ok_or(CatalogSyncError::InvalidResponse)?;
    let have_more = response
        .get("have_more")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let mut out = Vec::with_capacity(apps_arr.len());
    for item in apps_arr {
        let appid = item
            .get("appid")
            .and_then(|v| v.as_u64().or_else(|| v.as_i64().map(|i| i as u64)))
            .ok_or(CatalogSyncError::InvalidResponse)? as u32;
        let name = item
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if name.is_empty() {
            continue;
        }
        out.push((appid, name));
    }

    Ok((out, have_more))
}
