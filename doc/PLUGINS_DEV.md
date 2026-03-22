# Guia de desarrollo de plugins para SaveCloud

Esta guia explica como escribir plugins para SaveCloud. Los plugins se escriben en Lua y no requieren ningun conocimiento de Rust.

---

## Como funcionan los plugins

SaveCloud escanea una carpeta llamada `plugins/` al iniciar. Cada subcarpeta dentro de ella es tratada como un plugin. Si la subcarpeta contiene un archivo llamado `init.lua`, SaveCloud lo carga y lo ejecuta dentro de un entorno Lua aislado.

Tu plugin puede definir funciones hook que SaveCloud llama en momentos especificos (como cuando la app inicia, o antes de subir un archivo). Tambien puedes llamar la API de SaveCloud para registrar mensajes, emitir eventos de UI, o guardar operaciones en la base de datos.

---

## Estructura de carpetas

```
plugins/
  mi-plugin/
    init.lua
    helpers.lua      (opcional, puedes requerirlo desde init.lua)
```

El nombre de la carpeta se convierte en el nombre del plugin. Todo plugin debe tener un `init.lua` en la raiz de su carpeta.

---

## Ejemplo minimo

```lua
-- plugins/mi-plugin/init.lua

function on_init()
    savecloud.log.info("mi-plugin cargo correctamente")
end
```

Ese es el plugin valido mas pequeno. El hook `on_init` se llama una vez cuando SaveCloud inicia.

---

## Hooks disponibles

Los hooks son funciones Lua globales que defines en `init.lua`. SaveCloud las llama automaticamente. No necesitas definir todas, solo las que necesites.

### on_init

Se llama una vez cuando el plugin es cargado al iniciar.

```lua
function on_init()
    savecloud.log.info("Plugin iniciado")
end
```

### on_pre_upload

Se llama antes de subir un archivo. Recibe los bytes crudos del archivo y debe devolver bytes (los mismos o modificados).

```lua
function on_pre_upload(data)
    savecloud.log.info("A punto de subir un archivo")
    -- Puedes modificar los bytes aqui y devolver la version modificada
    return data
end
```

Si no defines `on_pre_upload`, el archivo pasa sin cambios.

---

## La API de SaveCloud

SaveCloud expone una tabla global llamada `savecloud` con los siguientes modulos.

### savecloud.log

Usa esto para imprimir mensajes desde tu plugin.

```lua
savecloud.log.info("Todo esta bien")
savecloud.log.error("Algo salio mal")
```

`info` imprime en la salida estandar. `error` imprime en la salida de error estandar.

### savecloud.ui

Usa esto para enviar eventos al frontend de la app. El frontend debe estar escuchando el nombre de evento que uses.

```lua
savecloud.ui.emit("subida_iniciada", "foto.jpg")
```

Ambos argumentos son strings. El primero es el nombre del evento, el segundo es el payload.

### savecloud.db

Usa esto para registrar una operacion en el log de la base de datos.

```lua
savecloud.db.log_operation("mi-plugin", "comprimir", "archivo reducido un 40%")
```

Los tres argumentos son: nombre del plugin, nombre de la accion, y un string de detalles.

---

## Requerir otros archivos

Puedes dividir tu plugin en multiples archivos Lua y usar `require` para cargarlos.

```lua
-- plugins/mi-plugin/init.lua
local helpers = require("helpers")

function on_init()
    helpers.setup()
end
```

```lua
-- plugins/mi-plugin/helpers.lua
local M = {}

function M.setup()
    savecloud.log.info("helpers cargado")
end

return M
```

SaveCloud configura automaticamente el `package.path` de Lua para buscar dentro de la carpeta de tu plugin, asi que `require("helpers")` encontrara `helpers.lua` en el mismo directorio que `init.lua`.

---

## Restricciones de seguridad

Las siguientes librerias estandar de Lua estan deshabilitadas por seguridad:

- `os` -- sin acceso al sistema operativo
- `io` -- sin acceso al sistema de archivos

Si tu plugin necesita leer o escribir archivos, debes solicitar esa capacidad a traves de la API de SaveCloud en lugar de usar las librerias de Lua directamente.

---

## Manejo de errores

Si tu funcion `on_init` lanza un error, SaveCloud imprimira el error y omitira el plugin. Los demas plugins se cargaran con normalidad.

Si tu funcion `on_pre_upload` lanza un error, el error se registra y los datos originales sin modificar se pasan al siguiente plugin en el pipeline.

Puedes manejar errores dentro de tu propio plugin usando `pcall` de Lua:

```lua
function on_init()
    local ok, err = pcall(function()
        -- codigo que podria fallar
    end)

    if not ok then
        savecloud.log.error("Inicializacion fallida: " .. err)
    end
end
```

---

## Ejemplo completo

```lua
-- plugins/compresor/init.lua

function on_init()
    savecloud.log.info("Plugin compresor listo")
end

function on_pre_upload(data)
    local tamano_original = #data
    savecloud.log.info("Archivo recibido: " .. tamano_original .. " bytes")

    savecloud.db.log_operation("compresor", "pre_upload", "procesados " .. tamano_original .. " bytes")
    savecloud.ui.emit("plugin_procesado", "compresor")

    return data
end
```
