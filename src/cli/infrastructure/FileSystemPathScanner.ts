import { existsSync, readdirSync } from "fs";
import { join } from "path";
import type { PathCandidate } from "@cli/domain/entities/PathCandidate";
import type { PathScanner } from "@cli/domain/ports/PathScanner";

/**
 * Extensiones que suelen usar los juegos para guardados (no hay estándar único).
 * Incluimos carpeta si contiene al menos un archivo con una de estas extensiones.
 */
const SAVE_EXTENSIONS = [
  ".sav",
  ".savx",
  ".save",
  ".sl2", // FromSoftware (Sekiro, Dark Souls, Elden Ring)
  ".dat",
  ".bin",
  ".json",
  ".bak", // copias de guardado
  ".db",
  ".sqlite",
  ".state",
  ".xml",
  ".cfg",
  ".ini", // config/guardado en algunos juegos
  ".sr",
  ".sav.", // ej. archivo.sav.001
];

function looksLikeSaveFile(name: string): boolean {
  const lower = name.toLowerCase();
  return SAVE_EXTENSIONS.some(
    (ext) => lower.endsWith(ext) || (ext.length > 1 && lower.includes(ext))
  );
}

/**
 * Comprueba si la carpeta (o un nivel de subcarpetas) contiene algún archivo que parezca guardado.
 */
function folderContainsSaveLikeFiles(dirPath: string): boolean {
  if (!existsSync(dirPath)) return false;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && looksLikeSaveFile(e.name)) return true;
      if (e.isDirectory() && !e.name.startsWith(".")) {
        const subPath = join(dirPath, e.name);
        const subEntries = readdirSync(subPath, { withFileTypes: true });
        if (subEntries.some((s) => s.isFile() && looksLikeSaveFile(s.name)))
          return true;
      }
    }
  } catch {
    // sin permiso o no es directorio
  }
  return false;
}

/**
 * Nombres de carpeta que no son juegos (editores, apps, sistema).
 * Se excluyen para reducir ruido en el scan. Comparación en minúsculas.
 */
const EXCLUDED_FOLDER_NAMES = new Set([
  "code",
  "cursor",
  "discord",
  "google",
  "microsoft",
  "spotify",
  "npm",
  "pnpm",
  "node_modules",
  "amplify",
  "turborepo",
  "nextjs-nodejs",
  "obs-studio",
  "qbittorrent",
  "utorrent web",
  "winrar",
  "process hacker 2",
  "sklauncher",
  "visual studio setup",
  "wago-app",
  "wago-app-updater",
  "xdg.config",
  "riot-client-ux",
  "firestorm launcher",
  "git extensions",
  "gitextensions",
  "github-copilot",
  "cmaketools",
  "connecteddevicesplatform",
  "launcher-updater",
  "overwolf",
  "overframe-ow-app-updater",
  "pnpm-state",
  "programs",
  "temp",
  "theme-liquid-docs-nodejs",
  "visualstudiodiscordrpc",
  "battleye",
  "nvidia corporation",
  "robloxpcgdk",
  "packages",
  "crashdumps",
  "squirreltemp",
  "steam",
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

    for (const template of templates) {
      const basePath = resolvePathTemplate(template);
      if (!basePath || !existsSync(basePath)) continue;

      const subdirs = listSubdirs(basePath);
      for (const { path: fullPath, name } of subdirs) {
        if (isExcludedFolderName(name)) continue;
        if (!folderContainsSaveLikeFiles(fullPath)) continue;
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
