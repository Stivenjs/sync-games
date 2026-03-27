import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "react-router-dom";
import {
  getConfig,
  getSteamAppDetails,
  getGameStats,
  checkGameRunning,
  type SteamAppDetailsResult,
  type GameStats,
} from "@services/tauri";
import { getSteamAppId } from "@utils/gameImage";
import type { ConfiguredGame } from "@app-types/config";

interface LocationState {
  resolvedSteamAppId?: string | null;
}

export function useGameDetail() {
  const { gameId } = useParams<{ gameId: string }>();
  const location = useLocation();
  const navState = location.state as LocationState | undefined;

  const { data: config, isLoading: isConfigLoading } = useQuery({
    queryKey: ["config"],
    queryFn: getConfig,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const game: ConfiguredGame | undefined = useMemo(() => config?.games.find((g) => g.id === gameId), [config, gameId]);

  const steamAppId = useMemo(
    () => (game ? getSteamAppId(game, navState?.resolvedSteamAppId) : null),
    [game, navState?.resolvedSteamAppId]
  );

  const { data: steamDetails, isLoading: isSteamLoading } = useQuery<SteamAppDetailsResult>({
    queryKey: ["steam-app-details", steamAppId],
    queryFn: () => getSteamAppDetails(steamAppId!),
    enabled: !!steamAppId,
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: allStats } = useQuery<GameStats[]>({
    queryKey: ["game-stats"],
    queryFn: getGameStats,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const stats = useMemo(() => allStats?.find((s) => s.gameId === gameId) ?? null, [allStats, gameId]);

  const { data: isGameRunning = false } = useQuery({
    queryKey: ["game-running", gameId],
    queryFn: () => checkGameRunning(gameId!),
    enabled: !!gameId,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
  });

  // La primera URL es el header/capsule (muy pequeña), se omite del carrusel
  const mediaUrls = useMemo(() => {
    if (!steamDetails?.media.mediaUrls?.length) return [];
    return steamDetails.media.mediaUrls.slice(1);
  }, [steamDetails]);

  const isLoading = isConfigLoading || (!!steamAppId && isSteamLoading);

  return {
    gameId: gameId ?? "",
    game: game ?? null,
    steamAppId,
    steamDetails: steamDetails ?? null,
    stats,
    isGameRunning,
    mediaUrls,
    videoUrl: steamDetails?.media.videoUrl ?? null,
    isLoading,
    hasSyncConfig: !!(config?.apiBaseUrl && config?.apiKey && config?.userId),
  };
}
