import { input } from "@inquirer/prompts";
import type { CliDeps } from "@cli/container";

export async function runAddInteractive(deps: CliDeps): Promise<void> {
  const gameId = await input({
    message: "Identificador del juego (ej. elden-ring)",
    validate: (v) => (v.trim() ? true : "Escribe un nombre"),
  });
  const path = await input({
    message: "Ruta de la carpeta o archivo de guardado",
    default: process.platform === "win32" ? "%APPDATA%" : "~",
    validate: (v) => (v.trim() ? true : "Escribe una ruta"),
  });
  await deps.addGameUseCase.execute({
    gameId: gameId.trim(),
    path: path.trim(),
  });
  console.log("\n✅ Añadido:", gameId.trim(), "→", path.trim());
}

export async function runAddFromArgs(
  deps: CliDeps,
  args: string[]
): Promise<void> {
  const gameId = args[1];
  const path = args[2];
  if (!gameId || !path) {
    console.error("Uso: sync-games add <game-id> <ruta>");
    throw new Error("Arguments are missing");
  }
  await deps.addGameUseCase.execute({ gameId, path });
  console.log("Añadido:", gameId, "→", path);
}
