import type { SaveRepository } from "@domain/ports/SaveRepository";

export interface GetDownloadUrlInput {
  userId: string;
  gameId: string;
  key: string;
  /** Rango opcional en bytes para descarga resumible (pausar/reanudar por chunk). */
  range?: { start: number; end: number };
}

export interface GetDownloadUrlOutput {
  downloadUrl: string;
}

/**
 * Caso de uso: obtener URL firmada para descargar un guardado desde S3.
 * Si se pasa range, la URL solo sirve para ese rango (útil para descarga por partes y pausar/reanudar).
 */
export class GetDownloadUrlUseCase {
  constructor(private readonly saveRepository: SaveRepository) {}

  async execute(input: GetDownloadUrlInput): Promise<GetDownloadUrlOutput> {
    const downloadUrl = await this.saveRepository.getDownloadUrl(
      input.userId,
      input.gameId,
      input.key,
      input.range
    );
    return { downloadUrl };
  }
}
