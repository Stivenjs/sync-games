import { motion } from "framer-motion";
import type { SyncProgressState } from "@components/layout";

export interface GameCardSyncProgressProps {
  /** Progreso de subida o descarga del juego (muestra barra inline). */
  progress: SyncProgressState;
}

/**
 * Barra de progreso inline para subida/descarga de un solo juego dentro de una GameCard.
 */
export function GameCardSyncProgress({ progress }: GameCardSyncProgressProps) {
  if (progress.total <= 0) return null;

  const percent = Math.min(
    100,
    Math.round((progress.loaded / progress.total) * 100)
  );

  return (
    <div className="absolute bottom-14 left-0 right-0 z-10 mx-2 rounded-md border border-default-200 bg-default-100/95 px-2 py-1.5 shadow-md backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-medium text-foreground">
          {progress.type === "upload" ? "Subiendo" : "Descargando"}:{" "}
          <span className="truncate">{progress.filename}</span>
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-default-500">
          {percent}%
        </span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-default-200">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={false}
          animate={{
            width: `${Math.min(100, (progress.loaded / progress.total) * 100)}%`,
          }}
          transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
