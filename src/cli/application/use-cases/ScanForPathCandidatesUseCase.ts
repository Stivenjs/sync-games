import type { PathCandidate } from "@cli/domain/entities/PathCandidate";
import type { PathScanner } from "@cli/domain/ports/PathScanner";

export type ScanForPathCandidatesOutput = PathCandidate[];

/**
 * Escanea rutas típicas del SO en busca de carpetas que podrían ser guardados de juegos.
 * Delega en el scanner (infraestructura); no conoce rutas ni sistema de archivos.
 */
export class ScanForPathCandidatesUseCase {
  constructor(private readonly pathScanner: PathScanner) {}

  async execute(): Promise<ScanForPathCandidatesOutput> {
    return this.pathScanner.scan();
  }
}
