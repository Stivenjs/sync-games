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

Instalación: `bun install`

## Variables de entorno

- `BUCKET_NAME` — Nombre del bucket S3 (en Lambda lo inyecta Serverless).
- Para desarrollo local: `BUCKET_NAME`, `AWS_REGION`, `PORT` (opcional).

## API (ejemplo)

- `GET /health` — Health check
- `GET /saves` — Lista guardados del usuario (header: `x-user-id`)
- `POST /saves/upload-url` — Body: `{ "gameId", "filename" }` → devuelve `uploadUrl` y `key`
- `POST /saves/download-url` — Body: `{ "gameId", "key" }` → devuelve `downloadUrl`

El cliente sube/descarga los archivos directamente a S3 usando las URLs firmadas.
