//! Catálogo Steam en SQLite: sync desde la Web API, consultas locales y enriquecimiento con Store `appdetails`.
//!
//! - **Sync** ([`sync`]): `IStoreService/GetAppList` → tabla `steam_catalog_apps` (id + nombre).
//! - **Consultas** ([`query`]): búsqueda por `name_normalized` y paginación estable por `app_id`.
//! - **Enriquecimiento** ([`enrichment`]): `appdetails` de la Store, persistido en `details_json` y caché RAM.
//!
//! Requiere clave [Steam Web API](https://steamcommunity.com/dev/apikey): campo
//! `steamWebApiKey` en settings o variable de entorno `STEAM_WEB_API_KEY`.

mod api;
pub mod commands;
mod enrichment;
mod error;
mod meta;
mod query;
pub mod sync;
mod types;
