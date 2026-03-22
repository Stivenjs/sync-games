pub mod api;
pub mod manager;
pub mod plugin;

use std::sync::Arc;
use tokio::sync::Mutex;

#[allow(dead_code)]
pub type AppPluginManager = Arc<Mutex<manager::PluginManager>>;
