//! Comandos Tauri expuestos al frontend.

pub(crate) mod command_logs;
mod config;
mod config_io;
pub(crate) mod game_exit_sync;
mod game_stats;
mod manifest_search;
pub mod plugins;
mod scan;
mod steam_search;
pub mod sync;
pub mod tray_tooltip;
pub mod watch_sync;

pub use config::*;
pub use config_io::*;
pub use game_stats::*;
pub use manifest_search::*;
pub use scan::*;
pub use steam_search::*;
