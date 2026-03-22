//! Módulo para gestionar los plugins.
//!
//! Contiene las funciones para:
//!
//! - Cargar todos los plugins.
//! - Registrar el plugin.
//! - Ejecutar el hook de inicialización.

use super::plugin::Plugin;
use std::path::PathBuf;
use tauri::AppHandle;

pub struct PluginManager {
    plugins: Vec<Plugin>,
}

impl PluginManager {
    pub fn new() -> Self {
        Self {
            plugins: Vec::new(),
        }
    }

    pub fn load_all(&mut self, plugins_dir: PathBuf, app_handle: AppHandle) {
        println!("Escaneando carpeta de plugins en: {:?}", plugins_dir);

        if let Ok(entries) = std::fs::read_dir(plugins_dir) {
            for entry in entries.flatten() {
                let path = entry.path();

                if path.is_dir() {
                    match Plugin::load_from_dir(&path, app_handle.clone()) {
                        Ok(plugin) => {
                            println!("Plugin registrado exitosamente: {}", plugin.name);

                            if let Err(e) = plugin.trigger_on_init() {
                                eprintln!("Error ejecutando on_init en {}: {}", plugin.name, e);
                            }

                            self.plugins.push(plugin);
                        }
                        Err(e) => {
                            eprintln!("Omitiendo carpeta {:?}: {}", path.file_name().unwrap(), e);
                        }
                    }
                }
            }
        }
    }
}
