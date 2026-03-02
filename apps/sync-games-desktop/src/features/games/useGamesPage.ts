import { useState } from "react";
import {
  removeGame,
  syncDownloadGame,
  syncUploadGame,
  type SyncResult,
} from "@services/tauri";
import type { ConfiguredGame } from "@app-types/config";
import { formatGameDisplayName } from "@utils/gameImage";
import { toastDownloadResult, toastSyncResult } from "@utils/toast";
import { useConfig } from "@hooks/useConfig";
import { useLastSyncInfo } from "@hooks/useLastSyncInfo";
import { filterGames, type OriginFilter } from "@features/games/GamesFilters";

export interface OperationResult {
  type: "sync" | "download";
  gameId: string;
  result: SyncResult;
}

export function useGamesPage() {
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
    refetch: refetchLastSync,
  } = useLastSyncInfo(hasSyncConfig);

  const handleRefresh = () => {
    refetch?.();
    refetchLastSync?.();
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
    }
  };

  const handleDownloadOne = async (game: ConfiguredGame) => {
    setDownloading(game.id);
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
    }
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
  };

  const handleDownloadAll = async () => {
    if (!config?.games?.length) return;
    setDownloading("all");
    setOperationResult(null);
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
    filteredGames,
    emptyFilterMessage,
  };
}
