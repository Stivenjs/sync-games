import { useQuery } from "@tanstack/react-query";
import { syncListRemoteSaves } from "@services/tauri";

const LAST_SYNC_QUERY_KEY = ["last-sync-info"] as const;

export interface LastSyncInfo {
  lastSyncAt: Date | null;
  lastSyncGameId: string | null;
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

/**
 * Hook que obtiene la última sincronización desde la API.
 * Usa la lista de guardados (cada uno tiene lastModified) para calcular
 * el juego y la fecha de la sync más reciente.
 */
export function useLastSyncInfo(enabled: boolean) {
  const query = useQuery({
    queryKey: LAST_SYNC_QUERY_KEY,
    queryFn: async () => {
      const saves = await syncListRemoteSaves();
      return computeLastSync(saves);
    },
    enabled,
  });
  return {
    lastSyncAt: query.data?.lastSyncAt ?? null,
    lastSyncGameId: query.data?.lastSyncGameId ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
