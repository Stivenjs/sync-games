import { useState } from "react";
import {
  removeGame,
  syncCheckDownloadConflicts,
  syncDownloadGame,
  syncUploadGame,
  type SyncResult,
} from "@services/tauri";
import type { ConfiguredGame } from "@app-types/config";
import { formatGameDisplayName } from "@utils/gameImage";
import { toastDownloadResult, toastSyncResult } from "@utils/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useConfig } from "@hooks/useConfig";
import { useLastSyncInfo } from "@hooks/useLastSyncInfo";
import { filterGames, type OriginFilter } from "@features/games/GamesFilters";

export interface OperationResult {
  type: "sync" | "download";
  gameId: string;
  result: SyncResult;
}

export function useGamesPage() {
  const queryClient = useQueryClient();
  const { config, loading, error, refetch } = useConfig();
  const hasSyncConfig = !!(
    config?.apiBaseUrl?.trim() && config?.userId?.trim()
  );
  const {
    lastSyncAt,
    lastSyncGameId,
    cloudGames,
    totalCloudSize,
    isLoading: lastSyncLoading,
    connectionStatus,
    connectionError,
    refetch: refetchLastSync,
  } = useLastSyncInfo(hasSyncConfig);

  const handleRefresh = () => {
    refetch?.();
    refetchLastSync?.();
    queryClient.invalidateQueries({ queryKey: ["game-stats"] });
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [addModalInitial, setAddModalInitial] = useState({
    path: "",
    suggestedId: "",
  });
  const [gameToRemove, setGameToRemove] = useState<ConfiguredGame | null>(null);
  const [downloadConflictGame, setDownloadConflictGame] =
    useState<ConfiguredGame | null>(null);
  const [downloadConflicts, setDownloadConflicts] = useState<
    { filename: string; localModified: string; cloudModified: string }[]
  >([]);
  const [downloadAllConflictGames, setDownloadAllConflictGames] = useState<
    { gameId: string; conflictCount: number }[]
  >([]);
  const [syncing, setSyncing] = useState<string | "all" | null>(null);
  const [downloading, setDownloading] = useState<string | "all" | null>(null);
  const [operationResult, setOperationResult] =
    useState<OperationResult | null>(null);

  const handleScanSelect = (path: string, suggestedId: string) => {
    setAddModalInitial({ path, suggestedId });
    setAddModalOpen(true);
  };

  const handleRemoveGame = (game: ConfiguredGame) => {
    setGameToRemove(game);
  };

  const handleConfirmRemove = async (gameId: string) => {
    try {
      await removeGame(gameId);
      refetch?.();
      setGameToRemove(null);
    } catch (e) {
      console.error("Error al eliminar juego:", e);
      throw e;
    }
  };

  const handleSyncOne = async (game: ConfiguredGame) => {
    setSyncing(game.id);
    setOperationResult(null);
    try {
      const result = await syncUploadGame(game.id);
      setOperationResult({ type: "sync", gameId: game.id, result });
      toastSyncResult(result, formatGameDisplayName(game.id));
    } catch (e) {
      const errResult = {
        okCount: 0,
        errCount: 1,
        errors: [e instanceof Error ? e.message : String(e)],
      };
      setOperationResult({ type: "sync", gameId: game.id, result: errResult });
      toastSyncResult(errResult, formatGameDisplayName(game.id));
    } finally {
      setSyncing(null);
      refetchLastSync?.();
      queryClient.invalidateQueries({ queryKey: ["game-stats"] });
    }
  };

  const executeDownload = async (game: ConfiguredGame) => {
    setOperationResult(null);
    try {
      const result = await syncDownloadGame(game.id);
      setOperationResult({ type: "download", gameId: game.id, result });
      toastDownloadResult(result, formatGameDisplayName(game.id));
    } catch (e) {
      const errResult = {
        okCount: 0,
        errCount: 1,
        errors: [e instanceof Error ? e.message : String(e)],
      };
      setOperationResult({
        type: "download",
        gameId: game.id,
        result: errResult,
      });
      toastDownloadResult(errResult, formatGameDisplayName(game.id));
    } finally {
      setDownloading(null);
      refetchLastSync?.();
      queryClient.invalidateQueries({ queryKey: ["game-stats"] });
    }
  };

  const handleDownloadOne = async (game: ConfiguredGame) => {
    setDownloading(game.id);
    try {
      const { conflicts } = await syncCheckDownloadConflicts(game.id);
      if (conflicts.length > 0) {
        setDownloadConflictGame(game);
        setDownloadConflicts(conflicts);
        setDownloading(null);
        return;
      }
      await executeDownload(game);
    } catch (e) {
      const errResult = {
        okCount: 0,
        errCount: 1,
        errors: [e instanceof Error ? e.message : String(e)],
      };
      setOperationResult({
        type: "download",
        gameId: game.id,
        result: errResult,
      });
      toastDownloadResult(errResult, formatGameDisplayName(game.id));
      setDownloading(null);
    } finally {
      refetchLastSync?.();
      queryClient.invalidateQueries({ queryKey: ["game-stats"] });
    }
  };

  const handleConfirmDownloadConflict = async () => {
    if (!downloadConflictGame) return;
    const game = downloadConflictGame;
    setDownloading(game.id);
    try {
      await executeDownload(game);
      setDownloadConflictGame(null);
      setDownloadConflicts([]);
    } finally {
      refetchLastSync?.();
      queryClient.invalidateQueries({ queryKey: ["game-stats"] });
    }
  };

  const handleCloseDownloadConflict = () => {
    setDownloadConflictGame(null);
    setDownloadConflicts([]);
  };

  const handleSyncAll = async () => {
    if (!config?.games?.length) return;
    setSyncing("all");
    setOperationResult(null);
    const results: { gameId: string; result: SyncResult }[] = [];
    for (const game of config.games) {
      try {
        const result = await syncUploadGame(game.id);
        results.push({ gameId: game.id, result });
      } catch (e) {
        results.push({
          gameId: game.id,
          result: {
            okCount: 0,
            errCount: 1,
            errors: [e instanceof Error ? e.message : String(e)],
          },
        });
      }
    }
    const totalResult = {
      okCount: results.reduce((s, r) => s + r.result.okCount, 0),
      errCount: results.reduce((s, r) => s + r.result.errCount, 0),
      errors: results.flatMap((r) => r.result.errors),
    };
    setOperationResult({ type: "sync", gameId: "", result: totalResult });
    toastSyncResult(totalResult);
    setSyncing(null);
    refetchLastSync?.();
    queryClient.invalidateQueries({ queryKey: ["game-stats"] });
  };

  const executeDownloadAll = async () => {
    if (!config?.games?.length) return;
    const results: { gameId: string; result: SyncResult }[] = [];
    for (const game of config.games) {
      try {
        const result = await syncDownloadGame(game.id);
        results.push({ gameId: game.id, result });
      } catch (e) {
        results.push({
          gameId: game.id,
          result: {
            okCount: 0,
            errCount: 1,
            errors: [e instanceof Error ? e.message : String(e)],
          },
        });
      }
    }
    const totalResult = {
      okCount: results.reduce((s, r) => s + r.result.okCount, 0),
      errCount: results.reduce((s, r) => s + r.result.errCount, 0),
      errors: results.flatMap((r) => r.result.errors),
    };
    setOperationResult({ type: "download", gameId: "", result: totalResult });
    toastDownloadResult(totalResult);
    setDownloading(null);
    refetchLastSync?.();
    queryClient.invalidateQueries({ queryKey: ["game-stats"] });
  };

  const handleDownloadAll = async () => {
    if (!config?.games?.length) return;
    setDownloading("all");
    setOperationResult(null);
    try {
      const gamesWithConflicts: { gameId: string; conflictCount: number }[] = [];
      for (const game of config.games) {
        try {
          const { conflicts } = await syncCheckDownloadConflicts(game.id);
          if (conflicts.length > 0) {
            gamesWithConflicts.push({
              gameId: game.id,
              conflictCount: conflicts.length,
            });
          }
        } catch {
          // Si falla el check, continuar con el siguiente
        }
      }
      if (gamesWithConflicts.length > 0) {
        setDownloadAllConflictGames(gamesWithConflicts);
        setDownloading(null);
        return;
      }
      await executeDownloadAll();
    } catch (e) {
      const errResult = {
        okCount: 0,
        errCount: 1,
        errors: [e instanceof Error ? e.message : String(e)],
      };
      setOperationResult({ type: "download", gameId: "", result: errResult });
      toastDownloadResult(errResult);
      setDownloading(null);
    } finally {
      refetchLastSync?.();
      queryClient.invalidateQueries({ queryKey: ["game-stats"] });
    }
  };

  const handleConfirmDownloadAllConflict = async () => {
    setDownloading("all");
    try {
      await executeDownloadAll();
      setDownloadAllConflictGames([]);
    } finally {
      refetchLastSync?.();
    }
  };

  const handleCloseDownloadAllConflict = () => {
    setDownloadAllConflictGames([]);
  };

  const filteredGames = filterGames(
    config?.games ?? [],
    searchTerm,
    originFilter
  );
  const emptyFilterMessage =
    (config?.games?.length ?? 0) > 0 &&
    (searchTerm !== "" || originFilter !== "all")
      ? "No se encontraron juegos con los filtros aplicados."
      : undefined;

  return {
    config,
    loading,
    error,
    refetch,
    hasSyncConfig,
    lastSyncAt,
    lastSyncGameId,
    cloudGames,
    totalCloudSize,
    lastSyncLoading,
    connectionStatus,
    connectionError,
    searchTerm,
    setSearchTerm,
    originFilter,
    setOriginFilter,
    addModalOpen,
    setAddModalOpen,
    scanModalOpen,
    setScanModalOpen,
    addModalInitial,
    setAddModalInitial,
    gameToRemove,
    setGameToRemove,
    downloadConflictGame,
    downloadConflicts,
    handleConfirmDownloadConflict,
    handleCloseDownloadConflict,
    downloadAllConflictGames,
    handleConfirmDownloadAllConflict,
    handleCloseDownloadAllConflict,
    syncing,
    downloading,
    operationResult,
    handleScanSelect,
    handleRemoveGame,
    handleConfirmRemove,
    handleSyncOne,
    handleDownloadOne,
    handleSyncAll,
    handleDownloadAll,
    handleRefresh,
    refetchLastSync,
    filteredGames,
    emptyFilterMessage,
  };
}
