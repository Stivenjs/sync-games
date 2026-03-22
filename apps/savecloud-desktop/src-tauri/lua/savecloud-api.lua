-- /assets/savecloud-api.lua
-- Archivo de definiciones de SaveCloud para autocompletado en el editor.
-- Coloca este archivo en la misma carpeta que tu script 'init.lua'.

---@meta

---@class SaveCloudLog
---@field info fun(mensaje: string) Imprime un mensaje informativo.
---@field error fun(mensaje: string) Imprime un error.

---@class SaveCloudUI
---@field emit fun(evento: string, payload: string) Envia un evento al frontend.

---@class SaveCloudDB
---@field log_operation fun(plugin: string, accion: string, detalles: string) Guarda un registro en SQLite.

---@class SaveCloudCore
---@field log SaveCloudLog
---@field ui SaveCloudUI
---@field db SaveCloudDB

--- Objeto global inyectado por el core de Rust
savecloud = {} ---@type SaveCloudCore