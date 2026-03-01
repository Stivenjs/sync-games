/**
 * Juego configurado en el CLI: identificador y rutas locales a guardados.
 * Las rutas pueden contener variables de entorno (ej. %APPDATA%, %USERPROFILE%).
 */
export interface ConfiguredGame {
  readonly id: string;
  readonly paths: readonly string[];
  /** Steam App ID: si está definido, se usa la imagen del CDN de Steam. */
  readonly steamAppId?: string;
  /** URL personalizada de imagen. Prioridad sobre steamAppId. Para juegos no-Steam. */
  readonly imageUrl?: string;
}
