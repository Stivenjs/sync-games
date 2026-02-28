import type { CliDeps } from "@cli/container";

export function runConfig(deps: CliDeps): void {
  const { configPath } = deps.getConfigPathUseCase.execute();
  console.log("\n⚙️  Config:", configPath, "\n");
}
