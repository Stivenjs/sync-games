//! Módulo de seguimiento del tiempo de juego.
//!
//! Contiene las funciones para:
//!
//! - Añadir segundos al contador de un juego específico.
//! - Obtener el tiempo de un juego en segundos.
//! - Obtener la suma de tiempo de todos los juegos.
//! - Convertir segundos a formato legible.

#![allow(dead_code)]

use crate::config;

/// Añade segundos al contador de un juego específico.
pub fn add_playtime(game_id: &str, seconds: u64) -> Result<(), String> {
    let mut cfg = config::load_config();

    if let Some(game) = cfg
        .games
        .iter_mut()
        .find(|g| g.id.eq_ignore_ascii_case(game_id))
    {
        game.playtime_seconds += seconds;
        config::save_config(&cfg)?;
        Ok(())
    } else {
        Err(format!("No se encontró el juego con ID: {}", game_id))
    }
}

/// Obtiene el tiempo de un juego en segundos.
pub fn get_game_playtime(game_id: &str) -> u64 {
    let cfg = config::load_config();
    cfg.games
        .iter()
        .find(|g| g.id.eq_ignore_ascii_case(game_id))
        .map(|g| g.playtime_seconds)
        .unwrap_or(0)
}

/// Obtiene la suma de tiempo de todos los juegos.
pub fn get_total_playtime() -> u64 {
    let cfg = config::load_config();
    cfg.games.iter().map(|g| g.playtime_seconds).sum()
}

/// Utilidad para convertir segundos a formato legible (ej: "1h 20m" o "45m").
pub fn format_seconds(seconds: u64) -> String {
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;

    if hours > 0 {
        format!("{}h {}m", hours, minutes)
    } else {
        format!("{}m", minutes)
    }
}
