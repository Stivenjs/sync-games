import type { CliDeps } from "@cli/container";
import * as commands from "@cli/commands";

export function showHelp(): void {
  console.log(`
sync-games — Sube y restaura guardados de juegos en la nube

Uso:
  sync-games                    Menú interactivo
  sync-games <comando> [args]    Modo comando

Comandos:
  add <game-id> <ruta>    Añade un juego
  list                    Lista juegos configurados
  scan                    Analiza rutas candidatas
  upload [game-id]        Sube guardados (pide juego si no se indica)
  download [game-id]      Descarga guardados
  config                  Muestra ruta del config

Ejemplos:
  sync-games add elden-ring "%APPDATA%/EldenRing"
  sync-games upload
`);
}

export async function runCommandMode(
  deps: CliDeps,
  command: string,
  args: string[]
): Promise<void> {
  if (command === "--help" || command === "-h") {
    showHelp();
    process.exit(0);
  }

  switch (command) {
    case "add":
      await commands.runAddFromArgs(deps, args);
      break;
    case "list":
      await commands.runList(deps);
      break;
    case "config":
      commands.runConfig(deps);
      break;
    case "scan":
      await commands.runScan(deps);
      break;
    case "upload":
      await commands.runUploadFromArgs(deps, args);
      break;
    case "download":
      await commands.runDownloadInteractive(deps);
      break;
    default:
      console.error(`Comando desconocido: ${command}`);
      process.exit(1);
  }
}
