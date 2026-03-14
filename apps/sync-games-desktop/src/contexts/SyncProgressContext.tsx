import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { getPausedUploadInfo } from "@services/tauri";
import { formatGameDisplayName } from "@utils/gameImage";
import { notifyDownloadDone, notifyFullBackupDone, notifyUploadDone } from "@utils/notification";

export interface SyncProgressState {
  type: "upload" | "download";
  gameId: string;
  filename: string;
  loaded: number;
  total: number;
}

export type SyncProgressMode = "single" | "batch";

export interface SyncOperation {
  type: "upload" | "download";
  mode: SyncProgressMode;
  gameId: string | null;
}

export interface PausedUploadInfo {
  gameId: string;
  filename: string;
}

type SyncProgressContextValue = {
  /** Operación en curso: single (un juego) o batch (todos). null cuando no hay. */
  syncOperation: SyncOperation | null;
  /** Progreso actual (archivo actual, loaded/total). */
  progress: SyncProgressState | null;
  /** Si hay una subida pausada (para mostrar "Reanudar"). */
  pausedUploadInfo: PausedUploadInfo | null;
  /** Llamar al iniciar una subida/descarga: single con gameId o batch con gameId null. */
  setSyncOperation: (op: SyncOperation | null) => void;
  /** Refresca si hay subida pausada (p. ej. al montar). */
  refreshPausedUploadInfo: () => Promise<void>;
  /** Limpia la info de subida pausada (tras reanudar con éxito). */
  clearPausedUploadInfo: () => void;
};

const SyncProgressContext = createContext<SyncProgressContextValue | null>(null);

/** Si llevamos 100% más de este tiempo sin recibir *-done, ocultamos por si el evento se perdió. */
const STALE_100_PERCENT_MS = 4000;

export function SyncProgressProvider({ children }: { children: ReactNode }) {
  const [syncOperation, setSyncOperationState] = useState<SyncOperation | null>(null);
  const [progress, setProgress] = useState<SyncProgressState | null>(null);
  const [pausedUploadInfo, setPausedUploadInfo] = useState<PausedUploadInfo | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncOperationRef = useRef<SyncOperation | null>(null);
  syncOperationRef.current = syncOperation;

  const setSyncOperation = useCallback((op: SyncOperation | null) => {
    setSyncOperationState(op);
    if (!op) setProgress(null);
  }, []);

  const refreshPausedUploadInfo = useCallback(async () => {
    const info = await getPausedUploadInfo();
    setPausedUploadInfo(info);
  }, []);

  const clearPausedUploadInfo = useCallback(() => {
    setPausedUploadInfo(null);
  }, []);

  useEffect(() => {
    const unsubUpload = listen<{
      gameId: string;
      filename: string;
      loaded: number;
      total: number;
    }>("sync-upload-progress", (ev) => {
      setProgress((prev) => {
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
      setProgress((prev) => {
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
      const op = syncOperationRef.current;
      if (op?.mode === "batch") return;
      setProgress((prev) => (prev?.type === "upload" ? null : prev));
      setSyncOperationState(null);
      if (op?.mode === "single" && op?.gameId) {
        notifyUploadDone(formatGameDisplayName(op.gameId)).catch(() => {});
      }
    });
    const unsubUploadPaused = listen<{ gameId: string; filename: string }>("sync-upload-paused", (ev) => {
      setProgress((prev) => (prev?.type === "upload" ? null : prev));
      setSyncOperationState(null);
      setPausedUploadInfo({
        gameId: ev.payload.gameId,
        filename: ev.payload.filename,
      });
    });
    const unsubDownloadDone = listen("sync-download-done", () => {
      const op = syncOperationRef.current;
      setProgress((prev) => (prev?.type === "download" ? null : prev));
      setSyncOperationState(null);
      if (op?.mode === "single" && op?.gameId) {
        notifyDownloadDone(formatGameDisplayName(op.gameId)).catch(() => {});
      }
    });
    const unsubFullBackupDone = listen("full-backup-done", () => {
      const op = syncOperationRef.current;
      setProgress((prev) => (prev?.type === "upload" ? null : prev));
      setSyncOperationState(null);
      if (op?.mode === "single" && op?.gameId) {
        notifyFullBackupDone(formatGameDisplayName(op.gameId)).catch(() => {});
      }
    });
    return () => {
      unsubUpload.then((f) => f());
      unsubDownload.then((f) => f());
      unsubUploadDone.then((f) => f());
      unsubDownloadDone.then((f) => f());
      unsubUploadPaused.then((f) => f());
      unsubFullBackupDone.then((f) => f());
    };
  }, []);

  useEffect(() => {
    refreshPausedUploadInfo();
  }, [refreshPausedUploadInfo]);

  useEffect(() => {
    if (!progress || progress.total <= 0) {
      if (staleTimerRef.current) {
        clearTimeout(staleTimerRef.current);
        staleTimerRef.current = null;
      }
      return;
    }
    const is100 = progress.loaded >= progress.total && progress.total > 0;
    if (!is100) {
      if (staleTimerRef.current) {
        clearTimeout(staleTimerRef.current);
        staleTimerRef.current = null;
      }
      return;
    }
    staleTimerRef.current = setTimeout(() => {
      setProgress(null);
      setSyncOperationState(null);
      staleTimerRef.current = null;
    }, STALE_100_PERCENT_MS);
    return () => {
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    };
  }, [progress?.loaded, progress?.total]);

  const value: SyncProgressContextValue = {
    syncOperation,
    progress,
    pausedUploadInfo,
    setSyncOperation,
    refreshPausedUploadInfo,
    clearPausedUploadInfo,
  };

  return <SyncProgressContext.Provider value={value}>{children}</SyncProgressContext.Provider>;
}

export function useSyncProgress(): SyncProgressContextValue {
  const ctx = useContext(SyncProgressContext);
  if (!ctx) {
    throw new Error("useSyncProgress must be used within a SyncProgressProvider");
  }
  return ctx;
}
