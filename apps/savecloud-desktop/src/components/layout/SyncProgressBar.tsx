import { AnimatePresence, motion } from "framer-motion";
import { Spinner, Tooltip } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSyncStore } from "@store/SyncStore";
import { requestUploadCancel, requestUploadPause, syncUploadResume } from "@services/tauri";
import { formatBytes } from "@utils/format";
import { formatGameDisplayName } from "@utils/gameImage";
import { formatEta, formatSpeed } from "@utils/progress";
import { Clock, HardDrive, Pause, PauseCircle, Upload, X, Zap } from "lucide-react";

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
  const constraintsRef = useRef<HTMLDivElement | null>(null);

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
    <>
      {/* Contenedor invisible para limitar el área donde se puede arrastrar */}
      <div ref={constraintsRef} className="pointer-events-none fixed inset-0 z-50" />

      <AnimatePresence>
        {showFloatingBar && progress && (
          <motion.div
            key="sync-progress"
            drag
            dragConstraints={constraintsRef}
            dragElastic={0.1}
            dragMomentum={false}
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-4 left-6 right-6 z-50 cursor-grab rounded-xl border border-default-200 bg-default-50/95 px-4 py-3.5 shadow-lg backdrop-blur active:cursor-grabbing sm:left-1/2 sm:right-auto sm:w-96 sm:-translate-x-1/2"
            aria-label={progress.type === "upload" ? "Progreso de subida" : "Progreso de descarga"}
            role="status"
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={100}>
            {/* Header: badge de tipo + nombre del juego + porcentaje */}
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {/* Badge coloreado según tipo de operación */}
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    progress.type === "upload" ? "bg-primary/10 text-primary" : "bg-success/10 text-success"
                  }`}>
                  {progress.type === "upload" ? <Upload size={10} aria-hidden /> : <HardDrive size={10} aria-hidden />}
                  {progress.type === "upload" ? "Subiendo" : "Descargando"}
                </span>
                <span className="truncate text-sm font-medium text-foreground">
                  {formatGameDisplayName(progress.gameId)}
                </span>
              </div>
              <span className="shrink-0 text-xs font-semibold text-default-500 tabular-nums">
                {isIndeterminate ? "—" : progress.total > 0 ? `${value}%` : "—"}
              </span>
            </div>

            {/* Filename + controles separados por divisor */}
            <div className="mt-1 flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-xs text-default-400">{progress.filename}</p>
              {progress.type === "upload" && (
                <>
                  {/* Separador visual */}
                  <span className="shrink-0 text-default-200 select-none" aria-hidden>
                    |
                  </span>
                  <span className="flex shrink-0 gap-1 pointer-events-auto">
                    {canPause ? (
                      <Tooltip content="Pausar subida" placement="top">
                        <button
                          type="button"
                          onClick={onPauseUpload}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-foreground hover:bg-default-200 transition-colors"
                          aria-label="Pausar subida"
                          onPointerDownCapture={(e) => e.stopPropagation()}>
                          <Pause size={14} />
                        </button>
                      </Tooltip>
                    ) : null}
                    <Tooltip content="Cancelar subida" placement="top">
                      <button
                        type="button"
                        onClick={onCancelUpload}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-danger hover:bg-danger/10 transition-colors"
                        aria-label="Cancelar subida"
                        onPointerDownCapture={(e) => e.stopPropagation()}>
                        <X size={14} />
                      </button>
                    </Tooltip>
                  </span>
                </>
              )}
            </div>

            {/* Barra de progreso o spinner */}
            {isIndeterminate ? (
              <div className="mt-2.5 flex items-center gap-2">
                <Spinner size="sm" color="primary" aria-label="Preparando datos" />
                <p className="text-xs text-default-500">
                  Preparando datos… esto puede tardar unos minutos en juegos grandes.
                </p>
              </div>
            ) : (
              <div className="relative mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-default-200">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={false}
                  animate={{ width: `${value}%` }}
                  transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
                />
                {/* Pulso animado sobre la barra activa */}
                {value > 0 && value < 100 && (
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full bg-primary/40"
                    animate={{ width: [`${value}%`, `${Math.min(value + 4, 100)}%`, `${value}%`] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
              </div>
            )}

            {/* Métricas: bytes, velocidad, ETA */}
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-default-400">
              <span className="inline-flex items-center gap-1.5">
                {progress.type === "upload" ? (
                  <Upload size={11} className="shrink-0 text-primary" aria-hidden />
                ) : (
                  <HardDrive size={11} className="shrink-0 text-primary" aria-hidden />
                )}
                <span>
                  {progress.type === "upload" ? "Enviados" : "En disco"}:{" "}
                  <span className="tabular-nums font-medium text-default-500">
                    {formatBytes(progress.loaded)}
                    {progress.total > 0 ? ` / ${formatBytes(progress.total)}` : ""}
                  </span>
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Zap size={11} className="shrink-0 text-default-400" aria-hidden />
                <span>
                  Velocidad: <span className="tabular-nums font-medium text-default-500">{formatSpeed(speedBps)}</span>
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock size={11} className="shrink-0 text-default-400" aria-hidden />
                {!isIndeterminate && progress.total > 0 ? (
                  <span className="tabular-nums font-medium text-default-500">{formatEta(etaSeconds)}</span>
                ) : (
                  <span>—</span>
                )}
              </span>
            </div>
          </motion.div>
        )}

        {/* Estado pausado: más llamativo con ícono, borde y fondo diferenciado */}
        {!showFloatingBar && pausedUploadInfo && (
          <motion.div
            key="paused-upload"
            drag
            dragConstraints={constraintsRef}
            dragElastic={0.1}
            dragMomentum={false}
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-4 left-6 right-6 z-50 cursor-grab rounded-xl border border-warning/40 bg-warning/5 px-4 py-3.5 shadow-lg backdrop-blur active:cursor-grabbing sm:left-1/2 sm:right-auto sm:w-96 sm:-translate-x-1/2">
            <div className="flex items-center gap-3">
              {/* Ícono de pausa con color warning */}
              <PauseCircle size={20} className="shrink-0 text-warning" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-warning">Subida pausada</p>
                <p className="truncate text-xs text-default-500">
                  {formatGameDisplayName(pausedUploadInfo.gameId)} — {pausedUploadInfo.filename}
                </p>
              </div>
              <button
                type="button"
                onClick={onResumeUpload}
                disabled={resuming}
                onPointerDownCapture={(e) => e.stopPropagation()}
                className="shrink-0 rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning hover:bg-warning/25 disabled:opacity-50 transition-colors">
                {resuming ? "Reanudando…" : "Reanudar"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
