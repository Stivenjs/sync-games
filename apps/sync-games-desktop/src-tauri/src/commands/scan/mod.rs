//! Escaneo de rutas candidatas para guardados.
//! Réplica de la lógica del CLI (FileSystemPathScanner).

mod filters;

use crate::config;
use filters::{folder_contains_save_like_files, is_excluded_folder};
use regex::Regex;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PathCandidateDto {
    pub path: String,
    pub folder_name: String,
    pub base_path: String,
}

// ─── Expansión de rutas ──────────────────────────────────────────────────────

fn expand_path(raw: &str) -> Option<String> {
    let mut result = raw.to_string();
    // %VAR%
    let re = Regex::new(r"%([^%]+)%").ok()?;
    for cap in re.captures_iter(raw) {
        let var = cap.get(1)?.as_str();
        let val = std::env::var(var).unwrap_or_default();
        result = result.replace(&format!("%{}%", var), &val);
    }
    // ~
    if result.starts_with('~') {
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_default();
        if !home.is_empty() {
            let rest = result.trim_start_matches('~').trim_start_matches('/');
            result = if rest.is_empty() {
                home
            } else {
                format!("{}/{}", home.trim_end_matches(&['/', '\\']), rest)
            };
        }
    }
    if result.is_empty() {
        None
    } else {
        Some(result)
    }
}

// ─── Base paths y listado ────────────────────────────────────────────────────

fn list_subdirs(dir_path: &Path) -> Vec<(PathBuf, String)> {
    let Ok(entries) = fs::read_dir(dir_path) else {
        return vec![];
    };
    entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            if !meta.is_dir() {
                return None;
            }
            let name = e.file_name().into_string().ok()?;
            if name.starts_with('.') {
                return None;
            }
            Some((e.path(), name))
        })
        .collect()
}

fn scan_base_paths(
    base_path: &str,
    base_label: &str,
    candidates: &mut Vec<PathCandidateDto>,
    seen: &mut HashSet<String>,
) {
    let base = Path::new(base_path);
    if !base.exists() || !base.is_dir() {
        return;
    }
    for (full_path, name) in list_subdirs(base) {
        if is_excluded_folder(&name) {
            continue;
        }
        if !folder_contains_save_like_files(&full_path) {
            continue;
        }
        let path_str = full_path.to_string_lossy().to_string();
        let key = path_str.to_lowercase();
        if seen.contains(&key) {
            continue;
        }
        seen.insert(key);
        candidates.push(PathCandidateDto {
            path: path_str,
            folder_name: name,
            base_path: base_label.to_string(),
        });
    }
}

// ─── Steam ───────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
const DEFAULT_STEAM_PATH_WIN32: &str = "C:\\Program Files (x86)\\Steam";

#[cfg(target_os = "windows")]
fn find_steam_userdata_candidates(steam_path: &str) -> Vec<PathCandidateDto> {
    let userdata = Path::new(steam_path).join("userdata");
    if !userdata.exists() || !userdata.is_dir() {
        return vec![];
    }
    let mut out = Vec::new();
    let re = Regex::new(r"^\d+$").unwrap();
    for (user_dir, user_name) in list_subdirs(&userdata) {
        if !re.is_match(&user_name) {
            continue;
        }
        for (app_dir, app_name) in list_subdirs(&user_dir) {
            if !re.is_match(&app_name) {
                continue;
            }
            let remote = app_dir.join("remote");
            let path_to_check = if remote.exists() {
                remote
            } else {
                app_dir.clone()
            };
            if !folder_contains_save_like_files(&path_to_check) {
                continue;
            }
            if let Some(p) = path_to_check.to_str() {
                out.push(PathCandidateDto {
                    path: p.to_string(),
                    folder_name: format!("Steam App {}", app_name),
                    base_path: format!("Steam userdata ({})", user_name),
                });
            }
        }
    }
    out
}

