/**
 * Build script para compilar el CLI con la API URL embebida.
 *
 * Uso:
 *   SYNC_GAMES_API_URL=https://tu-api.amazonaws.com bun run build:cli
 *
 * La variable SYNC_GAMES_API_URL se inyecta en el ejecutable en tiempo de compilación.
 * Si no se proporciona, el ejecutable requerirá configurarla en config.json.
 */
export {};

const apiUrl = process.env.SYNC_GAMES_API_URL;

if (!apiUrl) {
  console.error("❌ Falta la variable SYNC_GAMES_API_URL");
  console.error(
    '   Uso: SYNC_GAMES_API_URL="https://xxx.execute-api.region.amazonaws.com" bun run build:cli'
  );
  process.exit(1);
}

console.log(`\n🔧 Compilando CLI...`);
console.log(`   API URL: ${apiUrl}\n`);

const result = await Bun.build({
  entrypoints: ["src/cli/index.ts"],
  outdir: "dist",
  target: "bun",
  define: {
    "process.env.SYNC_GAMES_API_URL": JSON.stringify(apiUrl),
  },
});

if (!result.success) {
  console.error("❌ Build falló:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

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
  ],
  { stdout: "inherit", stderr: "inherit" }
);

const exitCode = await proc.exited;
if (exitCode !== 0) {
  process.exit(exitCode);
}

console.log("\n✅ Build completado: dist/sync-games");
console.log(`   API embebida: ${apiUrl}\n`);
