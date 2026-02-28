import type { ConfiguredGame } from "@cli/domain/entities/ConfiguredGame";

/**
 * Contenido del archivo de configuración del CLI.
 * Se persiste en disco (JSON); el dominio no conoce el formato de almacenamiento.
 */
export interface Config {
  readonly apiBaseUrl?: string;
  readonly userId?: string;
  readonly games: readonly ConfiguredGame[];
}
