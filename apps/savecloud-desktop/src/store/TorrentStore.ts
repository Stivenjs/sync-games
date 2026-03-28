import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";

export type TorrentDownloadState = "starting" | "downloading" | "paused" | "completed";

export interface TorrentProgressState {
  infoHash: string;
  name: string;
  progressPercent: number;
  downloadSpeedBytes: number;
  uploadSpeedBytes: number;
  state: TorrentDownloadState;
  totalBytes: number;
  downloadedBytes: number;
  etaSeconds: number | null;
  peersConnected: number;
}

interface TorrentStore {
  progress: TorrentProgressState | null;
  setProgress: (progress: TorrentProgressState | null) => void;
}

/** Timeout para ocultar la barra tras completar. */
const DONE_HIDE_MS = 3000;
let doneTimer: ReturnType<typeof setTimeout> | null = null;

export const useTorrentStore = create<TorrentStore>((set) => ({
  progress: null,
  setProgress: (progress) => {
    if (doneTimer) {
      clearTimeout(doneTimer);
      doneTimer = null;
    }
    if (progress?.state === "completed") {
      doneTimer = setTimeout(() => {
        set({ progress: null });
        doneTimer = null;
      }, DONE_HIDE_MS);
    }
    set({ progress });
  },
}));

let listenersInitialized = false;

export function initTorrentListeners() {
  if (listenersInitialized) return;
  listenersInitialized = true;

  const { setProgress } = useTorrentStore.getState();

  listen<TorrentProgressState>("torrent-download-progress", (ev) => {
    setProgress(ev.payload);
  });

  listen<string>("torrent-download-cancelled", (ev) => {
    const cur = useTorrentStore.getState().progress;
    if (cur && cur.infoHash === ev.payload) {
      setProgress(null);
    }
  });

  listen<TorrentProgressState>("torrent-download-done", () => {
    const state = useTorrentStore.getState();
    if (state.progress) {
      setProgress({ ...state.progress, state: "completed", progressPercent: 100 });
    }
  });
}
