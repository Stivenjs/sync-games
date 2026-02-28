import type { CliDeps } from "@cli/container";

export async function runList(deps: CliDeps): Promise<void> {
  const games = await deps.listGamesUseCase.execute();
  if (games.length === 0) {
    console.log(
      "No hay juegos configurados. Elige «Añadir un juego» en el menú."
    );
    return;
  }
  console.log("\n📋 Juegos configurados:\n");
  for (const g of games) {
    console.log(`  • ${g.id}`);
    for (const p of g.paths) console.log(`      → ${p}`);
  }
  console.log("");
}
