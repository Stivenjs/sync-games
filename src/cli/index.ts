#!/usr/bin/env bun
/**
 * Punto de entrada del CLI.
 * Ejecución: bun run cli [comando] | sync-games [comando] (si está en PATH)
 * Binario: bun run build:cli → dist/sync-games[.exe]
 */
import { AddGameUseCase } from "@cli/application/use-cases/AddGameUseCase";
import { GetConfigPathUseCase } from "@cli/application/use-cases/GetConfigPathUseCase";
import { ListGamesUseCase } from "@cli/application/use-cases/ListGamesUseCase";
import { FileConfigRepository } from "@cli/infrastructure/FileConfigRepository";

const KNOWN_COMMANDS = ["add", "list", "config", "upload", "download", "--help", "-h"];

/**
 * Bun con script: argv = [bun, script.ts, add, ...] → args desde índice 2.
 * Exe compilado: argv puede incluir la ruta del exe como argumento (doble clic, atajos).
 * Si argv[1] es un comando conocido, args desde 1; si no, desde 2.
 * Filtramos cualquier arg que sea la ruta del ejecutable actual.
 */
function getCliArgs(): string[] {
  const first = process.argv[1];
  const isUserCommand = typeof first === "string" && KNOWN_COMMANDS.includes(first);
  const raw = isUserCommand ? process.argv.slice(1) : process.argv.slice(2);
  const exePath = process.argv[0] ?? process.execPath ?? "";
  const isExePath = (arg: string) =>
    arg === exePath ||
    arg === process.execPath ||
    arg.endsWith("sync-games.exe") ||
    arg.endsWith("sync-games");
  return raw.filter((arg) => !isExePath(arg));
}

const args = getCliArgs();
const command = args[0];

// Composition root: una sola instancia del repositorio y de los use cases
const configRepository = new FileConfigRepository();
const addGameUseCase = new AddGameUseCase(configRepository);
const listGamesUseCase = new ListGamesUseCase(configRepository);
const getConfigPathUseCase = new GetConfigPathUseCase(configRepository);

function showHelp(): void {
  console.log(`
sync-games — Sube y restaura guardados de juegos en la nube

Uso: sync-games <comando> [opciones]

Comandos:
  add <game-id> <ruta>     Añade un juego al config (ruta de carpeta o archivo)
  list                     Lista juegos configurados
  upload [game-id]         Sube guardados (todos o solo el juego indicado)
  download [game-id]       Descarga guardados
  config                   Muestra la ruta del archivo de config

Ejemplos:
  sync-games add elden-ring "%APPDATA%/EldenRing"
  sync-games upload
  sync-games upload elden-ring
`);
}

/**
 * En Windows, si el exe se abre con doble clic (sin terminal), la ventana se cierra
 * al terminar el proceso. Esperar Enter permite leer la salida antes de cerrar.
 * Solo se hace cuando no hay argumentos (doble clic) y stdin es una TTY.
 */
async function waitForKeypressOnWindowsIfNeeded(): Promise<void> {
  if (process.platform !== "win32" || !process.stdin.isTTY) return;
  console.log("\nPulsa Enter para salir...");
  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
    process.stdin.resume();
  });
}

async function runAdd(): Promise<void> {
  const gameId = args[1];
  const path = args[2];
  if (!gameId || !path) {
    console.error("Uso: sync-games add <game-id> <ruta>");
    process.exit(1);
  }
  await addGameUseCase.execute({ gameId, path });
  console.log(`Añadido: ${gameId} → ${path}`);
}

async function runList(): Promise<void> {
  const games = await listGamesUseCase.execute();
  if (games.length === 0) {
    console.log(
      "No hay juegos configurados. Usa: sync-games add <game-id> <ruta>"
    );
    return;
  }
  for (const g of games) {
    console.log(`  ${g.id}`);
    for (const p of g.paths) {
      console.log(`    → ${p}`);
    }
  }
}

function runConfig(): void {
  const { configPath } = getConfigPathUseCase.execute();
  console.log(configPath);
}

async function main(): Promise<void> {
  if (!command || command === "--help" || command === "-h") {
    showHelp();
    await waitForKeypressOnWindowsIfNeeded();
    process.exit(0);
  }

  try {
    switch (command) {
      case "add":
        await runAdd();
        break;
      case "list":
        await runList();
        break;
      case "config":
        runConfig();
        break;
      case "upload":
        console.log("upload: aún no implementado.");
        break;
      case "download":
        console.log("download: aún no implementado.");
        break;
      default:
        console.error(`Comando desconocido: ${command}`);
        showHelp();
        await waitForKeypressOnWindowsIfNeeded();
        process.exit(1);
    }
    await waitForKeypressOnWindowsIfNeeded();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    await waitForKeypressOnWindowsIfNeeded();
    process.exit(1);
  }
}

main();
