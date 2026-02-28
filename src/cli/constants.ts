/**
 * Comandos reconocidos por el CLI (modo no interactivo).
 */
export const KNOWN_COMMANDS = [
  "add",
  "remove",
  "list",
  "config",
  "scan",
  "upload",
  "download",
  "--help",
  "-h",
] as const;

/**
 * Acciones del menú principal interactivo.
 */
export type MainAction =
  | "add"
  | "remove"
  | "list"
  | "scan"
  | "upload"
  | "download"
  | "config"
  | "exit";
