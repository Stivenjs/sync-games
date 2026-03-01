import { select, confirm, Separator } from "@inquirer/prompts";
import { execSync } from "child_process";
import { existsSync } from "fs";
import figures from "figures";
import type { CliDeps } from "@cli/container";
import type { Config } from "@cli/domain/entities/Config";

const CANCEL_OPTION = "__cancel__";

/**
 * Detecta las unidades/volúmenes montados en el sistema.
 * Windows: wmic o Get-Volume vía PowerShell.
 * Unix: parsea /proc/mounts o df.
 */
function detectDrives(): { letter: string; path: string }[] {
  if (process.platform === "win32") {
    return detectWindowsDrives();
  }
  return detectUnixMounts();
}

function getSystemDrive(): string {
  return (process.env.SystemDrive ?? "C:").toUpperCase();
}

function detectWindowsDrives(): { letter: string; path: string }[] {
  const systemDrive = getSystemDrive();
  let drives: { letter: string; path: string }[];

  try {
    const raw = execSync(
      'powershell -NoProfile -Command "Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root"',
      { encoding: "utf-8", timeout: 5000 }
    );
    drives = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length >= 2 && existsSync(l))
      .map((root) => ({
        letter: root.replace(/[:\\\/]+$/, ""),
        path: root,
      }));
  } catch {
    drives = [];
    for (let code = 65; code <= 90; code++) {
      const letter = String.fromCharCode(code);
      const root = `${letter}:\\`;
      if (existsSync(root)) {
        drives.push({ letter, path: root });
      }
    }
  }

  return drives.filter(
    (d) => d.letter.toUpperCase() !== systemDrive
  );
}

function detectUnixMounts(): { letter: string; path: string }[] {
  try {
    const raw = execSync("df -h --output=target 2>/dev/null || df -h", {
      encoding: "utf-8",
      timeout: 5000,
    });
    const lines = raw.split(/\r?\n/).slice(1);
    return lines
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.startsWith("/") &&
          !l.startsWith("/snap") &&
          !l.startsWith("/boot") &&
          !l.startsWith("/sys") &&
          !l.startsWith("/proc") &&
          !l.startsWith("/dev") &&
          !l.startsWith("/run")
      )
      .map((mount) => ({ letter: mount, path: mount }));
  } catch {
    return [{ letter: "/", path: "/" }];
  }
}

export async function runScanPathsInteractive(deps: CliDeps): Promise<void> {
  const config = await deps.getConfigUseCase.execute();
  const currentPaths = config.customScanPaths ?? [];

  const action = await select<string>({
    message: "Rutas de escaneo personalizadas",
    choices: [
      { name: `${figures.pointer} Añadir ruta de escaneo`, value: "add" },
      {
        name: `${figures.hamburger} Ver rutas configuradas (${currentPaths.length})`,
        value: "list",
      },
      { name: `${figures.cross} Eliminar ruta de escaneo`, value: "remove" },
      new Separator(),
      { name: `${figures.arrowLeft} Volver`, value: CANCEL_OPTION },
    ],
  });

  if (action === CANCEL_OPTION) return;

  switch (action) {
    case "add":
      await addScanPath(deps, config, currentPaths);
      break;
    case "list":
      listScanPaths(currentPaths);
      break;
    case "remove":
      await removeScanPath(deps, config, currentPaths);
      break;
  }
}

async function addScanPath(
  deps: CliDeps,
  config: Config,
  currentPaths: readonly string[]
): Promise<void> {
  const drives = detectDrives();

  if (drives.length === 0) {
    console.log("\nNo se detectaron unidades.\n");
    return;
  }

  const alreadySet = new Set(currentPaths.map((p) => p.toLowerCase()));

  const choices = drives
    .filter((d) => !alreadySet.has(d.path.toLowerCase()))
    .map((d) => ({
      name: `${figures.squareSmallFilled} ${d.letter}  (${d.path})`,
      value: d.path,
    }));

  if (choices.length === 0) {
    console.log("\nTodas las unidades ya están configuradas.\n");
    return;
  }

  choices.push(
    { name: "", value: "" } as never // Separator workaround
  );

  const driveChoices = [
    ...choices.filter((c) => c.value),
    new Separator(),
    { name: `${figures.arrowLeft} Cancelar`, value: CANCEL_OPTION },
  ];

  const selected = await select<string>({
    message: "Selecciona la unidad a añadir como ruta de escaneo",
    choices: driveChoices,
  });

  if (selected === CANCEL_OPTION) return;

  const newPaths = [...currentPaths, selected];
  await deps.getConfigUseCase.save({ ...config, customScanPaths: newPaths });
  console.log(`\n${figures.tick} Ruta añadida: ${selected}\n`);
}

function listScanPaths(currentPaths: readonly string[]): void {
  if (currentPaths.length === 0) {
    console.log("\nNo hay rutas personalizadas configuradas.\n");
    return;
  }
  console.log(`\n${figures.hamburger} Rutas de escaneo personalizadas:\n`);
  for (const p of currentPaths) {
    console.log(`  • ${p}`);
  }
  console.log("");
}

async function removeScanPath(
  deps: CliDeps,
  config: Config,
  currentPaths: readonly string[]
): Promise<void> {
  if (currentPaths.length === 0) {
    console.log("\nNo hay rutas personalizadas para eliminar.\n");
    return;
  }

  const choices = [
    ...currentPaths.map((p) => ({ name: `→ ${p}`, value: p })),
    new Separator(),
    { name: `${figures.arrowLeft} Cancelar`, value: CANCEL_OPTION },
  ];

  const selected = await select<string>({
    message: "¿Qué ruta quieres eliminar?",
    choices,
  });

  if (selected === CANCEL_OPTION) return;

  const sure = await confirm({
    message: `¿Eliminar "${selected}" de las rutas de escaneo?`,
    default: false,
  });
  if (!sure) return;

  const newPaths = currentPaths.filter((p) => p !== selected);
  await deps.getConfigUseCase.save({ ...config, customScanPaths: newPaths });
  console.log(`\n${figures.tick} Ruta eliminada: ${selected}\n`);
}
