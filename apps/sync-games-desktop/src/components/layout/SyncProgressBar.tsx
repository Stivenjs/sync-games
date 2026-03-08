import { AnimatePresence, motion } from "framer-motion";
import { useSyncProgress } from "@contexts/SyncProgressContext";
import { formatGameDisplayName } from "@utils/gameImage";

// Re-exportar para que los consumidores que importan desde layout sigan funcionando
export type { SyncProgressState } from "@contexts/SyncProgressContext";

/** Barra flotante de progreso: solo se muestra en operaciones "subir/descargar todos" (batch). */
export function SyncProgressBar() {
  const { syncOperation, progress } = useSyncProgress();

  const showFloatingBar =
    syncOperation?.mode === "batch" && progress && progress.total > 0;

  const value =
    progress && progress.total > 0
      ? Math.min(
          100,
          Math.round((progress.loaded / progress.total) * 100)
        )
      : 0;

  return (
    <AnimatePresence>
      {showFloatingBar && progress && (
        <motion.div
          key="sync-progress"
          initial={{ y: 48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 48, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-4 left-6 right-6 z-50 rounded-lg border border-default-200 bg-default-100/95 px-4 py-3 shadow-lg backdrop-blur sm:left-1/2 sm:right-auto sm:w-96 sm:-translate-x-1/2"
          aria-label={
            progress.type === "upload"
              ? "Progreso de subida"
              : "Progreso de descarga"
          }
          role="status"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              {progress.type === "upload" ? "Subiendo" : "Descargando"}:{" "}
              {formatGameDisplayName(progress.gameId)}
            </span>
            <span className="text-xs text-default-500 tabular-nums">
              {progress.total > 0 ? `${value}%` : "—"}
            </span>
          </div>
          <p className="truncate text-xs text-default-500">
            {progress.filename}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-default-200">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={false}
              animate={{
                width: `${value}%`,
              }}
              transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
