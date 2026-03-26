import { AnimatePresence, motion } from "framer-motion";
import { Spinner, Tooltip } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSyncStore } from "@store/SyncStore";
import { requestUploadCancel, requestUploadPause, syncUploadResume } from "@services/tauri";
import { formatBytes } from "@utils/format";
import { formatGameDisplayName } from "@utils/gameImage";
import { formatEta, formatSpeed } from "@utils/progress";
import { Clock, HardDrive, Pause, Upload, X, Zap } from "lucide-react";

export type { SyncProgressState } from "@store/SyncStore";

/** Barra flotante de progreso: solo se muestra en operaciones "subir/descargar todos" (batch). */
export function SyncProgressBar() {
  const syncOperation = useSyncStore((state) => state.syncOperation);
  const progress = useSyncStore((state) => state.progress);
  const pausedUploadInfo = useSyncStore((state) => state.pausedUploadInfo);
  const clearPausedUploadInfo = useSyncStore((state) => state.clearPausedUploadInfo);

  const [resuming, setResuming] = useState(false);
  const [speedBps, setSpeedBps] = useState<number | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const startRef = useRef<number | null>(null);
  const lastProgressRef = useRef<{
    loaded: number;
    t: number;
    gameId: string;
    filename: string;
  } | null>(null);

  const onCancelUpload = useCallback(() => {
    requestUploadCancel().catch(() => {});
  }, []);

  const onPauseUpload = useCallback(() => {
    requestUploadPause().catch(() => {});
  }, []);

  const onResumeUpload = useCallback(async () => {
    setResuming(true);
    try {
      await syncUploadResume();
      clearPausedUploadInfo();
    } finally {
      setResuming(false);
    }
  }, [clearPausedUploadInfo]);

  const isPackagedOperation =
    progress?.filename?.includes("Empaquetando") ||
    progress?.filename?.includes("Extrayendo") ||
    progress?.filename?.startsWith("backups/") ||
    progress?.filename?.endsWith(".tar");

  const showFloatingBar = progress && (syncOperation?.mode === "batch" || isPackagedOperation);

  const isIndeterminate =
    progress &&
    (progress.filename?.includes("Empaquetando") || progress.filename?.includes("Extrayendo") || progress.total <= 0);

  const value =
    progress && progress.total > 0 ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : 0;

  const canPause = progress?.type === "upload" && !(isPackagedOperation && progress.total <= 0);

  useEffect(() => {
    if (!progress) {
      setSpeedBps(null);
      setEtaSeconds(null);
      startRef.current = null;
      lastProgressRef.current = null;
      return;
    }

    const now = performance.now();
    const last = lastProgressRef.current;

    if (
      !last ||
      last.gameId !== progress.gameId ||
      last.filename !== progress.filename ||
      progress.loaded < last.loaded
    ) {
      startRef.current = now;
      lastProgressRef.current = {
        loaded: progress.loaded,
        t: now,
        gameId: progress.gameId,
        filename: progress.filename,
      };
      setSpeedBps(null);
      setEtaSeconds(null);
      return;
    }

    if (!startRef.current) {
      startRef.current = now;
      lastProgressRef.current = {
        loaded: progress.loaded,
        t: now,
        gameId: progress.gameId,
        filename: progress.filename,
      };
      setSpeedBps(null);
      setEtaSeconds(null);
      return;
    }

    const lastPoint = lastProgressRef.current;
    if (!lastPoint || progress.loaded <= lastPoint.loaded) {
      return;
    }

    const dtMs = now - startRef.current;
    if (dtMs <= 0) return;

    const bytesDelta = progress.loaded - 0;
    const bps = bytesDelta / (dtMs / 1000);
    setSpeedBps(bps);

    const elapsedSec = dtMs / 1000;
    if (progress.total > 0 && bps > 0 && elapsedSec >= 2) {
      const remaining = progress.total - progress.loaded;
      let eta = remaining / bps;
      if (eta > 2 * 60 * 60) {
        eta = 2 * 60 * 60;
      }
      setEtaSeconds(eta);
    } else {
      setEtaSeconds(null);
    }

    lastProgressRef.current = {
      loaded: progress.loaded,
      t: now,
      gameId: progress.gameId,
      filename: progress.filename,
    };
  }, [progress?.loaded, progress?.total, progress?.gameId, progress?.type]);

  if (!showFloatingBar && !pausedUploadInfo) {
    return <AnimatePresence />;
  }

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
          aria-label={progress.type === "upload" ? "Progreso de subida" : "Progreso de descarga"}
          role="status"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={100}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              {progress.type === "upload" ? "Subiendo" : "Descargando"}: {formatGameDisplayName(progress.gameId)}
            </span>
            <span className="text-xs text-default-500 tabular-nums">
              {isIndeterminate ? "—" : progress.total > 0 ? `${value}%` : "—"}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-xs text-default-500">{progress.filename}</p>
            {progress.type === "upload" && (
              <span className="flex shrink-0 gap-1">
                {canPause ? (
                  <Tooltip content="Pausar subida" placement="top">
                    <button
                      type="button"
                      onClick={onPauseUpload}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-foreground hover:bg-default-200"
                      aria-label="Pausar subida">
                      <Pause size={14} />
                    </button>
                  </Tooltip>
                ) : null}
                <Tooltip content="Cancelar subida" placement="top">
                  <button
                    type="button"
                    onClick={onCancelUpload}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-danger hover:bg-danger/10"
                    aria-label="Cancelar subida">
                    <X size={14} />
                  </button>
                </Tooltip>
              </span>
            )}
          </div>
          {isIndeterminate ? (
            <div className="mt-2 flex items-center gap-2">
              <Spinner size="sm" color="primary" aria-label="Preparando datos" />
              <p className="text-xs text-default-500">
                Preparando datos… esto puede tardar unos minutos en juegos grandes.
              </p>
            </div>
          ) : (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-default-200">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={false}
                animate={{ width: `${value}%` }}
                transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
              />
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-default-500">
            <span className="inline-flex items-center gap-1.5">
              {progress.type === "upload" ? (
                <Upload size={12} className="shrink-0 text-primary" aria-hidden />
              ) : (
                <HardDrive size={12} className="shrink-0 text-primary" aria-hidden />
              )}
              <span>
                {progress.type === "upload" ? "Enviados" : "En disco"}:{" "}
                <span className="tabular-nums">
                  {formatBytes(progress.loaded)}
                  {progress.total > 0 ? ` / ${formatBytes(progress.total)}` : ""}
                </span>
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap size={12} className="shrink-0 text-default-400" aria-hidden />
              <span>
                Velocidad{isIndeterminate ? " (aprox.)" : ""}:{" "}
                <span className="tabular-nums">{formatSpeed(speedBps)}</span>
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock size={12} className="shrink-0 text-default-400" aria-hidden />
              {!isIndeterminate && progress.total > 0 ? (
                <span className="tabular-nums">{formatEta(etaSeconds)}</span>
              ) : (
                <span>—</span>
              )}
            </span>
          </div>
        </motion.div>
      )}

      {pausedUploadInfo && (
        <motion.div
          key="paused-upload"
          initial={{ y: 48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 48, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-4 left-6 right-6 z-50 rounded-lg border border-default-200 bg-default-100/95 px-4 py-3 shadow-lg backdrop-blur sm:left-1/2 sm:right-auto sm:w-96 sm:-translate-x-1/2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm text-foreground">
              Subida pausada: {formatGameDisplayName(pausedUploadInfo.gameId)} —{" "}
              <span className="truncate">{pausedUploadInfo.filename}</span>
            </span>
            <button
              type="button"
              onClick={onResumeUpload}
              disabled={resuming}
              className="shrink-0 text-sm font-medium text-primary hover:underline disabled:opacity-50">
              {resuming ? "Reanudando…" : "Reanudar"}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
