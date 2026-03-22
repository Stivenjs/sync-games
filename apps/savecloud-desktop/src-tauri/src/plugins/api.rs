//! Módulo para registrar la API de SaveCloud en Lua.
//!
//! Contiene las funciones para:
//!
//! - Registrar el módulo de log.
//! - Registrar el módulo de UI.
//! - Registrar el módulo de DB.

use mlua::{Lua, Result, Table};
use tauri::AppHandle;

pub fn register_savecloud_api(lua: &Lua, app_handle: AppHandle) -> Result<()> {
    let globals = lua.globals();

    let savecloud_table = lua.create_table()?;

    register_log_module(lua, &savecloud_table)?;
    register_ui_module(lua, &savecloud_table, app_handle.clone())?;
    register_db_module(lua, &savecloud_table)?;

    globals.set("savecloud", savecloud_table)?;

    globals.set("os", mlua::Value::Nil)?;
    globals.set("io", mlua::Value::Nil)?;

    Ok(())
}

fn register_log_module(lua: &Lua, parent_table: &Table) -> Result<()> {
    let log_table = lua.create_table()?;

    let info = lua.create_function(|_, msg: String| {
        println!("[Plugin INFO]: {}", msg);
        Ok(())
    })?;

    let error = lua.create_function(|_, msg: String| {
        eprintln!("[Plugin ERROR]: {}", msg);
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
    
    let log_operation = lua.create_function(|_, (plugin, action, details): (String, String, String)| {
        println!("[DB Mock] Insertando operacion -> Plugin: {}, Accion: {}, Detalles: {}", plugin, action, details);
        Ok(())
    })?;

    db_table.set("log_operation", log_operation)?;
    parent_table.set("db", db_table)?;

    Ok(())
}
