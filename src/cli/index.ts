#!/usr/bin/env bun
/**
 * Punto de entrada del CLI.
 * Sin argumentos + TTY → menú interactivo. Con comando → modo script.
 */
import { getCliArgs } from "./argv";
import { createContainer } from "./container";
import { runCommandMode, showHelp } from "./command-mode";
import { runInteractiveLoop } from "./menu";
import { waitForKeypressOnWindowsIfNeeded, isExitPromptError } from "./utils";

const args = getCliArgs();
const command = args[0];
const isInteractive = !command && process.stdin.isTTY;

async function main(): Promise<void> {
  const deps = createContainer();

  try {
    if (isInteractive) {
      await runInteractiveLoop(deps);
    } else if (!command) {
      showHelp();
      await waitForKeypressOnWindowsIfNeeded();
      process.exit(0);
    } else {
      const code = await runCommandMode(deps, command, args);
      await waitForKeypressOnWindowsIfNeeded();
      process.exit(code);
    }
  } catch (err) {
    if (isExitPromptError(err)) {
      process.exit(0);
    }
    console.error(err instanceof Error ? err.message : String(err));
    await waitForKeypressOnWindowsIfNeeded();
    process.exit(1);
  }
}

main();
