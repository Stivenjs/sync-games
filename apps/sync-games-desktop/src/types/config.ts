/**
 * Tipos compartidos para la configuración de sync-games.
 * Deben coincidir con el formato del CLI.
 */

export interface ConfiguredGame {
  readonly id: string;
  readonly paths: readonly string[];
}

export interface Config {
  readonly apiBaseUrl?: string;
  readonly apiKey?: string;
  readonly userId?: string;
  readonly games: readonly ConfiguredGame[];
  readonly customScanPaths?: readonly string[];
}
