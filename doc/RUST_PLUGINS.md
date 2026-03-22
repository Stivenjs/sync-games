# Sistema de plugins -- Referencia para desarrolladores Rust

Este documento explica la arquitectura del sistema de plugins de SaveCloud, como extenderlo, y las responsabilidades de cada modulo.

---

## Descripcion general

El sistema de plugins permite que scripts Lua externos se enganchen al ciclo de vida de SaveCloud sin modificar el codigo Rust. Cada plugin corre dentro de su propia VM `mlua::Lua` aislada. La capa Rust es responsable de:

- Escanear el directorio de plugins y cargar cada plugin
- Exponer una API controlada a Lua (la tabla global `savecloud`)
- Llamar las funciones hook definidas en el `init.lua` de cada plugin
- Ejecutar el pipeline de pre-subida pasando los datos por cada plugin cargado

---

## Estructura de modulos

```
src/plugins/
  mod.rs       -- Declaraciones publicas de modulos y alias de tipo compartido
  api.rs       -- Registra la API Lua de savecloud.*
  plugin.rs    -- Representa y gestiona una instancia individual de plugin
  manager.rs   -- Carga y orquesta todos los plugins
```

---

## mod.rs

Declara los tres submodulos y exporta un alias de tipo compartido usado en toda la app:

```rust
pub type AppPluginManager = Arc<Mutex<manager::PluginManager>>;
```

Este tipo envuelve `PluginManager` en `Arc<Mutex<...>>` para que pueda compartirse de forma segura entre comandos Tauri y tareas async. Registralo como estado manejado de Tauri durante la inicializacion de la app.

---

## api.rs

### Proposito

`register_savecloud_api` se llama una vez por VM de plugin. Construye una tabla Lua llamada `savecloud` y le adjunta tres sub-tablas (`log`, `ui`, `db`), cada una conteniendo closures Rust llamables desde Lua.

Tambien deshabilita los globales `os` e `io` asignandoles `nil`, evitando que los plugins accedan al sistema de archivos o ejecuten comandos del sistema.

### Agregar un nuevo modulo a la API

Para agregar un nuevo modulo (por ejemplo `savecloud.storage`):

1. Crea una nueva funcion privada siguiendo el mismo patron que las existentes:

```rust
fn register_storage_module(lua: &Lua, parent_table: &Table) -> Result<()> {
    let storage_table = lua.create_table()?;

    let read = lua.create_function(|_, key: String| {
        // tu implementacion
        Ok(String::from("valor"))
    })?;

    storage_table.set("read", read)?;
    parent_table.set("storage", storage_table)?;

    Ok(())
}
```

2. Llamala dentro de `register_savecloud_api` antes de `globals.set("savecloud", savecloud_table)`:

```rust
register_storage_module(lua, &savecloud_table)?;
```

### Acceder a AppHandle dentro de closures

El `app_handle` que se pasa a `register_ui_module` se mueve al closure con `move`. Si necesitas `AppHandle` en un nuevo modulo, clonalo antes de pasarlo a `register_savecloud_api` y reenvía el clon a tu nueva funcion:

```rust
pub fn register_savecloud_api(lua: &Lua, app_handle: AppHandle) -> Result<()> {
    // ...
    register_ui_module(lua, &savecloud_table, app_handle.clone())?;
    register_mi_modulo(lua, &savecloud_table, app_handle.clone())?;
    // ...
}
```

---

## plugin.rs

### Proposito

La struct `Plugin` contiene dos cosas: el nombre del plugin (derivado del nombre de la carpeta) y su VM `mlua::Lua`. Cada plugin obtiene una VM completamente independiente -- no hay estado Lua compartido entre plugins.

### load_from_dir

Este es el constructor. Realiza estos pasos en orden:

1. Crea una nueva VM Lua
2. Llama `register_savecloud_api` para inyectar el global `savecloud` en esa VM
3. Extrae el nombre de la carpeta como nombre del plugin
4. Configura `package.path` dentro de Lua para que `require("modulo")` resuelva a archivos dentro de la carpeta del plugin
5. Lee y ejecuta `init.lua`
6. Devuelve la instancia de `Plugin` (las funciones hook no se llaman aqui)

La configuracion de `package.path` usa barras normales explicitamente para manejar correctamente las rutas de Windows:

```rust
let folder_str = dir_path.to_string_lossy().replace('\\', "/");
```

### trigger_on_init

Busca la funcion global `on_init` en el estado Lua del plugin y la llama si existe. Si el plugin no definio `on_init`, esto no hace nada. Si la funcion existe pero devuelve un error, el error se propaga al llamador.

