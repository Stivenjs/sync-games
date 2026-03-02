#!/usr/bin/env bun
/**
 * Genera latest.json para el updater de Tauri a partir de los artifacts descargados en CI.
 * Solo debe ejecutarse en la GitHub Action de release, después de descargar los artifacts.
 *
 * Uso:
 *   VERSION=0.1.7 GITHUB_REPOSITORY=Stivenjs/sync-games bun run scripts/generate-updater-json.ts
 *
 * Espera la estructura:
 *   desktop-windows/nsis/*.exe.sig
 *   desktop-linux/appimage/*.AppImage.sig
 *   desktop-macos-arm64/macos/*.sig
 *   desktop-macos-x64/macos/*.sig
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

const raw =
  process.env.VERSION ||
  process.env.GITHUB_REF?.replace(/^refs\/tags\/v?/, "") ||
  "0.0.0";
const VERSION = raw.replace(/^v/, ""); // semver sin "v"
const REPO = process.env.GITHUB_REPOSITORY || "Stivenjs/sync-games";
const BASE_URL = `https://github.com/${REPO}/releases/download/v${VERSION}`;

const cwd = process.cwd();

const ARTIFACT_PLATFORM: Record<string, string> = {
  "desktop-windows": "windows-x86_64",
  "desktop-linux": "linux-x86_64",
  "desktop-macos-arm64": "darwin-aarch64",
  "desktop-macos-x64": "darwin-x86_64",
};

function findFirstSig(dir: string): { sigPath: string; installerName: string } | null {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFirstSig(full);
      if (found) return found;
    } else if (entry.name.endsWith(".sig")) {
      return { sigPath: full, installerName: entry.name.slice(0, -4) };
    }
  }
  return null;
}

const platforms: Record<string, { signature: string; url: string }> = {};

for (const [artifact, platform] of Object.entries(ARTIFACT_PLATFORM)) {
  const artifactDir = resolve(cwd, artifact);
  const found = findFirstSig(artifactDir);
  if (found) {
    const sigContent = readFileSync(found.sigPath, "utf-8").trim();
    const url = `${BASE_URL}/${found.installerName}`;
    platforms[platform] = { signature: sigContent, url };
  }
}

if (Object.keys(platforms).length === 0) {
  console.error(
    "No se encontraron archivos .sig. ¿Los artifacts de desktop tienen createUpdaterArtifacts?"
  );
  process.exit(1);
}

const latest = {
  version: VERSION,
  notes: "",
  pub_date: new Date().toISOString(),
  platforms,
};

const outputPath = resolve(cwd, "release/latest.json");
const { mkdir } = await import("fs/promises");
await mkdir(resolve(cwd, "release"), { recursive: true });
await Bun.write(outputPath, JSON.stringify(latest, null, 2));
console.log("latest.json generado:", outputPath);
console.log("Plataformas:", Object.keys(platforms).join(", "));
