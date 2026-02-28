import type { GameSave } from "@domain/entities/GameSave";

/**
 * Puerto (interface) para persistencia de guardados.
 * La capa de aplicación depende de este contrato; la implementación vive en infrastructure.
 */
export interface SaveRepository {
  getUploadUrl(
    userId: string,
    gameId: string,
    filename: string
  ): Promise<string>;
  getDownloadUrl(userId: string, gameId: string, key: string): Promise<string>;
  listByUser(userId: string): Promise<GameSave[]>;
}
