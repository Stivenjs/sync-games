import { select } from "@inquirer/prompts";
import type { CliDeps } from "@cli/container";

export async function runDownloadInteractive(deps: CliDeps): Promise<void> {
  const games = await deps.listGamesUseCase.execute();
  if (games.length === 0) {
    console.log("No hay juegos configurados.");
    return;
  }
  const gameId = await select({
    message: "Elige el juego del que descargar guardados",
    choices: games.map((g) => ({ name: g.id, value: g.id })),
  });
  console.log("\n⬇️  Descargando guardados de:", gameId);
  console.log("(download en desarrollo)\n");
}
