import type { SaveRepository } from "@domain/ports/SaveRepository";

export interface GetDownloadUrlInput {
  userId: string;
  gameId: string;
  key: string;
}

export interface GetDownloadUrlOutput {
  downloadUrl: string;
}

/**
 * Caso de uso: obtener URL firmada para descargar un guardado desde S3.
 */
export class GetDownloadUrlUseCase {
  constructor(private readonly saveRepository: SaveRepository) {}

  async execute(input: GetDownloadUrlInput): Promise<GetDownloadUrlOutput> {
    const downloadUrl = await this.saveRepository.getDownloadUrl(
      input.userId,
      input.gameId,
      input.key
    );
    return { downloadUrl };
  }
}
