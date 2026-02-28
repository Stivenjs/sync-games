/**
 * Juego configurado en el CLI: identificador y rutas locales a guardados.
 * Las rutas pueden contener variables de entorno (ej. %APPDATA%, %USERPROFILE%).
 */
export interface ConfiguredGame {
  readonly id: string;
  readonly paths: readonly string[];
}