#[cfg(target_os = "windows")]
fn find_steam_library_paths(steam_path: &str) -> Vec<String> {
    let vdf = Path::new(steam_path)
        .join("steamapps")
        .join("libraryfolders.vdf");
    let Ok(content) = fs::read_to_string(&vdf) else {
        return vec![];
    };
    let re = Regex::new(r#""path"\s+"([^"]+)""#).unwrap();
    let steam_norm = std::path::Path::new(steam_path)
        .canonicalize()
        .ok()
        .and_then(|p| p.to_str().map(|s| s.to_lowercase()));
    let mut paths = Vec::new();
    for cap in re.captures_iter(&content) {
        if let Some(m) = cap.get(1) {
            let p = m.as_str().replace("\\\\", "\\");
            // Excluir la carpeta principal de Steam
            if let (Some(ref steam), Ok(lib_canon)) = (&steam_norm, Path::new(&p).canonicalize()) {
                if let Some(lib_s) = lib_canon.to_str() {
                    if lib_s.to_lowercase() == *steam {
                        continue;
                    }
                }
            }
            paths.push(p);
        }
    }
    paths
}

#[cfg(target_os = "windows")]
fn find_steam_library_candidates(library_path: &str) -> Vec<PathCandidateDto> {
    let common = Path::new(library_path).join("steamapps").join("common");
    if !common.exists() || !common.is_dir() {
        return vec![];
    }
    let mut out = Vec::new();
    for (full_path, name) in list_subdirs(&common) {
        if !folder_contains_save_like_files(&full_path) {
            continue;
        }
        if let Some(p) = full_path.to_str() {
            out.push(PathCandidateDto {
                path: p.to_string(),
                folder_name: name,
                base_path: format!("Steam Library ({})", library_path),
            });
        }
    }
    out
}

#[cfg(target_os = "windows")]
fn scan_steam(candidates: &mut Vec<PathCandidateDto>, seen: &mut HashSet<String>) {
    let steam_path = DEFAULT_STEAM_PATH_WIN32;
    if !Path::new(steam_path).exists() {
        return;
    }
    for c in find_steam_userdata_candidates(steam_path) {
        let key = c.path.to_lowercase();
        if !seen.contains(&key) {
            seen.insert(key);
            candidates.push(c);
        }
    }
    for c in find_steam_library_candidates(steam_path) {
        let key = c.path.to_lowercase();
        if !seen.contains(&key) {
            seen.insert(key);
            candidates.push(c);
        }
    }
    for lib in find_steam_library_paths(steam_path) {
        for c in find_steam_library_candidates(&lib) {
            let key = c.path.to_lowercase();
            if !seen.contains(&key) {
                seen.insert(key);
                candidates.push(c);
            }
        }
    }
}

// ─── Cracks ──────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
const CRACK_SAVE_LOCATIONS: &[(&str, &str)] = &[
    ("C:\\Users\\Public\\Documents\\EMPRESS", "EMPRESS"),
    ("C:\\Users\\Public\\Documents\\Steam", "CODEX/Steam emu"),
    ("%APPDATA%\\Goldberg SteamEmu Saves", "Goldberg"),
    ("%APPDATA%\\CODEX", "CODEX"),
    ("%APPDATA%\\CPY_SAVES", "CPY (Conspir4cy)"),
    ("%APPDATA%\\Skidrow", "Skidrow"),
    ("%LOCALAPPDATA%\\CODEX", "CODEX (Local)"),
    ("%USERPROFILE%\\Documents\\CPY_SAVES", "CPY (Documents)"),
];

#[cfg(target_os = "windows")]
fn contains_saves_at_any_depth(dir_path: &Path, depth: usize) -> bool {
    if depth > 5 || !dir_path.exists() || !dir_path.is_dir() {
        return false;
    }
    if folder_contains_save_like_files(dir_path) {
        return true;
    }
    for (sub_path, name) in list_subdirs(dir_path) {
        if name == "steam_settings" || name == "settings" {
            continue;
        }
        if contains_saves_at_any_depth(&sub_path, depth + 1) {
            return true;
        }
    }
    false
}

#[cfg(target_os = "windows")]
fn scan_cracks(candidates: &mut Vec<PathCandidateDto>, seen: &mut HashSet<String>) {
    for (path_tpl, label) in CRACK_SAVE_LOCATIONS {
        let Some(base_path) = expand_path(path_tpl) else {
            continue;
        };
        let base = Path::new(&base_path);
        if !base.exists() || !base.is_dir() {
            continue;
        }
        for (app_dir, name) in list_subdirs(base) {
            if name == "steam_settings" || name == "settings" {
                continue;
            }
            if !contains_saves_at_any_depth(&app_dir, 0) {
                continue;
            }
            if let Some(p) = app_dir.to_str() {
                let key = p.to_lowercase();
                if !seen.contains(&key) {
                    seen.insert(key.clone());
                    candidates.push(PathCandidateDto {
                        path: p.to_string(),
                        folder_name: format!("{} — {}", label, name),
                        base_path: format!("{} ({})", label, base_path),
                    });
                }
            }
        }
    }
}

// ─── Comando principal ────────────────────────────────────────────────────────

#[tauri::command]
pub fn scan_path_candidates() -> Vec<PathCandidateDto> {
    let cfg = config::load_config();
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();

    // Rutas base (templates del CLI)
    let base_templates: Vec<(&str, &str)> = if cfg!(target_os = "windows") {
        vec![
            ("%USERPROFILE%\\Documents\\My Games", "Documents/My Games"),
            ("%USERPROFILE%\\Documents", "Documents"),
            ("%APPDATA%", "AppData"),
            ("%LOCALAPPDATA%", "LocalAppData"),
            ("%USERPROFILE%\\Saved Games", "Saved Games"),
            ("%LOCALAPPDATA%\\Low", "LocalAppData/Low"),
        ]
    } else {
        vec![
            ("~/.local/share", "Local Share"),
            ("~/.config", "Config"),
            ("~/Documents", "Documents"),
        ]
    };

    for (tpl, label) in base_templates {
        if let Some(expanded) = expand_path(tpl) {
            scan_base_paths(&expanded, label, &mut candidates, &mut seen);
        }
    }

    // Steam y cracks (solo Windows)
    #[cfg(target_os = "windows")]
    {
        scan_steam(&mut candidates, &mut seen);
        scan_cracks(&mut candidates, &mut seen);
    }

    // Rutas personalizadas del config
    for extra in &cfg.custom_scan_paths {
        let trimmed = extra.trim();
        if trimmed.is_empty() {
            continue;
        }
        let path = if let Some(expanded) = expand_path(trimmed) {
            expanded
        } else {
            trimmed.to_string()
        };
        if !Path::new(&path).exists() {
            continue;
        }
        #[cfg(target_os = "windows")]
        {
            let system_root = std::env::var("SystemDrive")
                .map(|d| format!("{}\\", d))
                .unwrap_or_else(|_| "C:\\".to_string())
                .to_lowercase();
            if path.to_lowercase() == system_root {
                continue;
            }
        }
        scan_base_paths(&path, "Personalizada", &mut candidates, &mut seen);
    }

    candidates.sort_by(|a, b| {
        a.base_path
            .cmp(&b.base_path)
            .then(a.folder_name.cmp(&b.folder_name))
    });
    candidates
}
