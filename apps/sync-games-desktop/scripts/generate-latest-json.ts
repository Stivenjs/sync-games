/**
 * Genera latest.json para GitHub Releases.
 * Ejecutar después de `tauri build` con firma.
 *
 * Uso: bun run scripts/generate-latest-json.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const tauriConf = JSON.parse(
  readFileSync(resolve(import.meta.dir, "../src-tauri/tauri.conf.json"), "utf-8")
);
const VERSION = tauriConf.version;
const endpoints = tauriConf.plugins?.updater?.endpoints?.[0] ?? "";
const match = endpoints.match(/github\.com\/([^/]+)\/([^/]+)\//);
const GITHUB_USER = match?.[1] ?? "Stivenjs";
const REPO = match?.[2] ?? "savecloud";

const bundleDir = resolve(
  import.meta.dir,
  "../src-tauri/target/release/bundle/nsis"
);

const sigPath = resolve(bundleDir, `SaveCloud_${VERSION}_x64-setup.exe.sig`);

let sigContent: string;
try {
  sigContent = readFileSync(sigPath, "utf-8").trim();
} catch (e) {
  console.error(
    "No se encontró el archivo .sig. ¿Hiciste `tauri build` con TAURI_SIGNING_PRIVATE_KEY_PATH?"
  );
  console.error("Ruta buscada:", sigPath);
  process.exit(1);
}

const latest = {
  version: VERSION,
  notes: "",
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: sigContent,
      url: `https://github.com/${GITHUB_USER}/${REPO}/releases/download/v${VERSION}/SaveCloud_${VERSION}_x64-setup.exe`,
    },
  },
};

const outputPath = resolve(import.meta.dir, "../latest.json");
await Bun.write(outputPath, JSON.stringify(latest, null, 2));
console.log("latest.json generado en:", outputPath);
console.log("Súbelo como asset en tu release de GitHub.");
