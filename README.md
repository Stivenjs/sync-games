# Sync Games

Servidor de guardado en la nube para juegos (S3 + Lambda). Clean Architecture + Clean Code.

## Stack

- **Runtime:** Bun (local) / Node.js 20 (Lambda)
- **Lenguaje:** TypeScript
- **API:** Fastify
- **Deploy:** Serverless Framework → AWS Lambda + API Gateway
- **Almacenamiento:** AWS S3 (sin DynamoDB por ahora)

## Estructura (Clean Architecture)

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

## Scripts

- `bun run build` — Compila TypeScript
- `bun run dev` — Ejecuta la API en local con hot-reload (Fastify en puerto 3000)
- `bun run deploy` — Despliega a AWS (Serverless)
- `bun run deploy:dev` — Despliega al stage `dev`
- `bun run invoke:local` — Invoca la función Lambda en local
- `bun run cli` — Ejecuta el CLI (ej.: `bun run cli -- add elden-ring "%APPDATA%/EldenRing"`)
- `bun run build:cli` — Genera un ejecutable en `dist/sync-games` (o `sync-games.exe` en Windows)

Instalación: `bun install`

## Cómo ejecutar el CLI

- **Menú interactivo:** ejecuta `sync-games` (o `bun run cli`) **sin argumentos** → se abre un menú con flechas para elegir: añadir juego, listar, analizar rutas, subir/descargar guardados, ver config, salir. Usa **@inquirer/prompts** (select, input, confirm).

- **Modo comando (scripting):**  
  `sync-games <comando> [opciones]`  
  Ejemplo: `sync-games add elden-ring "%APPDATA%/EldenRing"` o `sync-games upload`

1. **Desde el repo:** `bun run cli` (menú) o `bun run cli -- add ...` (comando).
2. **Comando global:** `bun link` → en cualquier sitio: `sync-games` (menú) o `sync-games list`.
3. **Ejecutable único:** `bun run build:cli` → `dist/sync-games.exe`; al ejecutarlo sin args se abre el menú.

## Estructura del CLI (Clean Architecture)

```
src/cli/
├── index.ts                # Composition root + despacho de comandos
├── domain/
│   ├── entities/           # Config, ConfiguredGame
│   └── ports/              # ConfigRepository
├── application/
│   └── use-cases/          # AddGame, ListGames, GetConfigPath
└── infrastructure/
    └── FileConfigRepository.ts   # Persistencia en JSON (APPDATA / ~/.config)
```

Config por defecto: `%APPDATA%/sync-games/config.json` (Windows) o `~/.config/sync-games/config.json` (Linux/macOS).

## Variables de entorno

- `BUCKET_NAME` — Nombre del bucket S3 (en Lambda lo inyecta Serverless).
- Para desarrollo local: `BUCKET_NAME`, `AWS_REGION`, `PORT` (opcional).

## API (ejemplo)

- `GET /health` — Health check
- `GET /saves` — Lista guardados del usuario (header: `x-user-id`)
- `POST /saves/upload-url` — Body: `{ "gameId", "filename" }` → devuelve `uploadUrl` y `key`
- `POST /saves/download-url` — Body: `{ "gameId", "key" }` → devuelve `downloadUrl`

El cliente sube/descarga los archivos directamente a S3 usando las URLs firmadas.

## Probar que los guardados se suben a S3

1. **API en local** (necesitas AWS con un bucket S3 y credenciales configuradas):
   ```bash
   export BUCKET_NAME=tu-bucket-sync-games   # o el que uses en dev
   export AWS_REGION=us-east-2
   bun run dev
   ```
   La API queda en `http://localhost:3000`.

2. **Configurar el CLI** con la URL de la API y un `userId`:
   - Ejecuta `sync-games config` (o `bun run cli -- config`) para ver la ruta del archivo de config.
   - Edita ese JSON y añade:
     ```json
     {
       "apiBaseUrl": "http://localhost:3000",
       "userId": "test-user",
       "games": []
     }
     ```
   - Añade un juego con una ruta donde tengas archivos de guardado (o una carpeta de prueba con un `.sav` o `.json`):
     ```bash
     bun run cli -- add mi-juego "./ruta/a/tus/guardados"
     ```

3. **Subir**:
   ```bash
   bun run cli -- upload mi-juego
   ```
   O abre el menú (`bun run cli`) y elige «Subir guardados a la nube». Deberías ver algo como `✓ archivo.sav` por cada archivo subido.

4. **Comprobar en S3**: en la consola de AWS S3, entra al bucket y revisa que exista la clave `test-user/mi-juego/<nombre-del-archivo>`.

Si desplegaste la API en AWS (`bun run deploy:dev`), pon en el config `apiBaseUrl` con la URL del API Gateway (ej. `https://xxxx.execute-api.us-east-2.amazonaws.com`) y repite los pasos 2–4.
