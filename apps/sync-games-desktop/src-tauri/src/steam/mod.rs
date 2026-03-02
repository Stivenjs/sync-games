//! Módulo Steam: detección automática de App ID a partir de rutas de guardados.
//!
//! Escanea las bibliotecas de Steam y asocia rutas de juego con sus app IDs.
//! La búsqueda por API (nombre → App ID) está en `commands::steam_search`.

mod path_resolver;

pub use path_resolver::resolve_app_id_for_game;
