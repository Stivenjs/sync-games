import { useQuery } from "@tanstack/react-query";
import { syncListRemoteSaves } from "@services/tauri";

const LAST_SYNC_QUERY_KEY = ["last-sync-info"] as const;

export interface LastSyncInfo {
  lastSyncAt: Date | null;
  lastSyncGameId: string | null;
}

export interface CloudGameSummary {
  gameId: string;
  fileCount: number;
  totalSize: number;
}

function computeLastSync(
  saves: { gameId: string; lastModified: string }[]
): LastSyncInfo {
  if (saves.length === 0) {
    return { lastSyncAt: null, lastSyncGameId: null };
  }
  let latest: { gameId: string; date: Date } | null = null;
  for (const s of saves) {
    const date = new Date(s.lastModified);
    if (!latest || date > latest.date) {
      latest = { gameId: s.gameId, date };
    }
  }
  return latest
    ? { lastSyncAt: latest.date, lastSyncGameId: latest.gameId }
    : { lastSyncAt: null, lastSyncGameId: null };
}

function computeCloudGames(saves: { gameId: string; size?: number }[]): {
  cloudGames: CloudGameSummary[];
  totalSize: number;
} {
  const byGame = new Map<string, { count: number; size: number }>();
  for (const s of saves) {
    const existing = byGame.get(s.gameId) ?? { count: 0, size: 0 };
    byGame.set(s.gameId, {
      count: existing.count + 1,
      size: existing.size + (s.size ?? 0),
    });
  }
  const cloudGames: CloudGameSummary[] = [...byGame.entries()].map(
    ([gameId, { count, size }]) => ({
      gameId,
      fileCount: count,
      totalSize: size,
    })
  );
  const totalSize = cloudGames.reduce((sum, g) => sum + g.totalSize, 0);
  return { cloudGames, totalSize };
}

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error"
  | "retrying";

/**
 * Hook que obtiene la última sincronización y los juegos en la nube.
 * Usa la lista de guardados para calcular:
 * - última sync (juego + fecha)
 * - resumen por juego (archivos, tamaño) y total en la nube
 * - estado de conexión con la API
 */
export function useLastSyncInfo(enabled: boolean) {
  const query = useQuery({
    queryKey: LAST_SYNC_QUERY_KEY,
    queryFn: async () => {
      const saves = await syncListRemoteSaves();
      const lastSync = computeLastSync(saves);
      const { cloudGames, totalSize } = computeCloudGames(saves);
      return { ...lastSync, cloudGames, totalCloudSize: totalSize };
    },
    enabled,
    refetchInterval: (query) =>
      query.state.status === "error" ? 30_000 : false,
  });

  const connectionStatus: ConnectionStatus = !enabled
    ? "idle"
    : query.isError && query.isFetching
      ? "retrying"
      : query.isError
        ? "error"
        : query.isLoading
          ? "connecting"
          : "connected";

  return {
    lastSyncAt: query.data?.lastSyncAt ?? null,
    lastSyncGameId: query.data?.lastSyncGameId ?? null,
    cloudGames: query.data?.cloudGames ?? [],
    totalCloudSize: query.data?.totalCloudSize ?? 0,
    isLoading: query.isLoading,
    connectionStatus,
    connectionError: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}
