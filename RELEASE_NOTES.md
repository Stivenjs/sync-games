# Notas de versión

## v1.2.1 (actual)

### API (backend)

- **Endpoints batch:** `POST /saves/upload-urls` y `POST /saves/download-urls` para obtener varias URLs firmadas en una sola petición, reduciendo invocaciones Lambda y latencia.
- **Eliminar juego en la nube:** `POST /saves/delete-game` — borra todos los objetos S3 bajo `userId/gameId/`.
- **Renombrar juego en la nube:** `POST /saves/rename-game` — copia los guardados al nuevo prefijo y borra el antiguo (migración en S3).
- Mantenidos los endpoints unitarios `upload-url` y `download-url` por compatibilidad.
- **IAM:** el Lambda incluye `s3:DeleteObject` además de GetObject/PutObject/ListBucket para que delete y rename funcionen.

### App de escritorio (Tauri)

- **Subida/descarga más rápidas:** uso de los endpoints batch de la API (una llamada por juego con todos sus archivos) en lugar de una por archivo.
- **“Subir todos” / “Descargar todos” en paralelo:** hasta 4 juegos se procesan a la vez (batch de juegos en Rust).
- **Eliminar juego:** al confirmar eliminación se borra el juego de la config y sus guardados en la nube (llamada a delete-game). Si falla el borrado en la nube se muestra un aviso pero el juego se quita igual de la app.
- **Editar nombre/ID del juego:** el modal de edición permite cambiar el identificador del juego; se actualiza en la app, en el config y en S3 (rename-game en la API + `rename_game` en config local).
- **Config en la nube:** subida automática del `config.json` tras cambios (debounce 2,5 s) y respaldo periódico cada 5 minutos.
- **Conflictos de descarga en batch:** un solo chequeo de conflictos para todos los juegos antes de “Descargar todos” (`sync_check_download_conflicts_batch`).
- **Steam App ID en batch:** una llamada para resolver varios nombres de juego a Steam App ID.
- **Limpieza de backups locales:** antes de descargar desde la nube se crea una copia local en `sync-games/backups/[juego]/[fecha]`. Para no acumular infinitos backups: (1) tras cada descarga se eliminan los backups antiguos dejando solo los últimos N por juego; (2) en Configuración → “Respaldo local automático” se puede elegir cuántos mantener (3, 5, 10 o 20) y ejecutar “Liberar espacio ahora”. La preferencia se guarda en `config.json` (`keepBackupsPerGame`) y se usa también para la auto-limpieza.
- **UI:** transiciones entre pestañas (framer-motion), mejor organización de páginas (Juegos, Amigos, Configuración), modales de confirmación al importar por link y al copiar guardados de un amigo, botón Actualizar con estado de carga.
- **Estado:** menos `useState` dispersos; uso de `useReducer` en páginas principales (juegos, amigos, configuración).

### Correcciones

- Modal de plantilla (“Usar config como plantilla”) ya no mostraba “No hay juego seleccionado” al elegir un juego de amigo.
- Un solo indicador de carga en el botón Actualizar (sin Spinner duplicado).
- Renombrar en S3: `CopySource` en S3 usa `encodeURIComponent` para keys con caracteres especiales.

---

## Versiones anteriores

Resúmenes breves de entregas previas (ajustar según historial real del proyecto):

- **v0.1.x:** API inicial (upload-url, download-url, list saves), CLI con menú y comandos, app de escritorio Tauri con listado de juegos, sync por juego, amigos (link compartido, User ID), configuración y respaldo del config en la nube.
