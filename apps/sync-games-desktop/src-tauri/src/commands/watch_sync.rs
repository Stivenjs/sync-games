//! Watcher de archivos para subir guardados automáticamente cuando cambian.
//! Se ejecuta en background sin afectar el rendimiento del juego.

use crate::commands::sync;
use crate::config;
use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult};
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;
use tauri::Emitter;

fn expand_path(raw: &str) -> Option<PathBuf> {
    let mut result = raw.to_string();
    let re = regex::Regex::new(r"%([^%]+)%").ok()?;
    for cap in re.captures_iter(raw) {
        let var = cap.get(1)?.as_str();
        let val = std::env::var(var).unwrap_or_default();
        result = result.replace(&format!("%{}%", var), &val);
    }
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
        Some(PathBuf::from(result))
    }
}

/// Encuentra el game_id para un path que ha cambiado.
fn path_to_game_id(path: &std::path::Path, watch_roots: &[(PathBuf, String)]) -> Option<String> {
    let path = path.canonicalize().ok()?;
    let mut best: Option<(PathBuf, String)> = None;

    for (root, game_id) in watch_roots {
        let Ok(canon_root) = root.canonicalize() else {
            continue;
        };
        if path.starts_with(&canon_root) {
            match &best {
                None => best = Some((canon_root, game_id.clone())),
                Some((prev, _)) => {
                    if canon_root.as_os_str().len() > prev.as_os_str().len() {
                        best = Some((canon_root, game_id.clone()));
                    }
                }
            }
        }
    }
    best.map(|(_, id)| id)
}

pub fn spawn_watcher(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let cfg = config::load_config();
        if cfg
            .api_base_url
            .as_ref()
            .map_or(true, |s| s.trim().is_empty())
            || cfg.user_id.as_ref().map_or(true, |s| s.trim().is_empty())
        {
            return;
        }

        let mut watch_roots: Vec<(PathBuf, String)> = Vec::new();
        for game in &cfg.games {
            for raw in &game.paths {
                let Some(expanded) = expand_path(raw.trim()) else {
                    continue;
                };
                if !expanded.exists() {
                    continue;
                }
                let watch_dir = if expanded.is_file() {
                    expanded.parent().map(PathBuf::from).unwrap_or(expanded)
                } else {
                    expanded
                };
                watch_roots.push((watch_dir, game.id.clone()));
            }
        }

        if watch_roots.is_empty() {
            return;
        }

        let (tx, rx) = mpsc::channel();
        let mut debouncer =
            match new_debouncer(Duration::from_secs(3), move |res: DebounceEventResult| {
                let _ = tx.send(res);
            }) {
                Ok(d) => d,
                Err(_) => return,
            };

        for (root, _) in &watch_roots {
            if let Err(e) = debouncer.watcher().watch(root, RecursiveMode::Recursive) {
                eprintln!("watch_sync: no se pudo vigilar {:?}: {}", root, e);
            }
        }

        for res in rx {
            match res {
                Ok(events) => {
                    let mut games_to_sync = std::collections::HashSet::new();
                    for e in events {
                        if let Some(gid) = path_to_game_id(&e.path, &watch_roots) {
                            games_to_sync.insert(gid);
                        }
                    }

                    for game_id in games_to_sync {
                        let app = app.clone();
                        let gid = game_id.clone();
                        tauri::async_runtime::spawn(async move {
                            match sync::sync_upload_game(gid.clone()).await {
                                Ok(r) => {
                                    let _ = app.emit("auto-sync-done", {
                                        #[derive(serde::Serialize, Clone)]
                                        struct Payload {
                                            game_id: String,
                                            ok_count: u32,
                                            err_count: u32,
                                        }
                                        Payload {
                                            game_id: gid,
                                            ok_count: r.ok_count,
                                            err_count: r.err_count,
                                        }
                                    });
                                }
                                Err(e) => {
                                    let _ = app.emit("auto-sync-error", {
                                        #[derive(serde::Serialize, Clone)]
                                        struct Payload {
                                            game_id: String,
                                            error: String,
                                        }
                                        Payload {
                                            game_id: gid,
                                            error: e,
                                        }
                                    });
                                }
                            }
                        });
                    }
                }
                Err(e) => eprintln!("watch_sync: error {:?}", e),
            }
        }
    });
}
