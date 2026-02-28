/**
 * Build script para compilar el CLI con la API URL y API key embebidas.
 *
 * Uso:
 *   SYNC_GAMES_API_URL=https://... SYNC_GAMES_API_KEY=tu-key bun run build:cli
 */
export {};

const apiUrl = process.env.SYNC_GAMES_API_URL;
const apiKey = process.env.SYNC_GAMES_API_KEY;

if (!apiUrl || !apiKey) {
  console.error("❌ Faltan variables de entorno:");
  if (!apiUrl) console.error("   - SYNC_GAMES_API_URL");
  if (!apiKey) console.error("   - SYNC_GAMES_API_KEY");
  console.error(
    '\n   Uso: SYNC_GAMES_API_URL="https://..." SYNC_GAMES_API_KEY="..." bun run build:cli'
  );
  process.exit(1);
}

console.log(`\n🔧 Compilando CLI...`);
console.log(`   API URL: ${apiUrl}`);
console.log(`   API Key: ${"*".repeat(apiKey.length)}\n`);

const proc = Bun.spawn(
  [
    "bun",
    "build",
    "src/cli/index.ts",
    "--compile",
    "--outfile",
    "dist/sync-games",
    "--define",
    `process.env.SYNC_GAMES_API_URL=${JSON.stringify(apiUrl)}`,
    "--define",
    `process.env.SYNC_GAMES_API_KEY=${JSON.stringify(apiKey)}`,
  ],
  { stdout: "inherit", stderr: "inherit" }
);

const exitCode = await proc.exited;
if (exitCode !== 0) {
  process.exit(exitCode);
}

console.log("\n✅ Build completado: dist/sync-games\n");
