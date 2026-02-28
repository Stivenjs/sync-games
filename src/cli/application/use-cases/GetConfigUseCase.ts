import type { Config } from "@cli/domain/entities/Config";
import type { ConfigRepository } from "@cli/domain/ports/ConfigRepository";

/**
 * Devuelve la configuración completa (apiBaseUrl, userId, games).
 * Útil para el comando upload que necesita API y usuario.
 */
export class GetConfigUseCase {
  constructor(private readonly configRepository: ConfigRepository) {}

  async execute(): Promise<Config> {
    return this.configRepository.load();
  }
}
