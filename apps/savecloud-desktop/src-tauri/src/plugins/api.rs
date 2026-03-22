//! Módulo para registrar la API de SaveCloud en Lua.
//!
//! Contiene las funciones para:
//!
//! - Registrar el módulo de log.
//! - Registrar el módulo de UI.
//! - Registrar el módulo de DB.

use crate::plugins::log_buffer::{AppLogs, LogEntry};
use mlua::{Lua, Result, Table};
use tauri::AppHandle;

pub fn register_savecloud_api(
    lua: &Lua,
    app_handle: AppHandle,
    logs: AppLogs,
    plugin_name: String,
) -> Result<()> {
    let globals = lua.globals();

    let savecloud_table = lua.create_table()?;

    register_log_module(lua, &savecloud_table, app_handle.clone(), logs, plugin_name)?;
    register_ui_module(lua, &savecloud_table, app_handle.clone())?;
    register_db_module(lua, &savecloud_table)?;

    globals.set("savecloud", savecloud_table)?;
    //globals.set("os", mlua::Value::Nil)?;
    //globals.set("io", mlua::Value::Nil)?;

    Ok(())
}

fn register_log_module(
    lua: &Lua,
    parent_table: &Table,
    app_handle: AppHandle,
    logs: AppLogs,
    plugin_name: String,
) -> Result<()> {
    let log_table = lua.create_table()?;

    let logs_info = logs.clone();
    let plugin_name_info = plugin_name.clone();
    let app_handle_info = app_handle.clone();

    let info = lua.create_function(move |_, msg: String| {
        let entry = LogEntry {
            timestamp: chrono::Local::now().format("%H:%M:%S").to_string(),
            level: "info".to_string(),
            plugin: plugin_name_info.clone(),
            message: msg.clone(),
        };

        println!("[Plugin INFO][{}]: {}", plugin_name_info, msg);

        let logs = logs_info.clone();
        let entry_clone = entry.clone();
        let handle = app_handle_info.clone();

        tauri::async_runtime::spawn(async move {
            logs.lock().await.push(entry_clone.clone());
            use tauri::Emitter;
            let _ = handle.emit("plugin_log", entry_clone);
        });

        Ok(())
    })?;

    let logs_error = logs.clone();
    let plugin_name_error = plugin_name.clone();
    let app_handle_error = app_handle.clone();

    let error = lua.create_function(move |_, msg: String| {
        let entry = LogEntry {
            timestamp: chrono::Local::now().format("%H:%M:%S").to_string(),
            level: "error".to_string(),
            plugin: plugin_name_error.clone(),
            message: msg.clone(),
        };

        eprintln!("[Plugin ERROR][{}]: {}", plugin_name_error, msg);

        let logs = logs_error.clone();
        let entry_clone = entry.clone();
        let handle = app_handle_error.clone();

        tauri::async_runtime::spawn(async move {
            logs.lock().await.push(entry_clone.clone());
            use tauri::Emitter;
            let _ = handle.emit("plugin_log", entry_clone);
        });

        Ok(())
    })?;

    log_table.set("info", info)?;
    log_table.set("error", error)?;
    parent_table.set("log", log_table)?;

    Ok(())
}

fn register_ui_module(lua: &Lua, parent_table: &Table, app_handle: AppHandle) -> Result<()> {
    let ui_table = lua.create_table()?;

    let emit = lua.create_function(move |_, (event, payload): (String, String)| {
        use tauri::Emitter;
        let _ = app_handle.emit(&event, payload);
        Ok(())
    })?;

    ui_table.set("emit", emit)?;
    parent_table.set("ui", ui_table)?;

    Ok(())
}

fn register_db_module(lua: &Lua, parent_table: &Table) -> Result<()> {
    let db_table = lua.create_table()?;

    let log_operation =
        lua.create_function(|_, (plugin, action, details): (String, String, String)| {
            println!(
                "[DB Mock] Insertando operacion -> Plugin: {}, Accion: {}, Detalles: {}",
                plugin, action, details
            );
            Ok(())
        })?;

    db_table.set("log_operation", log_operation)?;
    parent_table.set("db", db_table)?;

    Ok(())
}
