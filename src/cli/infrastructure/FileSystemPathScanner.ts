import { existsSync, readdirSync } from "fs";
import { join, normalize } from "path";
import type { PathCandidate } from "@cli/domain/entities/PathCandidate";
import type { PathScanner } from "@cli/domain/ports/PathScanner";

/**
 * Extensiones exclusivas de guardados de juegos — alta confianza.
 */
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
 * Solo cuentan si hay al menos 2 archivos con estas extensiones o si se
 * combinan con un nombre sospechoso (save, slot, profile, etc.).
 */
const WEAK_SAVE_EXTENSIONS = [".dat", ".bin", ".bak"];

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

/**
 * Evalúa si una carpeta (hasta 1 nivel de profundidad) parece contener guardados de juego.
 * Requiere extensiones fuertes, o múltiples archivos débiles, o archivos débiles con nombre sospechoso.
 */
function folderContainsSaveLikeFiles(dirPath: string): boolean {
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
 * Nombres de carpeta que no son juegos (editores, apps, sistema, launchers).
 * Comparación en minúsculas.
 */
const EXCLUDED_FOLDER_NAMES = new Set([
  // Editores / IDEs
  "code",
  "cursor",
  "visual studio setup",
  "git extensions",
  "gitextensions",
  "github-copilot",
  "cmaketools",
  "visualstudiodiscordrpc",
  // Comunicación / social
  "discord",
  "spotify",
  // Navegadores / sistema
  "google",
  "microsoft",
  "nvidia corporation",
  "connecteddevicesplatform",
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
  // Utilidades
  "obs-studio",
  "qbittorrent",
  "utorrent web",
  "winrar",
  "process hacker 2",
  "xdg.config",
  // Launchers / plataformas (no son juegos en sí)
  "steam",
  "sklauncher",
  "riot-client-ux",
  "firestorm launcher",
  "launcher-updater",
  "overwolf",
  "overframe-ow-app-updater",
  "overframe",
  "wago-app",
  "wago-app-updater",
  "battleye",
  // Roblox (plataforma, no un juego con saves locales)
  "roblox",
  "robloxpcgdk",
  // Temp / basura
  "temp",
  "crashdumps",
  "squirreltemp",
  "programs",
  // sync-games (nuestro propio config)
  "sync-games",
]);

function isExcludedFolderName(folderName: string): boolean {
  return EXCLUDED_FOLDER_NAMES.has(folderName.toLowerCase().trim());
}

/**
 * Rutas base típicas donde suelen estar los guardados en Windows.
 * Se sustituyen variables: %USERPROFILE%, %APPDATA%, %LOCALAPPDATA%.
 */
const BASE_PATH_TEMPLATES_WIN32: string[] = [
  "%USERPROFILE%/Documents/My Games",
  "%USERPROFILE%/Documents",
  "%APPDATA%",
  "%LOCALAPPDATA%",
  "%USERPROFILE%/Saved Games",
  "%LOCALAPPDATA%/Low", // Unity / algunos juegos
];

function resolvePathTemplate(template: string): string {
  return template.replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? "");
}

function listSubdirs(dirPath: string): { path: string; name: string }[] {
  if (!existsSync(dirPath)) return [];
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => ({
        path: join(dirPath, e.name),
        name: e.name,
      }));
  } catch {
    return [];
  }
}

/**
 * Implementación de PathScanner: recorre rutas base típicas de Windows,
 * resuelve variables de entorno y lista subcarpetas como candidatos.
 */
export class FileSystemPathScanner implements PathScanner {
  async scan(): Promise<PathCandidate[]> {
    const templates =
      process.platform === "win32"
        ? BASE_PATH_TEMPLATES_WIN32
        : this.getUnixTemplates();
    const candidates: PathCandidate[] = [];
    const seenPaths = new Set<string>();

    for (const template of templates) {
      const basePath = resolvePathTemplate(template);
      if (!basePath || !existsSync(basePath)) continue;

      const subdirs = listSubdirs(basePath);
      for (const { path: fullPath, name } of subdirs) {
        const normalizedFull = normalize(fullPath).toLowerCase();
        if (seenPaths.has(normalizedFull)) continue;
        if (isExcludedFolderName(name)) continue;
        if (!folderContainsSaveLikeFiles(fullPath)) continue;
        seenPaths.add(normalizedFull);
        candidates.push({
          path: fullPath,
          folderName: name,
          basePath,
        });
      }
    }

    return candidates;
  }

  private getUnixTemplates(): string[] {
    const home = process.env.HOME ?? "";
    if (!home) return [];
    return [`${home}/.local/share`, `${home}/.config`, `${home}/Documents`];
  }
}