### \_on_pre_upload

Busca `on_pre_upload`, le pasa los bytes crudos, y devuelve los bytes que retorne la funcion Lua. Si la funcion no esta definida, se devuelven los bytes originales sin cambios.

El parametro `data: &[u8]` se pasa directamente a Lua. mlua maneja la conversion a un string Lua (buffer de bytes). El tipo de retorno `Vec<u8>` tambien se espera de Lua.

### Agregar nuevos hooks

Para agregar un nuevo hook (por ejemplo `on_post_upload`):

1. Agrega un metodo a `Plugin`:

```rust
pub fn on_post_upload(&self, resultado: &str) -> Result<()> {
    let globals = self.lua.globals();

    if let Ok(func) = globals.get::<Function>("on_post_upload") {
        let _: () = func.call(resultado)?;
    }

    Ok(())
}
```

2. Llamalo desde `PluginManager` en el momento apropiado del ciclo de vida de la subida.

---

## manager.rs

### Proposito

`PluginManager` posee un `Vec<Plugin>`. Es responsable de descubrir plugins en disco y orquestar las llamadas a ellos.

### load_all

Itera sobre las entradas en `plugins_dir`. Por cada entrada que sea un directorio, llama `Plugin::load_from_dir`. Si la carga tiene exito, llama inmediatamente `trigger_on_init` en el nuevo plugin y luego lo agrega a `self.plugins`.

Los fallos se registran y se omiten -- un plugin malo no impide que los demas carguen.

### \_execute_pre_upload

Ejecuta el pipeline de pre-subida. Itera sobre todos los plugins cargados en orden, pasando los datos por el `_on_pre_upload` de cada uno. Si un plugin falla, el error se registra y los datos de antes de ese plugin se reenvian sin cambios al siguiente.

```
datos originales
    -> plugin_a::on_pre_upload  -> datos_modificados_a
    -> plugin_b::on_pre_upload  -> datos_modificados_b  (o originales si b falla)
    -> datos finales
```

---

## Integracion con Tauri

Para hacer disponible `PluginManager` en los comandos Tauri, configuralo como estado manejado durante la inicializacion de la app:

```rust
use std::sync::Arc;
use tokio::sync::Mutex;
use plugins::{AppPluginManager, manager::PluginManager};

fn main() {
    let plugin_manager: AppPluginManager = Arc::new(Mutex::new(PluginManager::new()));

    tauri::Builder::default()
        .setup(|app| {
            let plugins_dir = app.path().app_data_dir()?.join("plugins");
            let handle = app.handle().clone();

            let manager = plugin_manager.clone();
            tauri::async_runtime::spawn(async move {
                manager.lock().await.load_all(plugins_dir, handle);
            });

            Ok(())
        })
        .manage(plugin_manager)
        .run(tauri::generate_context!())
        .unwrap();
}
```

Dentro de un comando Tauri, accede al manager asi:

```rust
#[tauri::command]
async fn subir_archivo(
    data: Vec<u8>,
    manager: tauri::State<'_, AppPluginManager>,
) -> Result<(), String> {
    let procesado = manager.lock().await._execute_pre_upload(data);
    // continuar con la subida...
    Ok(())
}
```

---

## Dependencias

| Crate   | Uso                                               |
| ------- | ------------------------------------------------- |
| `mlua`  | VM Lua, bindings de funciones, creacion de tablas |
| `tauri` | `AppHandle` para emitir eventos al frontend       |
| `tokio` | Runtime async, `Mutex` para estado compartido     |

Los feature flags de `mlua` requeridos en `Cargo.toml`:

```toml
[dependencies]
mlua = { version = "...", features = ["lua54", "vendored"] }
```

Ajusta el feature de version Lua (`lua54`, `lua53`, etc.) para que coincida con la version que quieras embeber.

---

## Consideraciones de seguridad

- Los globales Lua `os` e `io` se asignan a `nil` al momento de registrar la API. Esto se hace por VM, por lo que aplica a cada plugin.
- Los plugins no pueden comunicarse entre si -- cada uno tiene su propia VM aislada sin globales compartidos.
- Los plugins solo pueden llamar las funciones explicitamente registradas en `api.rs`. No hay forma de que un plugin alcance codigo Rust que no este expuesto a traves de la tabla `savecloud`.
- Si agregas una nueva funcion a la API que realiza una operacion destructiva o privilegiada, considera si deberia estar protegida por algun tipo de verificacion de permisos antes de registrarla.
