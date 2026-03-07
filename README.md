# SaveCloud

Servidor de guardado en la nube para juegos (S3 + Lambda) y app de escritorio para sincronizar guardados. Clean Architecture en backend y CLI.

## Contenido del repositorio

- **Backend (API + CLI):** raíz del repo — Fastify, TypeScript, despliegue en AWS Lambda + API Gateway, almacenamiento en S3.
- **App de escritorio:** `apps/sync-games-desktop` — Tauri 2 (React + Vite + Rust), interfaz gráfica para gestionar juegos, subir/descargar guardados, amigos y configuración.

## Stack del backend

- **Runtime:** Bun (local) / Node.js 20 (Lambda)
- **Lenguaje:** TypeScript
- **API:** Fastify
- **Deploy:** Serverless Framework → AWS Lambda + API Gateway
- **Almacenamiento:** AWS S3

## Stack de la app de escritorio

- **Frontend:** React 19, Vite, HeroUI, TanStack Query, Framer Motion
- **Backend local:** Tauri 2 (Rust) — comandos para config, sincronización, Steam, etc.
- **Plugins Tauri:** dialog, autostart, notification, updater, opener

## Estructura del backend (Clean Architecture)

```
src/
├── domain/                 # Entidades y reglas de negocio
│   ├── entities/
│   └── ports/
├── application/            # Casos de uso (orquestación)
│   └── use-cases/
├── infrastructure/         # Implementaciones concretas (S3, etc.)
│   └── persistence/
└── interfaces/             # Entrada/salida (HTTP, Lambda)
    ├── http/               # Fastify app, rutas
    └── lambda/             # Handler para AWS Lambda
```

Las dependencias apuntan hacia dentro: `interfaces` → `application` → `domain`; `infrastructure` implementa los puertos definidos en `domain`.

## Scripts (raíz del repo)

| Script                           | Descripción                                         |
| -------------------------------- | --------------------------------------------------- |
| `bun run build`                  | Compila TypeScript del backend                      |
| `bun run dev`                    | API en local con hot-reload (puerto 3000)           |
| `bun run deploy:dev`             | Despliega a AWS (stage `dev`)                       |
| `bun run deploy:live`            | Despliega a AWS (stage `live`)                      |
| `bun run invoke:local`           | Invoca la función Lambda en local                   |
| `bun run cli`                    | Ejecuta el CLI (menú interactivo)                   |
| `bun run cli -- add <id> <ruta>` | Añade un juego desde la CLI                         |
| `bun run build:cli`              | Genera ejecutable en `dist/` (ej. `savecloud.exe`)  |
| `bun run desktop`                | App de escritorio en modo desarrollo (Tauri + Vite) |
| `bun run desktop:dev`            | Solo frontend (Vite)                                |
| `bun run desktop:build`          | Build de instalador de la app de escritorio         |
| `bun run api-key`                | Genera API key para el backend                      |
| `bun run api-key:live`           | Genera API key para el backend (live)               |
| `bun run desktop:latest-json`    | Genera latest.json para la app de escritorio        |
| `bun run desktop:icon`           | Genera icono para la app de escritorio              |

Instalación: `bun install` en la raíz.

## Cómo ejecutar el CLI

- **Menú interactivo:** `bun run cli` (o `savecloud` si hiciste `bun link`) → menú para añadir juego, listar, subir/descargar, config, etc.
- **Modo comando:** `bun run cli -- add elden-ring "%APPDATA%/EldenRing"` o `bun run cli -- upload`

Config por defecto: `%APPDATA%/savecloud/config.json` (Windows) o `~/.config/savecloud/config.json` (Linux/macOS).

## App de escritorio

Desde la raíz: `bun run desktop`. Requiere Rust y dependencias de Tauri instaladas.

- **Juegos:** listado, añadir/editar/eliminar, subir a la nube, descargar, “Subir todos” / “Descargar todos” (con operaciones batch y paralelismo). Al eliminar un juego se borra también de la nube (S3). Al editar se puede cambiar el nombre/ID del juego; se actualiza en la app, en el config y en S3 (los guardados se migran al nuevo nombre).
- **Amigos:** importar por link compartido, ver perfil por User ID, copiar guardados de un amigo.
- **Configuración:** API URL, User ID, API Key, autostart, notificaciones, respaldo/restauración del config en la nube (con subida automática tras cambios).
- **Historial:** operaciones de sync recientes.

## Variables de entorno (backend / Lambda)

- `BUCKET_NAME` — Nombre del bucket S3 (Serverless lo inyecta en Lambda).
- `API_KEY` — (opcional) Si está definido, la API exige header `x-api-key`.
- Desarrollo local: `BUCKET_NAME`, `AWS_REGION`, `PORT` (opcional).

## API

| Método y ruta               | Descripción                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GET /health`               | Health check                                                                                                    |
| `GET /saves`                | Lista guardados del usuario (headers: `x-user-id`, `x-api-key` si aplica)                                       |
| `POST /saves/upload-url`    | Una URL de subida. Body: `{ "gameId", "filename" }` → `{ "uploadUrl", "key" }`                                  |
| `POST /saves/upload-urls`   | **Batch:** varias URLs de subida. Body: `{ "items": [{ "gameId", "filename" }, ...] }` → `{ "urls": [...] }`    |
| `POST /saves/download-url`  | Una URL de descarga. Body: `{ "gameId", "key" }` → `{ "downloadUrl" }`                                          |
| `POST /saves/download-urls` | **Batch:** varias URLs de descarga. Body: `{ "items": [{ "gameId", "key" }, ...] }` → `{ "urls": [...] }`       |
| `POST /saves/delete-game`   | Borra todos los guardados del juego en S3. Body: `{ "gameId" }` → 204.                                          |
| `POST /saves/rename-game`   | Renombra un juego en S3 (copia a nuevo prefijo y borra el antiguo). Body: `{ "oldGameId", "newGameId" }` → 204. |

El cliente sube/descarga los archivos directamente a S3 usando las URLs firmadas. La app de escritorio usa los endpoints batch para reducir llamadas e invocaciones Lambda. Eliminar y renombrar requieren que el Lambda tenga permiso `s3:DeleteObject` (incluido en el `serverless.yml`).

## Probar que los guardados se suben a S3

1. **API en local:**

   ```bash
   export BUCKET_NAME=tu-bucket-savecloud
   export AWS_REGION=us-east-2
   bun run dev
   ```

   API en `http://localhost:3000`.

2. **Configurar el CLI** (o la app de escritorio) con la URL de la API y un `userId` en el JSON de config. Añade un juego con una ruta con archivos de guardado.

3. **Subir:** `bun run cli -- upload <game-id>` o desde la app de escritorio. Comprueba en S3 la clave `userId/gameId/<archivo>`.

Si desplegaste en AWS (`bun run deploy:dev`), usa en config la URL del API Gateway (ej. `https://xxxx.execute-api.us-east-2.amazonaws.com`).
