import { existsSync, readdirSync } from "fs";
import { join } from "path";

// ─── Extensiones de guardados ───────────────────────────────────────────────

/** Extensiones exclusivas de guardados de juegos — alta confianza. */
const STRONG_SAVE_EXTENSIONS = [
  ".sav",
  ".savx",
  ".save",
  ".sl2",
  ".state",
  ".sr",
];

/**
 * Extensiones que pueden ser guardados pero también las usan apps normales.
 * Solo cuentan si hay 3+ archivos o si el nombre sugiere guardado.
 */
const WEAK_SAVE_EXTENSIONS = [".dat", ".bin", ".bak"];

/** Palabras en el nombre de archivo que sugieren que es un guardado. */
const SAVE_NAME_HINTS = [
  "save",
  "slot",
  "profile",
  "progress",
  "checkpoint",
  "autosave",
  "quicksave",
  "player",
  "game",
];

function isStrongSaveFile(name: string): boolean {
  const lower = name.toLowerCase();
  return STRONG_SAVE_EXTENSIONS.some(
    (ext) => lower.endsWith(ext) || lower.includes(ext + ".")
  );
}

function isWeakSaveFile(name: string): boolean {
  const lower = name.toLowerCase();
  return WEAK_SAVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function nameHintsSave(name: string): boolean {
  const lower = name.toLowerCase();
  return SAVE_NAME_HINTS.some((h) => lower.includes(h));
}

function collectFiles(dirPath: string): string[] {
  const names: string[] = [];
  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const e of entries) {
    if (e.isFile()) {
      names.push(e.name);
    } else if (e.isDirectory() && !e.name.startsWith(".")) {
      try {
        const subEntries = readdirSync(join(dirPath, e.name), {
          withFileTypes: true,
        });
        for (const s of subEntries) {
          if (s.isFile()) names.push(s.name);
        }
      } catch {
        /* sin permiso */
      }
    }
  }
  return names;
}

/**
 * Evalúa si una carpeta (hasta 1 nivel de profundidad) parece contener guardados de juego.
 * Requiere extensiones fuertes, o múltiples archivos débiles, o archivos débiles con nombre sospechoso.
 */
export function folderContainsSaveLikeFiles(dirPath: string): boolean {
  if (!existsSync(dirPath)) return false;
  try {
    const filesToCheck = collectFiles(dirPath);
    let weakCount = 0;
    for (const name of filesToCheck) {
      if (isStrongSaveFile(name)) return true;
      if (isWeakSaveFile(name)) {
        if (nameHintsSave(name)) return true;
        weakCount++;
      }
    }
    return weakCount >= 3;
  } catch {
    return false;
  }
}

// ─── Carpetas excluidas ─────────────────────────────────────────────────────

/** Nombres exactos de carpeta que no son juegos (comparación en minúsculas). */
const EXCLUDED_FOLDER_NAMES = new Set([
  // Sistema / raíz de Windows
  "windows",
  "users",
  "program files",
  "program files (x86)",
  "programdata",
  "recovery",
  "perflogs",
  "$recycle.bin",
  "system volume information",
  "msocache",
  "boot",
  "intel",
  "amd",
  // Editores / IDEs
  "code",
  "cursor",
  "visual studio setup",
  "git extensions",
  "gitextensions",
  "github-copilot",
  "cmaketools",
  "visualstudiodiscordrpc",
  "jetbrains",
  // Comunicación / social
  "discord",
  "spotify",
  "zoom",
  "slack",
  "telegram desktop",
  "whatsapp",
  // Navegadores / sistema
  "google",
  "microsoft",
  "nvidia corporation",
  "connecteddevicesplatform",
  "mozilla",
  "chrome",
  "firefox",
  "edge",
  "opera",
  "brave",
  // Gestores de paquetes / dev
  "npm",
  "pnpm",
  "pnpm-state",
  "node_modules",
  "packages",
  "amplify",
  "turborepo",
  "nextjs-nodejs",
  "theme-liquid-docs-nodejs",
  ".bun",
  ".npm",
  ".cache",
  ".local",
  ".config",
  // Utilidades
  "obs-studio",
  "qbittorrent",
  "utorrent web",
  "winrar",
  "7-zip",
  "process hacker 2",
  "xdg.config",
  "ccleaner",
  // Launchers / plataformas
  "steam",
  "steamlibrary",
  "sklauncher",
  "riot-client-ux",
  "riot games",
  "firestorm launcher",
  "launcher-updater",
  "overwolf",
  "overframe-ow-app-updater",
  "overframe",
  "wago-app",
  "wago-app-updater",
  "battleye",
  "epic games",
  "ea games",
  "ubisoft",
  "gog galaxy",
  "battle.net",
  // Roblox
  "roblox",
  "robloxpcgdk",
  // Temp / basura
  "temp",
  "tmp",
  "crashdumps",
  "squirreltemp",
  "programs",
  "logs",
  "cache",
  // Nuestro propio config
  "sync-games",
]);

/**
 * Patrones parciales: si el nombre de la carpeta contiene alguno de estos, se excluye.
 * Útil para carpetas como "Server_Pack", "Backup_2024", etc.
 */
const EXCLUDED_PARTIAL_PATTERNS = [
  "server_pack",
  "server pack",
  "_server",
  "backup",
  "driver",
  "installer",
  "setup",
  "redistributable",
  "redist",
  "runtime",
  "sdk",
  "dotnet",
  ".net",
  "visual c++",
  "vcredist",
  "directx",
];

export function isExcludedFolder(folderName: string): boolean {
  const lower = folderName.toLowerCase().trim();
  if (EXCLUDED_FOLDER_NAMES.has(lower)) return true;
  return EXCLUDED_PARTIAL_PATTERNS.some((p) => lower.includes(p));
}

// ─── Rutas base ─────────────────────────────────────────────────────────────

export const BASE_PATH_TEMPLATES_WIN32: string[] = [
  "%USERPROFILE%/Documents/My Games",
  "%USERPROFILE%/Documents",
  "%APPDATA%",
  "%LOCALAPPDATA%",
  "%USERPROFILE%/Saved Games",
  "%LOCALAPPDATA%/Low",
];

export const DEFAULT_STEAM_PATH_WIN32 = "C:\\Program Files (x86)\\Steam";
