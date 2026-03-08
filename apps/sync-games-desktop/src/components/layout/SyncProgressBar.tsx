import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "framer-motion";
import { formatGameDisplayName } from "@utils/gameImage";

export interface SyncProgressState {
  type: "upload" | "download";
  gameId: string;
  filename: string;
  loaded: number;
  total: number;
}

/** Si llevamos 100% más de este tiempo sin recibir *-done, ocultamos la barra por si el evento se perdió. */
const STALE_100_PERCENT_MS = 4000;

export function SyncProgressBar() {
  const [syncProgress, setSyncProgress] = useState<SyncProgressState | null>(
    null
  );
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubUpload = listen<{
      gameId: string;
      filename: string;
      loaded: number;
      total: number;
    }>("sync-upload-progress", (ev) => {
      setSyncProgress((prev) => {
        if (prev && prev.type !== "upload") return prev;
        return {
          type: "upload",
          gameId: ev.payload.gameId,
          filename: ev.payload.filename,
          loaded: ev.payload.loaded,
          total: ev.payload.total,
        };
      });
    });
    const unsubDownload = listen<{
      gameId: string;
      filename: string;
      loaded: number;
      total: number;
    }>("sync-download-progress", (ev) => {
      setSyncProgress((prev) => {
        if (prev && prev.type !== "download") return prev;
        return {
          type: "download",
          gameId: ev.payload.gameId,
          filename: ev.payload.filename,
          loaded: ev.payload.loaded,
          total: ev.payload.total,
        };
      });
    });
    const unsubUploadDone = listen("sync-upload-done", () => {
      setSyncProgress((prev) => (prev?.type === "upload" ? null : prev));
    });
    const unsubDownloadDone = listen("sync-download-done", () => {
      setSyncProgress((prev) => (prev?.type === "download" ? null : prev));
    });
    return () => {
      unsubUpload.then((f) => f());
      unsubDownload.then((f) => f());
      unsubUploadDone.then((f) => f());
      unsubDownloadDone.then((f) => f());
    };
  }, []);

  // Si la barra lleva mucho tiempo en 100% sin recibir *-done, ocultar (evita quedarse colgada)
  useEffect(() => {
    if (!syncProgress || syncProgress.total <= 0) {
      if (staleTimerRef.current) {
        clearTimeout(staleTimerRef.current);
        staleTimerRef.current = null;
      }
      return;
    }
    const is100 =
      syncProgress.loaded >= syncProgress.total && syncProgress.total > 0;
    if (!is100) {
      if (staleTimerRef.current) {
        clearTimeout(staleTimerRef.current);
        staleTimerRef.current = null;
      }
      return;
    }
    staleTimerRef.current = setTimeout(() => {
      setSyncProgress(null);
      staleTimerRef.current = null;
    }, STALE_100_PERCENT_MS);
    return () => {
      if (staleTimerRef.current) {
        clearTimeout(staleTimerRef.current);
      }
    };
  }, [syncProgress?.loaded, syncProgress?.total]);

  const value =
    syncProgress && syncProgress.total > 0
      ? Math.min(
          100,
          Math.round((syncProgress.loaded / syncProgress.total) * 100)
        )
      : 0;

  return (
    <AnimatePresence>
      {syncProgress && (
        <motion.div
          key="sync-progress"
          initial={{ y: 48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 48, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-4 left-6 right-6 z-50 rounded-lg border border-default-200 bg-default-100/95 px-4 py-3 shadow-lg backdrop-blur sm:left-1/2 sm:right-auto sm:w-96 sm:-translate-x-1/2"
          aria-label={
            syncProgress.type === "upload"
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
              {syncProgress.type === "upload" ? "Subiendo" : "Descargando"}:{" "}
              {formatGameDisplayName(syncProgress.gameId)}
            </span>
            <span className="text-xs text-default-500 tabular-nums">
              {syncProgress.total > 0 ? `${value}%` : "—"}
            </span>
          </div>
          <p className="truncate text-xs text-default-500">
            {syncProgress.filename}
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
