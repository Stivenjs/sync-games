import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";

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

type SyncProgressContextValue = {
  /** Operación en curso: single (un juego) o batch (todos). null cuando no hay. */
  syncOperation: SyncOperation | null;
  /** Progreso actual (archivo actual, loaded/total). */
  progress: SyncProgressState | null;
  /** Llamar al iniciar una subida/descarga: single con gameId o batch con gameId null. */
  setSyncOperation: (op: SyncOperation | null) => void;
};

const SyncProgressContext = createContext<SyncProgressContextValue | null>(
  null
);

/** Si llevamos 100% más de este tiempo sin recibir *-done, ocultamos por si el evento se perdió. */
const STALE_100_PERCENT_MS = 4000;

export function SyncProgressProvider({ children }: { children: ReactNode }) {
  const [syncOperation, setSyncOperationState] =
    useState<SyncOperation | null>(null);
  const [progress, setProgress] = useState<SyncProgressState | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSyncOperation = useCallback((op: SyncOperation | null) => {
    setSyncOperationState(op);
    if (!op) setProgress(null);
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
      setProgress((prev) => (prev?.type === "upload" ? null : prev));
      setSyncOperationState(null);
    });
    const unsubDownloadDone = listen("sync-download-done", () => {
      setProgress((prev) => (prev?.type === "download" ? null : prev));
      setSyncOperationState(null);
    });
    return () => {
      unsubUpload.then((f) => f());
      unsubDownload.then((f) => f());
      unsubUploadDone.then((f) => f());
      unsubDownloadDone.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (!progress || progress.total <= 0) {
      if (staleTimerRef.current) {
        clearTimeout(staleTimerRef.current);
        staleTimerRef.current = null;
      }
      return;
    }
    const is100 =
      progress.loaded >= progress.total && progress.total > 0;
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
    setSyncOperation,
  };

  return (
    <SyncProgressContext.Provider value={value}>
      {children}
    </SyncProgressContext.Provider>
  );
}

export function useSyncProgress(): SyncProgressContextValue {
  const ctx = useContext(SyncProgressContext);
  if (!ctx) {
    throw new Error(
      "useSyncProgress must be used within a SyncProgressProvider"
    );
  }
  return ctx;
}
