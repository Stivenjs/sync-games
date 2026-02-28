import type { GameSave } from "@domain/entities/GameSave";
import type { SaveRepository } from "@domain/ports/SaveRepository";

export interface ListSavesInput {
  userId: string;
}

export type ListSavesOutput = GameSave[];

/**
 * Caso de uso: listar todos los guardados de un usuario.
 */
export class ListSavesUseCase {
  constructor(private readonly saveRepository: SaveRepository) {}

  async execute(input: ListSavesInput): Promise<ListSavesOutput> {
    return this.saveRepository.listByUser(input.userId);
  }
}
