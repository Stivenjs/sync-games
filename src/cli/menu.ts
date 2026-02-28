import { select, confirm, Separator } from "@inquirer/prompts";
import type { MainAction } from "@cli/constants";
import type { CliDeps } from "@cli/container";
import * as commands from "@cli/commands";

export async function showMainMenu(): Promise<MainAction> {
  const action = await select<MainAction>({
    message: "¿Qué quieres hacer?",
    pageSize: 12,
    choices: [
      { name: "➕  Añadir un juego (ruta de guardados)", value: "add" },
      { name: "📋  Listar juegos configurados", value: "list" },
      { name: "🔍  Analizar rutas (buscar candidatos)", value: "scan" },
      new Separator(),
      { name: "☁️  Subir guardados a la nube", value: "upload" },
      { name: "⬇️  Descargar guardados", value: "download" },
      new Separator(),
      { name: "⚙️  Ver ruta del archivo de config", value: "config" },
      new Separator(),
      { name: "Salir", value: "exit" },
    ],
  });
  return action;
}

async function runAction(deps: CliDeps, action: MainAction): Promise<void> {
  switch (action) {
    case "add":
      await commands.runAddInteractive(deps);
      break;
    case "list":
      await commands.runList(deps);
      break;
    case "scan":
      await commands.runScan(deps);
      break;
    case "upload":
      await commands.runUploadInteractive(deps);
      break;
    case "download":
      await commands.runDownloadInteractive(deps);
      break;
    case "config":
      commands.runConfig(deps);
      break;
    case "exit":
      console.log("Hasta luego.\n");
      process.exit(0);
  }
}

export async function runInteractiveLoop(deps: CliDeps): Promise<void> {
  try {
    const { printWelcomeBanner } = await import("@cli/banner");
    await printWelcomeBanner();
  } catch {
    console.log("\n  sync-games — Guardados en la nube\n");
  }
  while (true) {
    const action = await showMainMenu();
    await runAction(deps, action);
    if (action !== "exit") {
      const again = await confirm({
        message: "¿Volver al menú?",
        default: true,
      });
      if (!again) {
        console.log("Hasta luego.\n");
        process.exit(0);
      }
    }
  }
}
