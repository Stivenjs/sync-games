/**
 * Tipos compartidos para la configuración de sync-games.
 * Deben coincidir con el formato del CLI.
 */

export interface ConfiguredGame {
  readonly id: string;
  readonly paths: readonly string[];
  /** Steam App ID: si está definido, se usa la imagen del CDN de Steam. */
  readonly steamAppId?: string;
  /** URL personalizada de imagen. Prioridad sobre steamAppId. Para juegos no-Steam. */
  readonly imageUrl?: string;
}

export interface Config {
  readonly apiBaseUrl?: string;
  readonly apiKey?: string;
  readonly userId?: string;
  readonly games: readonly ConfiguredGame[];
  readonly customScanPaths?: readonly string[];
}
