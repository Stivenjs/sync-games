//! Módulo central para la gestión de configuración y preferencias.
//!
//! Coordina la lectura, escritura y transformación de los modelos de datos
//! utilizados para la configuración de entorno, biblioteca local y registros
//! de sincronización.

pub mod io;
pub mod models;
pub mod paths;
pub mod config_cmds;

pub use io::*;
pub use models::*;
pub use paths::*;
