//! Detección de procesos de juego y monitoreo de actividad en tiempo real.
//!
//! Este módulo provee la lógica para identificar si los juegos configurados están
//! en ejecución, permitiendo evitar colisiones de archivos durante la sincronización.
//! Además, gestiona el rastreo de tiempo de juego (playtime) emitiendo eventos
//! reactivos hacia el frontend.

use crate::config;
use crate::time;
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::OnceLock;
use std::time::Instant;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use tauri::{AppHandle, Emitter};

/// Instancia global de `System` compartida para evitar sobrecarga de memoria
/// al re-inicializar el árbol de procesos en cada consulta.
static GLOBAL_SYS: OnceLock<Mutex<System>> = OnceLock::new();

/// Recupera un guardia del Mutex que contiene la instancia global de `sysinfo::System`.
pub(crate) fn get_sys() -> std::sync::MutexGuard<'static, System> {
    GLOBAL_SYS
        .get_or_init(|| Mutex::new(System::new()))
        .lock()
        .expect("Mutex de sysinfo envenenado")
}

/// Determina si un juego específico está en ejecución basándose en sus ejecutables conocidos.
///
/// # Arguments
/// * `game_id` - Identificador único del juego.
/// * `_paths` - Rutas de guardado (actualmente no utilizadas para la detección de proceso).
pub fn is_game_running(game_id: &str, _paths: &[String]) -> bool {
    let names = get_executable_names_to_check(game_id);
    if names.is_empty() {
        return false;
    }

    let mut sys = get_sys();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        ProcessRefreshKind::new().with_exe(UpdateKind::OnlyIfNotSet),
    );

    for process in sys.processes().values() {
        let proc_name = process.name().to_string_lossy().to_lowercase();
        for check in &names {
            if proc_name == check.to_lowercase() {
                return true;
            }
        }
    }
    false
}

/// Evalúa el estado de ejecución de múltiples juegos de forma simultánea.
///
/// Optimiza el rendimiento realizando una única actualización del árbol de procesos
/// y pre-calculando los candidatos de nombres de ejecutables.
///
/// # Returns
/// Un `HashMap` donde la clave es el `game_id` y el valor es un booleano de ejecución.
pub fn are_games_running(game_ids: &[String]) -> HashMap<String, bool> {
    let cfg = config::load_config();
    let mut result: HashMap<String, bool> = HashMap::with_capacity(game_ids.len());

    if game_ids.is_empty() {
        return result;
    }

    let mut names_by_game: HashMap<String, Vec<String>> = HashMap::with_capacity(game_ids.len());

    for id in game_ids {
        result.insert(id.clone(), false);

        if let Some(game) = cfg.games.iter().find(|g| g.id.eq_ignore_ascii_case(id)) {
            let mut names: Vec<String> = Vec::new();

            if let Some(ref execs) = game.executable_names {
                if !execs.is_empty() {
                    names = execs
                        .iter()
                        .filter_map(|s| {
                            let t = s.trim();
                            if t.is_empty() {
                                None
                            } else {
                                Some(ensure_exe_ext(t))
                            }
                        })
                        .collect();
                }
            }

            if names.is_empty() {
                names = infer_exe_candidates(id);
            }

            if !names.is_empty() {
                let names_lower: Vec<String> =
                    names.into_iter().map(|n| n.to_lowercase()).collect();
                names_by_game.insert(game.id.clone(), names_lower);
            }
        }
    }

    let mut sys = get_sys();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        ProcessRefreshKind::new().with_exe(UpdateKind::OnlyIfNotSet),
    );

    for process in sys.processes().values() {
        let proc_name = process.name().to_string_lossy().to_lowercase();
        for game_id in game_ids {
            if result[game_id] {
                continue;
            }

            if let Some(check_names) = names_by_game.get(game_id) {
                if check_names.contains(&proc_name) {
                    result.insert(game_id.clone(), true);
                }
            }
        }
    }
    result
}

