import { existsSync, readdirSync, statSync } from "fs";
import { join, relative, resolve, basename } from "path";

/**
 * Extensiones típicas de archivos de guardado (mismo criterio que el scan).
 */
const SAVE_EXTENSIONS = [
  ".sav",
  ".savx",
  ".save",
  ".sl2",
  ".dat",
  ".bin",
  ".json",
  ".bak",
  ".db",
  ".sqlite",
  ".state",
  ".xml",
  ".cfg",
  ".ini",
  ".sr",
];

function looksLikeSaveFile(name: string): boolean {
  const lower = name.toLowerCase();
  return SAVE_EXTENSIONS.some(
    (ext) => lower.endsWith(ext) || (ext.length > 1 && lower.includes(ext))
  );
}

/** Sustituye %VAR% y ~ por valores de entorno. */
export function expandPath(raw: string): string {
  const withEnv = raw.replace(
    /%([^%]+)%/g,
    (_, name: string) => process.env[name] ?? ""
  );
  if (withEnv.startsWith("~")) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    return home ? join(home, withEnv.slice(1)) : withEnv;
  }
  return withEnv;
}

function collectFilesRecursive(
  dir: string,
  baseDir: string,
  out: { absolute: string; relative: string }[],
  filter?: (name: string) => boolean
): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith(".")) {
      collectFilesRecursive(full, baseDir, out, filter);
    } else if (e.isFile() && (!filter || filter(e.name))) {
      out.push({
        absolute: full,
        relative: relative(baseDir, full).replace(/\\/g, "/"),
      });
    }
  }
}

function dedup(
  results: { absolute: string; relative: string }[]
): { absolute: string; relative: string }[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.absolute)) return false;
    seen.add(r.absolute);
    return true;
  });
}

function collectFromPaths(
  paths: string[],
  filter?: (name: string) => boolean
): { absolute: string; relative: string }[] {
  const results: { absolute: string; relative: string }[] = [];

  for (const raw of paths) {
    const expanded = resolve(expandPath(raw.trim()));
    if (!existsSync(expanded)) continue;

    const stat = statSync(expanded);
    if (stat.isFile()) {
      if (!filter || filter(basename(expanded))) {
        results.push({ absolute: expanded, relative: basename(expanded) });
      }
    } else if (stat.isDirectory()) {
      collectFilesRecursive(expanded, expanded, results, filter);
    }
  }

  return dedup(results);
}

/**
 * Lista archivos que parecen guardados (filtro por extensión).
 * Útil para el scan y detección.
 */
export function listSaveFilesFromPaths(
  paths: string[]
): { absolute: string; relative: string }[] {
  return collectFromPaths(paths, looksLikeSaveFile);
}

/**
 * Lista TODOS los archivos en las rutas dadas, sin filtrar por extensión.
 * Útil para upload/download: sube todo lo que el usuario decidió guardar.
 */
export function listAllFilesFromPaths(
  paths: string[]
): { absolute: string; relative: string }[] {
  return collectFromPaths(paths);
}
