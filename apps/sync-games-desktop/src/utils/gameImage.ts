import type { ConfiguredGame } from "@app-types/config";

const STEAM_CDN_BASE = "https://cdn.cloudflare.steamstatic.com/steam/apps";

/**
 * Obtiene la URL de la imagen del juego.
 *
 * Prioridad:
 * 1. imageUrl (config)
 * 2. steamAppId (config o resuelto dinámicamente)
 * 3. App ID extraído del id (ej. empress-re4-2050650 → 2050650)
 * 4. id numérico puro
 * 5. null → placeholder
 */
export function getGameImageUrl(
  game: ConfiguredGame,
  resolvedSteamAppId?: string | null
): string | null {
  if (game.imageUrl?.trim()) {
    return game.imageUrl.trim();
  }

  const appId =
    game.steamAppId?.trim() ??
    resolvedSteamAppId?.trim() ??
    extractAppIdFromId(game.id) ??
    (isSteamAppId(game.id) ? game.id : null);

  if (appId) {
    return `${STEAM_CDN_BASE}/${appId}/header.jpg`;
  }

  return null;
}

/**
 * Extrae Steam App ID del id cuando sigue convenciones de cracks (ej. -2050650).
 */
export function extractAppIdFromId(id: string): string | null {
  const match = id.trim().match(/-(\d{4,10})$/);
  return match ? match[1] : null;
}

/** Comprueba si el id parece un Steam App ID (solo dígitos). */
function isSteamAppId(id: string): boolean {
  return /^\d{4,10}$/.test(id.trim());
}

/** Indica si el juego necesita búsqueda dinámica (no tiene imagen aún). */
export function needsSteamSearch(game: ConfiguredGame): boolean {
  if (game.imageUrl?.trim()) return false;
  if (game.steamAppId?.trim()) return false;
  if (extractAppIdFromId(game.id)) return false;
  if (isSteamAppId(game.id)) return false;
  return true;
}
