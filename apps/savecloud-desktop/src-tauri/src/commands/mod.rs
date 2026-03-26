//! Comandos Tauri expuestos al frontend.

pub(crate) mod command_logs;
pub(crate) mod game_exit_sync;
pub mod sync;
pub mod plugins;
pub mod watch_sync;
mod config_cmds;
mod game_stats;
mod manifest_search;
mod scan;
mod steam_search;

pub use config_cmds::*;
pub use game_stats::*;
pub use manifest_search::*;
pub use scan::*;
pub use steam_search::*;
