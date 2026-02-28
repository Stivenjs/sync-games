import { existsSync, readdirSync, readFileSync } from "fs";
import { join, normalize } from "path";
import type { PathCandidate } from "@cli/domain/entities/PathCandidate";
import type { PathScanner } from "@cli/domain/ports/PathScanner";
import {
  folderContainsSaveLikeFiles,
  isExcludedFolder,
  BASE_PATH_TEMPLATES_WIN32,
  DEFAULT_STEAM_PATH_WIN32,
} from "@cli/infrastructure/scanFilters";

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

function scanBasePaths(
  basePath: string,
  addCandidate: (c: PathCandidate) => void
): void {
  const subdirs = listSubdirs(basePath);
  for (const { path: fullPath, name } of subdirs) {
    if (isExcludedFolder(name)) continue;
    if (!folderContainsSaveLikeFiles(fullPath)) continue;
    addCandidate({ path: fullPath, folderName: name, basePath });
  }
}

// ─── Steam ──────────────────────────────────────────────────────────────────

function findSteamUserDataCandidates(steamPath: string): PathCandidate[] {
  const userdataPath = join(steamPath, "userdata");
  if (!existsSync(userdataPath)) return [];

  const candidates: PathCandidate[] = [];
  const userDirs = listSubdirs(userdataPath).filter((d) =>
    /^\d+$/.test(d.name)
  );

  for (const userDir of userDirs) {
    const appDirs = listSubdirs(userDir.path).filter((d) =>
      /^\d+$/.test(d.name)
    );
    for (const appDir of appDirs) {
      const remotePath = join(appDir.path, "remote");
      const pathToCheck = existsSync(remotePath) ? remotePath : appDir.path;
      if (!folderContainsSaveLikeFiles(pathToCheck)) continue;
      candidates.push({
        path: pathToCheck,
        folderName: `Steam App ${appDir.name}`,
        basePath: `Steam userdata (${userDir.name})`,
      });
    }
  }
  return candidates;
}

function findSteamLibraryPaths(steamPath: string): string[] {
  const vdfPath = join(steamPath, "steamapps", "libraryfolders.vdf");
  if (!existsSync(vdfPath)) return [];
  try {
    const content = readFileSync(vdfPath, "utf-8");
    const paths: string[] = [];
    const pathRegex = /"path"\s+"([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = pathRegex.exec(content)) !== null) {
      const libPath = match[1].replace(/\\\\/g, "\\");
      if (
        normalize(libPath).toLowerCase() !== normalize(steamPath).toLowerCase()
      ) {
        paths.push(libPath);
      }
    }
    return paths;
  } catch {
    return [];
  }
}

function findSteamLibraryCandidates(libraryPath: string): PathCandidate[] {
  const commonPath = join(libraryPath, "steamapps", "common");
  if (!existsSync(commonPath)) return [];

  const candidates: PathCandidate[] = [];
  const gameDirs = listSubdirs(commonPath);
  for (const { path: fullPath, name } of gameDirs) {
    if (!folderContainsSaveLikeFiles(fullPath)) continue;
    candidates.push({
      path: fullPath,
      folderName: name,
      basePath: `Steam Library (${libraryPath})`,
    });
  }
  return candidates;
}

// ─── Scanner principal ──────────────────────────────────────────────────────

export class FileSystemPathScanner implements PathScanner {
  async scan(extraPaths?: readonly string[]): Promise<PathCandidate[]> {
    const templates =
      process.platform === "win32"
        ? BASE_PATH_TEMPLATES_WIN32
        : this.getUnixTemplates();
    const candidates: PathCandidate[] = [];
    const seenPaths = new Set<string>();

    const addCandidate = (c: PathCandidate) => {
      const key = normalize(c.path).toLowerCase();
      if (seenPaths.has(key)) return;
      seenPaths.add(key);
      candidates.push(c);
    };

    for (const template of templates) {
      const basePath = resolvePathTemplate(template);
      if (!basePath || !existsSync(basePath)) continue;
      scanBasePaths(basePath, addCandidate);
    }

    if (process.platform === "win32") {
      this.scanSteam(addCandidate);
    }

    if (extraPaths) {
      const systemRoot = this.getSystemRoot();
      for (const extra of extraPaths) {
        if (!extra || !existsSync(extra)) continue;
        if (systemRoot && normalize(extra).toLowerCase() === systemRoot)
          continue;
        scanBasePaths(extra, addCandidate);
      }
    }

    return candidates;
  }

  private scanSteam(addCandidate: (c: PathCandidate) => void): void {
    const steamPath = DEFAULT_STEAM_PATH_WIN32;
    if (!existsSync(steamPath)) return;

    for (const c of findSteamUserDataCandidates(steamPath)) {
      addCandidate(c);
    }

    for (const c of findSteamLibraryCandidates(steamPath)) {
      addCandidate(c);
    }

    const extraLibs = findSteamLibraryPaths(steamPath);
    for (const lib of extraLibs) {
      for (const c of findSteamLibraryCandidates(lib)) {
        addCandidate(c);
      }
    }
  }

  private getSystemRoot(): string | null {
    if (process.platform !== "win32") return null;
    const drive = process.env.SystemDrive ?? "C:";
    return normalize(`${drive}\\`).toLowerCase();
  }

  private getUnixTemplates(): string[] {
    const home = process.env.HOME ?? "";
    if (!home) return [];
    return [`${home}/.local/share`, `${home}/.config`, `${home}/Documents`];
  }
}
