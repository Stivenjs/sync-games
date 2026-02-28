/**
 * Entidad de dominio: representación de un guardado de juego.
 * No depende de infraestructura ni frameworks.
 */
export interface GameSave {
  readonly gameId: string;
  readonly key: string;
  readonly lastModified: Date;
  readonly size?: number;
}
