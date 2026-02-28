import type { Config } from "@cli/domain/entities/Config";
import type { ConfiguredGame } from "@cli/domain/entities/ConfiguredGame";
import type { ConfigRepository } from "@cli/domain/ports/ConfigRepository";

export interface AddGameInput {
  gameId: string;
  path: string;
}

/**
 * Añade un juego al config, o añade una ruta si el juego ya existe.
 * No conoce disco ni JSON; solo orquesta el repositorio.
 */
export class AddGameUseCase {
  constructor(private readonly configRepository: ConfigRepository) {}

  async execute(input: AddGameInput): Promise<void> {
    const config = await this.configRepository.load();
    const normalizedId = input.gameId.trim().toLowerCase();
    const normalizedPath = input.path.trim();

    if (!normalizedId || !normalizedPath) {
      throw new Error("gameId y path son obligatorios");
    }

    const existingIndex = config.games.findIndex(
      (g) => g.id.toLowerCase() === normalizedId
    );
    const existing = existingIndex >= 0 ? config.games[existingIndex] : null;

    let newGames: ConfiguredGame[];

    if (existing) {
      const paths = [...existing.paths];
      if (!paths.includes(normalizedPath)) {
        paths.push(normalizedPath);
      }
      newGames = config.games.map((g, i) =>
        i === existingIndex ? { id: g.id, paths } : g
      );
    } else {
      newGames = [
        ...config.games,
        { id: normalizedId, paths: [normalizedPath] },
      ];
    }

    const newConfig: Config = {
      ...config,
      games: newGames,
    };
    await this.configRepository.save(newConfig);
  }
}
