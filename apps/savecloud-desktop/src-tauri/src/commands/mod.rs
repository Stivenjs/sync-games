//! Comandos Tauri expuestos al frontend.

pub(crate) mod command_logs;
mod game_stats;
pub mod scan;
pub mod sync;
pub mod logs;

pub use game_stats::*;
