import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { getPausedUploadInfo } from "@services/tauri/config.service";
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

interface SyncStore {
  syncOperation: SyncOperation | null;
  progress: SyncProgressState | null;
  pausedUploadInfo: PausedUploadInfo | null;

  setSyncOperation: (op: SyncOperation | null) => void;
  setProgress: (
    progress: SyncProgressState | null | ((prev: SyncProgressState | null) => SyncProgressState | null)
  ) => void;
  refreshPausedUploadInfo: () => Promise<void>;
  clearPausedUploadInfo: () => void;
}

/** Si llevamos 100% más de este tiempo sin recibir *-done, ocultamos por si el evento se perdió. */
const STALE_100_PERCENT_MS = 4000;
let staleTimer: ReturnType<typeof setTimeout> | null = null;

export const useSyncStore = create<SyncStore>((set) => ({
  syncOperation: null,
  progress: null,
  pausedUploadInfo: null,

  setSyncOperation: (op) => {
    set({ syncOperation: op });
    if (!op) set({ progress: null });
  },

  setProgress: (newProgress) => {
    set((state) => {
      const nextProgress = typeof newProgress === "function" ? newProgress(state.progress) : newProgress;

      if (staleTimer) {
        clearTimeout(staleTimer);
        staleTimer = null;
      }

      if (nextProgress && nextProgress.total > 0 && nextProgress.loaded >= nextProgress.total) {
        staleTimer = setTimeout(() => {
          set({ progress: null, syncOperation: null });
          staleTimer = null;
        }, STALE_100_PERCENT_MS);
      }

      return { progress: nextProgress };
    });
  },

  refreshPausedUploadInfo: async () => {
    try {
      const info = await getPausedUploadInfo();
      set({ pausedUploadInfo: info });
    } catch (error) {
      console.error("Failed to fetch paused upload info", error);
    }
  },

  clearPausedUploadInfo: () => set({ pausedUploadInfo: null }),
}));

let listenersInitialized = false;

export function initSyncListeners() {
  if (listenersInitialized) return;
  listenersInitialized = true;

  const { setProgress, refreshPausedUploadInfo } = useSyncStore.getState();

  refreshPausedUploadInfo();

  listen<{ gameId: string; filename: string; loaded: number; total: number }>("sync-upload-progress", (ev) => {
    setProgress((prev) => {
      if (prev && prev.type !== "upload") return prev;
      return { type: "upload", ...ev.payload };
    });
  });

  listen<{ gameId: string; filename: string; loaded: number; total: number }>("sync-download-progress", (ev) => {
    setProgress((prev) => {
      if (prev && prev.type !== "download") return prev;
      return { type: "download", ...ev.payload };
    });
  });

  listen("sync-upload-done", () => {
    const state = useSyncStore.getState();
    const op = state.syncOperation;
    if (op?.mode === "batch") return;

    state.setProgress((prev) => (prev?.type === "upload" ? null : prev));
    state.setSyncOperation(null);

    if (op?.mode === "single" && op?.gameId) {
      notifyUploadDone(formatGameDisplayName(op.gameId)).catch(() => {});
    }
  });

  listen<{ gameId: string; filename: string }>("sync-upload-paused", (ev) => {
    const state = useSyncStore.getState();
    state.setProgress((prev) => (prev?.type === "upload" ? null : prev));
    state.setSyncOperation(null);
    useSyncStore.setState({
      pausedUploadInfo: { gameId: ev.payload.gameId, filename: ev.payload.filename },
    });
  });

  listen("sync-download-done", () => {
    const state = useSyncStore.getState();
    const op = state.syncOperation;
    state.setProgress((prev) => (prev?.type === "download" ? null : prev));
    state.setSyncOperation(null);
    if (op?.mode === "single" && op?.gameId) {
      notifyDownloadDone(formatGameDisplayName(op.gameId)).catch(() => {});
    }
  });

  listen("full-backup-done", () => {
    const state = useSyncStore.getState();
    const op = state.syncOperation;
    state.setProgress((prev) => (prev?.type === "upload" ? null : prev));
    state.setSyncOperation(null);
    if (op?.mode === "single" && op?.gameId) {
      notifyFullBackupDone(formatGameDisplayName(op.gameId)).catch(() => {});
    }
  });
}
