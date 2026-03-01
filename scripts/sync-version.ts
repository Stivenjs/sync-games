#!/usr/bin/env bun
/**
 * Sincroniza la versión desde el tag de Git en package.json y tauri.conf.json.
 * Uso: VERSION=0.1.7 bun run scripts/sync-version.ts
 * En CI: GITHUB_REF=refs/tags/v0.1.7 bun run scripts/sync-version.ts
 */
const version =
  process.env.VERSION ||
  process.env.GITHUB_REF?.replace(/^refs\/tags\/v?/, "") ||
  "0.0.0";
const root = process.cwd();

const pkgRootPath = `${root}/package.json`;
const pkgDesktopPath = `${root}/apps/sync-games-desktop/package.json`;
const tauriConfPath = `${root}/apps/sync-games-desktop/src-tauri/tauri.conf.json`;

const pkgRoot = await Bun.file(pkgRootPath).json();
const pkgDesktop = await Bun.file(pkgDesktopPath).json();

for (const [path, obj] of [
  [pkgRootPath, pkgRoot],
  [pkgDesktopPath, pkgDesktop],
] as const) {
  obj.version = version;
  await Bun.write(path, JSON.stringify(obj, null, 2) + "\n");
}

const tauri = await Bun.file(tauriConfPath).json();
tauri.version = version;
await Bun.write(tauriConfPath, JSON.stringify(tauri, null, 2) + "\n");

console.log(`Version synced to ${version}`);

export {};
