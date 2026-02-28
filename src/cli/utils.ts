/**
 * En Windows, si el proceso termina sin terminal abierta (doble clic al exe),
 * esperar Enter para que el usuario pueda leer la salida.
 */
export async function waitForKeypressOnWindowsIfNeeded(): Promise<void> {
  if (process.platform !== "win32" || !process.stdin.isTTY) return;
  console.log("Pulsa Enter para salir...");
  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
    process.stdin.resume();
  });
}

/**
 * Indica si el error es una salida intencional del usuario (Ctrl+C, etc.).
 */
export function isExitPromptError(err: unknown): boolean {
  if (err && typeof (err as { name: string }).name === "string") {
    const name = (err as { name: string }).name;
    return name === "ExitPromptError" || name === "User force closed";
  }
  return false;
}
