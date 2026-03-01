import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { ConfiguredGame } from "@app-types/config";
import { needsSteamSearch, idToSearchQuery } from "@utils/gameImage";
import { searchSteamAppId } from "@services/tauri";

const STEAM_APP_ID_QUERY_KEY = ["steam-app-id"] as const;

/**
 * Hook que resuelve Steam App IDs para juegos que no tienen imagen (needsSteamSearch).
 * Usa búsqueda dinámica en Steam por nombre del juego.
 * TanStack Query cachea los resultados automáticamente.
 */
export function useResolvedSteamAppIds(
  games: readonly ConfiguredGame[]
): Record<string, string | null | undefined> {
  const gamesToSearch = useMemo(
    () => games.filter((g) => needsSteamSearch(g)),
    [games]
  );

  const queries = useQueries({
    queries: gamesToSearch.map((game) => ({
      queryKey: [...STEAM_APP_ID_QUERY_KEY, game.id],
      queryFn: async () => {
        const query = idToSearchQuery(game.id);
        const appId = await searchSteamAppId(query);
        return appId ?? null;
      },
    })),
  });

  return useMemo(() => {
    const result: Record<string, string | null | undefined> = {};
    gamesToSearch.forEach((game, i) => {
      const { data, isFetched } = queries[i] ?? {};
      result[game.id] = isFetched ? (data ?? null) : undefined;
    });
    return result;
  }, [gamesToSearch, queries]);
}
