import { useQuery } from "@tanstack/react-query";
import { getGameStats } from "@services/tauri";

const GAME_STATS_QUERY_KEY = ["game-stats"] as const;

export function useGameStats(enabled: boolean) {
  const query = useQuery({
    queryKey: GAME_STATS_QUERY_KEY,
    queryFn: getGameStats,
    enabled,
  });

  const statsByGameId = new Map(
    (query.data ?? []).map((s) => [s.gameId, s])
  );

  return {
    statsByGameId,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
