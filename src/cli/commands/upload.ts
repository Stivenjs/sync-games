import { select } from "@inquirer/prompts";
import type { CliDeps } from "@cli/container";

export async function selectGame(
  deps: CliDeps,
  message: string
): Promise<string | null> {
  const games = await deps.listGamesUseCase.execute();
  if (games.length === 0) {
    console.log("No hay juegos configurados. Añade uno primero.");
    return null;
  }
  const choice = await select({
    message,
    choices: games.map((g) => ({
      name: `${g.id} (${g.paths.length} ruta(s))`,
      value: g.id,
    })),
  });
  return choice;
}

export async function runUploadInteractive(deps: CliDeps): Promise<void> {
  const gameId = await selectGame(
    deps,
    "Elige el juego del que subir guardados"
  );
  if (!gameId) return;
  console.log("\n☁️  Subiendo guardados de:", gameId);
  console.log("(upload a la nube en desarrollo)\n");
}

export async function runUploadFromArgs(
  deps: CliDeps,
  args: string[]
): Promise<void> {
  let gameId: string | null = args[1] ?? null;
  if (!gameId) {
    gameId = await selectGame(deps, "Elige el juego del que subir guardados");
    if (!gameId) {
      console.error("No se seleccionó ningún juego.");
      throw new Error("No game selected");
    }
  }
  console.log("Subiendo guardados de:", gameId);
  console.log("(upload a la nube en desarrollo)");
}
