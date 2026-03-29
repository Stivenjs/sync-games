//! Sembrado y mantenimiento del catálogo Steam en SQLite.
//!
//! - **Sync completo**: paginación con `last_appid` hasta `have_more == false`, con reanudación
//!   en `catalog_sync_meta.resume_last_appid` si el proceso se interrumpe.
//! - **Incremental**: cuando el full terminó, siguientes ejecuciones usan `if_modified_since`
//!   con la marca de tiempo de la última sync exitosa para traer solo ítems cambiados.
//!
//! Requiere clave [Steam Web API](https://steamcommunity.com/dev/apikey): campo
//! `steamWebApiKey` en settings o variable de entorno `STEAM_WEB_API_KEY`.

mod api;
pub mod commands;
mod error;
mod meta;
pub mod sync;
