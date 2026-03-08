//! Extensiones, patrones y exclusiones para detectar carpetas de guardados.
//! Réplica la lógica del CLI (FileSystemPathScanner).

use std::collections::HashSet;
use std::path::Path;
use std::sync::LazyLock;

use super::extensions::{
    SAVE_FOLDER_NAMES, SAVE_NAME_HINTS, STRONG_SAVE_EXTENSIONS, WEAK_SAVE_EXTENSIONS,
};

// ─── Carpetas excluidas del escaneo ───────────────────────────────────────────

pub(super) static EXCLUDED_FOLDER_NAMES: LazyLock<HashSet<&'static str>> = LazyLock::new(|| {
    [
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
        "code",
        "cursor",
        "visual studio setup",
        "git extensions",
        "gitextensions",
        "github-copilot",
        "cmaketools",
        "visualstudiodiscordrpc",
        "jetbrains",
        "discord",
        "spotify",
        "zoom",
        "slack",
        "telegram desktop",
        "whatsapp",
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
        "npm",
        "pnpm",
        "pnpm-state",
        "pnpm-cache",
        "npm-cache",
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
        "obs-studio",
        "qbittorrent",
        "utorrent web",
        "winrar",
        "7-zip",
        "process hacker 2",
        "xdg.config",
        "ccleaner",
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
        "epicgameslauncher",
        "ea games",
        "ubisoft",
        "gog galaxy",
        "battle.net",
        "roblox",
        "robloxpcgdk",
        "temp",
        "tmp",
        "crashdumps",
        "squirreltemp",
        "programs",
        "logs",
        "cache",
        "sync-games",
        // Carpetas de configuración (no guardados)
        "config",
        "configs",
        "crashreportclient",
        "windowsclient",
        "windowseditor",
        "windowsnoeditor",
        "glcache",
        "graphicscache",
        "telemetry",
        "ebwebview",
        "trusttokenkeycommitments",
        // Herramientas y apps no-juegos
        "nuget",
        "playwright",
        "ms-playwright-go",
        "tauri",
        "betterdiscord",
        "bravesoftware",
        "nvidia",
        "go",
        "dlx",
        "_npx",
        "metadata-v1.3",
        "registry.npmjs.org",
        "v3-cache",
        "com.savecloud.app",
        "scratch",
        "examples",
        "installoptions",
        "user data",
        "default",
        // Carpetas de sistema Windows / desarrollo (no juegos)
        "$windows.~ws",
        "$SysReset",
        "Windows.old",
        "msys64",
        "publishers",
    ]
    .into_iter()
    .collect()
});

/// Patrones parciales: si el nombre los contiene, la carpeta se excluye.
pub(super) const EXCLUDED_PARTIAL_PATTERNS: &[&str] = &[
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
    "pnpm",
    "npm-cache",
    "-cache",
    "playwright",
    "nuget",
    "nvidia",
    "brave",
    "betterdiscord",
    "ebwebview",
    "telemetry",
    "savecloud",
    "language-servers",
    "aws",
    "toolkits",
    "launcher",
    "social club",
];

// ─── Funciones de detección ──────────────────────────────────────────────────

pub(super) fn is_strong_save_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    STRONG_SAVE_EXTENSIONS
        .iter()
        .any(|ext| lower.ends_with(ext) || lower.contains(&format!("{}.", ext)))
}

pub(super) fn is_weak_save_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    WEAK_SAVE_EXTENSIONS.iter().any(|ext| lower.ends_with(ext))
}

pub(super) fn name_hints_save(name: &str) -> bool {
    let lower = name.to_lowercase();
    SAVE_NAME_HINTS.iter().any(|h| lower.contains(h))
}

/// Si el nombre de la carpeta sugiere que contiene guardados (ej. "Saves", "SaveGames").
pub(super) fn folder_name_hints_save(folder_name: &str) -> bool {
    let lower = folder_name.to_lowercase().trim().to_string();
    SAVE_FOLDER_NAMES.iter().any(|n| *n == lower)
}

pub(super) fn folder_contains_save_like_files(dir_path: &Path) -> bool {
    if !dir_path.exists() || !dir_path.is_dir() {
        return false;
    }
    let folder_name = dir_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let folder_hints = folder_name_hints_save(folder_name);

    let files = collect_files(dir_path);
    let mut weak_count = 0usize;
    for name in &files {
        if is_strong_save_file(name) {
            return true;
        }
        if is_weak_save_file(name) {
            if name_hints_save(name) {
                return true;
            }
            weak_count += 1;
        }
    }
    // Si el nombre de la carpeta sugiere guardados, umbral más bajo (1 en vez de 3).
    let threshold = if folder_hints { 1 } else { 3 };
    weak_count >= threshold
}

/// Carpetas que parecen IDs, hashes o UUIDs (Steam ID, profile ID, cache hash, etc.).
fn is_likely_id_or_hash(name: &str) -> bool {
    let s = name.trim();
    if s.is_empty() || s.len() > 64 {
        return false;
    }
    // Un solo dígito (ej. slot "0" en EA)
    if s.len() == 1 && s.chars().next().map_or(false, |c| c.is_ascii_digit()) {
        return true;
    }
    // Solo dígitos (Steam ID ~17 dígitos, App ID, etc.)
    if s.len() >= 8 && s.chars().all(|c| c.is_ascii_digit()) {
        return true;
    }
    // Hex puro (8+ caracteres): 8D96F585, hashes de 32/40 chars
    if s.len() >= 8
        && s.chars().all(|c| c.is_ascii_hexdigit())
        && s.chars().any(|c| matches!(c, 'a'..='f' | 'A'..='F'))
    {
        return true;
    }
    // UUID con guiones: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    if s.len() >= 36 && s.contains('-') {
        let parts: Vec<&str> = s.split('-').collect();
        if parts.len() == 5
            && parts
                .iter()
                .all(|p| p.chars().all(|c| c.is_ascii_hexdigit()))
        {
            return true;
        }
    }
    // Hash con prefijo: st_76561199073321731 (Steam ID en No Man's Sky)
    if s.starts_with("st_") && s.len() > 10 && s[3..].chars().all(|c| c.is_ascii_digit()) {
        return true;
    }
    false
}

pub(super) fn is_excluded_folder(name: &str) -> bool {
    let lower = name.to_lowercase().trim().to_string();
    if EXCLUDED_FOLDER_NAMES.contains(lower.as_str()) {
        return true;
    }
    if is_likely_id_or_hash(name) {
        return true;
    }
    EXCLUDED_PARTIAL_PATTERNS.iter().any(|p| lower.contains(p))
}

/// Profundidad máxima al buscar archivos recursivamente (ej. GameName/Saved/SaveGames).
const MAX_COLLECT_DEPTH: usize = 3;

fn collect_files_recursive(dir_path: &Path, depth: usize, names: &mut Vec<String>) {
    if depth > MAX_COLLECT_DEPTH {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir_path) else {
        return;
    };
    for e in entries.filter_map(|x| x.ok()) {
        if let Ok(meta) = e.metadata() {
            if meta.is_file() {
                if let Ok(name) = e.file_name().into_string() {
                    names.push(name);
                }
            } else if meta.is_dir() {
                let name = e.file_name();
                if name.to_string_lossy().starts_with('.') {
                    continue;
                }
                let sub = dir_path.join(name);
                collect_files_recursive(&sub, depth + 1, names);
            }
        }
    }
}

pub(super) fn collect_files(dir_path: &Path) -> Vec<String> {
    let mut names = Vec::new();
    collect_files_recursive(dir_path, 0, &mut names);
    names
}