/// Orquesta el monitoreo continuo de procesos en segundo plano.
///
/// Este hilo realiza tres tareas principales:
/// 1. Emite eventos de estado de ejecución ("games-running-status").
/// 2. Acumula tiempo de juego (Playtime) cada 60 segundos de actividad.
/// 3. Sincroniza el tiempo restante al detectar el cierre de un proceso.
#[tauri::command]
pub fn start_process_watcher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut previous_state: HashMap<String, bool> = HashMap::new();
        let mut last_checkpoint: HashMap<String, Instant> = HashMap::new();

        loop {
            let cfg = config::load_config();
            let game_ids: Vec<String> = cfg.games.iter().map(|g| g.id.clone()).collect();
            let current_state = are_games_running(&game_ids);

            // Notificar cambios de estado (Ej. Un juego se abrió o se cerró)
            if current_state != previous_state {
                let _ = app.emit("games-running-status", &current_state);
            }

            for (game_id, &is_running) in &current_state {
                let was_running = *previous_state.get(game_id).unwrap_or(&false);

                if is_running {
                    if !was_running {
                        last_checkpoint.insert(game_id.clone(), Instant::now());
                    } else if let Some(start) = last_checkpoint.get(game_id) {
                        let elapsed = start.elapsed().as_secs();

                        // Guardar tiempo acumulado cada minuto de juego activo
                        if elapsed >= 60 {
                            let _ = time::add_playtime(game_id, elapsed);
                            last_checkpoint.insert(game_id.clone(), Instant::now());
                            emit_playtime_update(&app, game_id);
                        }
                    }
                } else if was_running {
                    // El juego acaba de cerrarse: procesar tiempo final
                    if let Some(start) = last_checkpoint.remove(game_id) {
                        let remaining = start.elapsed().as_secs();
                        if remaining > 0 {
                            let _ = time::add_playtime(game_id, remaining);
                            emit_playtime_update(&app, game_id);
                        }
                    }
                }
            }

            previous_state = current_state;
            tokio::time::sleep(std::time::Duration::from_secs(10)).await;
        }
    });
}

/// Despacha eventos IPC para actualizar los contadores de tiempo en la UI.
fn emit_playtime_update(app: &AppHandle, game_id: &str) {
    let new_time = time::get_game_playtime(game_id);
    let _ = app.emit(
        "playtime-updated",
        Payload {
            game_id: game_id.to_string(),
            new_time,
        },
    );

    let total_time = time::get_total_playtime();
    let _ = app.emit("total-playtime-updated", total_time);
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Payload {
    game_id: String,
    new_time: u64,
}

/// Obtiene la lista de nombres de ejecutables a monitorear para un ID de juego.
fn get_executable_names_to_check(game_id: &str) -> Vec<String> {
    let cfg = config::load_config();
    if let Some(game) = cfg
        .games
        .iter()
        .find(|g| g.id.eq_ignore_ascii_case(game_id))
    {
        if let Some(ref names) = game.executable_names {
            if !names.is_empty() {
                return names
                    .iter()
                    .filter_map(|s| {
                        let t = s.trim().to_string();
                        if t.is_empty() {
                            None
                        } else {
                            Some(ensure_exe_ext(&t))
                        }
                    })
                    .collect();
            }
        }
    }
    infer_exe_candidates(game_id)
}

/// Asegura que el nombre del ejecutable tenga la extensión apropiada según el SO.
fn ensure_exe_ext(s: &str) -> String {
    let s = s.trim();
    #[cfg(target_os = "windows")]
    {
        if s.to_lowercase().ends_with(".exe") {
            s.to_string()
        } else {
            format!("{}.exe", s)
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        s.to_string()
    }
}

/// Deduce posibles nombres de ejecutables basándose en el identificador del juego.
///
/// Genera variaciones como el nombre compacto y acrónimos para mejorar la
/// tasa de éxito en la detección automática.
fn infer_exe_candidates(text: &str) -> Vec<String> {
    let mut candidates = Vec::new();
    let text = text.trim();
    if text.is_empty() {
        return candidates;
    }

    // Candidato 1: Nombre base sin símbolos ni espacios
    let base = text.replace(['\'', '"', ':', '-'], "").replace(' ', "");
    if !base.is_empty() {
        #[cfg(target_os = "windows")]
        {
            candidates.push(ensure_exe_ext(&base));
            candidates.push(format!("{}-Win64-Shipping.exe", base));
        }
        #[cfg(not(target_os = "windows"))]
        {
            candidates.push(base.clone());
        }
    }

    // Candidato 2: Acrónimo (Ej: "Grand Theft Auto" -> "gta")
    let mut acronym = String::new();
    let words = text
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty());

    for word in words {
        if word.chars().all(|c| c.is_ascii_digit()) {
            acronym.push_str(word);
        } else if let Some(c) = word.chars().next() {
            acronym.push(c.to_ascii_lowercase());
        }
    }

    if acronym.len() >= 2 && acronym.len() <= 6 {
        #[cfg(target_os = "windows")]
        candidates.push(ensure_exe_ext(&acronym));
        #[cfg(not(target_os = "windows"))]
        candidates.push(acronym.clone());
    }

    candidates.sort();
    candidates.dedup();
    candidates
}
