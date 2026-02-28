import type { CliDeps } from "@cli/container";

export async function runScan(deps: CliDeps): Promise<void> {
  console.log("\n🔍 Analizando rutas típicas...\n");
  const candidates = await deps.scanForPathCandidatesUseCase.execute();
  if (candidates.length === 0) {
    console.log("No se encontraron carpetas candidatas.");
    return;
  }
  let currentBase = "";
  for (const c of candidates) {
    if (c.basePath !== currentBase) {
      currentBase = c.basePath;
      console.log(`  [${currentBase}]`);
    }
    console.log(`    • ${c.folderName}`);
    console.log(`      → ${c.path}`);
  }
  console.log("\nPara añadir uno: menú → Añadir un juego.\n");
}
