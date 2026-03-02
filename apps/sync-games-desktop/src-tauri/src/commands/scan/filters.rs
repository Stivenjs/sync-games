//! Extensiones, patrones y exclusiones para detectar carpetas de guardados.
//! Réplica la lógica del CLI (FileSystemPathScanner).

use std::collections::HashSet;
use std::path::Path;
use std::sync::LazyLock;

// ─── Extensiones de archivo ──────────────────────────────────────────────────

/// Extensiones que indican con alta probabilidad un archivo de guardado.
pub(super) const STRONG_SAVE_EXTENSIONS: &[&str] =
    &[".sav", ".savx", ".save", ".sl2", ".state", ".sr"];

/// Extensiones genéricas que solo cuentan como guardado si el nombre contiene hints.
pub(super) const WEAK_SAVE_EXTENSIONS: &[&str] = &[".dat", ".bin", ".bak"];

/// Palabras clave en el nombre que sugieren que es un archivo de guardado.
pub(super) const SAVE_NAME_HINTS: &[&str] = &[
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

pub(super) fn folder_contains_save_like_files(dir_path: &Path) -> bool {
    if !dir_path.exists() || !dir_path.is_dir() {
        return false;
    }
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
    weak_count >= 3
}

pub(super) fn is_excluded_folder(name: &str) -> bool {
    let lower = name.to_lowercase().trim().to_string();
    if EXCLUDED_FOLDER_NAMES.contains(lower.as_str()) {
        return true;
    }
    EXCLUDED_PARTIAL_PATTERNS.iter().any(|p| lower.contains(p))
}

pub(super) fn collect_files(dir_path: &Path) -> Vec<String> {
    let mut names = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir_path) else {
        return names;
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
                if let Ok(sub_entries) = std::fs::read_dir(&sub) {
                    for s in sub_entries.filter_map(|x| x.ok()) {
                        if let Ok(s_meta) = s.metadata() {
                            if s_meta.is_file() {
                                if let Ok(s_name) = s.file_name().into_string() {
                                    names.push(s_name);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    names
}
