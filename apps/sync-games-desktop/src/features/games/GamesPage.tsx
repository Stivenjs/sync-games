import { useState } from "react";
import { Button, Card, CardBody, Spinner } from "@heroui/react";
import { CloudUpload, FolderSearch, PlusCircle, RefreshCw } from "lucide-react";
import { useConfig } from "@hooks/useConfig";
import { removeGame, syncUploadGame, type SyncResult } from "@services/tauri";
import type { ConfiguredGame } from "@app-types/config";
import { formatGameDisplayName } from "@utils/gameImage";
import {
  GamesFilters,
  filterGames,
  type OriginFilter,
} from "@features/games/GamesFilters";
import { GamesList } from "@features/games/GamesList";
import { GamesStats } from "@features/games/GamesStats";
import { AddGameModal } from "@features/games/AddGameModal";
import { RemoveGameModal } from "@features/games/RemoveGameModal";
import { ScanModal } from "@features/games/ScanModal";

export function GamesPage() {
  const { config, loading, error, refetch } = useConfig();
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
  const [syncResult, setSyncResult] = useState<{
    gameId: string;
    result: SyncResult;
  } | null>(null);

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
    setSyncResult(null);
    try {
      const result = await syncUploadGame(game.id);
      setSyncResult({ gameId: game.id, result });
    } catch (e) {
      setSyncResult({
        gameId: game.id,
        result: {
          okCount: 0,
          errCount: 1,
          errors: [e instanceof Error ? e.message : String(e)],
        },
      });
    } finally {
      setSyncing(null);
    }
  };

  const handleSyncAll = async () => {
    if (!config?.games?.length) return;
    setSyncing("all");
    setSyncResult(null);
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
    setSyncResult({
      gameId: "",
      result: {
        okCount: results.reduce((s, r) => s + r.result.okCount, 0),
        errCount: results.reduce((s, r) => s + r.result.errCount, 0),
        errors: results.flatMap((r) => r.result.errors),
      },
    });
    setSyncing(null);
  };

  const hasSyncConfig = config?.apiBaseUrl?.trim() && config?.userId?.trim();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
        <Spinner size="lg" color="primary" />
        <p className="text-default-500">Cargando configuración...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
        <p className="text-danger">{error}</p>
        <Button
          color="primary"
          startContent={<RefreshCw size={18} />}
          onPress={() => refetch?.()}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold text-foreground">
          Juegos configurados
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="bordered"
            startContent={<FolderSearch size={18} />}
            onPress={() => setScanModalOpen(true)}
          >
            Analizar rutas
          </Button>
          <Button
            variant="flat"
            color="primary"
            startContent={<PlusCircle size={18} />}
            onPress={() => {
              setAddModalInitial({ path: "", suggestedId: "" });
              setAddModalOpen(true);
            }}
          >
            Añadir juego
          </Button>
          {hasSyncConfig && (
            <Button
              variant="solid"
              color="secondary"
              startContent={
                syncing === "all" ? (
                  <Spinner size="sm" color="current" />
                ) : (
                  <CloudUpload size={18} />
                )
              }
              onPress={handleSyncAll}
              isDisabled={!config?.games?.length || !!syncing}
            >
              Subir todos
            </Button>
          )}
          <Button
            variant="solid"
            startContent={<RefreshCw size={18} />}
            onPress={() => refetch?.()}
          >
            Actualizar
          </Button>
        </div>
      </header>
      <AddGameModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => refetch?.()}
        initialPath={addModalInitial.path}
        suggestedId={addModalInitial.suggestedId}
      />
      <ScanModal
        isOpen={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onSelectCandidate={handleScanSelect}
      />
      <RemoveGameModal
        isOpen={!!gameToRemove}
        onClose={() => setGameToRemove(null)}
        game={gameToRemove}
        onConfirm={handleConfirmRemove}
      />
      <div className="mb-8">
        <GamesStats gamesCount={config?.games?.length ?? 0} lastSyncAt={null} />
      </div>
      <div className="mb-6">
        <GamesFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          originFilter={originFilter}
          onOriginFilterChange={setOriginFilter}
        />
      </div>
      <GamesList
        games={filterGames(config?.games ?? [], searchTerm, originFilter)}
        onRemove={handleRemoveGame}
        onSync={hasSyncConfig ? handleSyncOne : undefined}
        syncingId={syncing}
        emptyFilterMessage={
          (config?.games?.length ?? 0) > 0 &&
          (searchTerm !== "" || originFilter !== "all")
            ? "No se encontraron juegos con los filtros aplicados."
            : undefined
        }
      />

      {syncResult && (
        <Card className="mt-6 border border-default-200">
          <CardBody>
            <h3 className="mb-3 font-medium text-foreground">
              {syncResult.gameId
                ? `Sincronización: ${formatGameDisplayName(syncResult.gameId)}`
                : "Sincronización completada"}
            </h3>
            <p className="text-sm">
              {syncResult.result.okCount} archivo(s) subido(s)
              {syncResult.result.errCount > 0 && (
                <span className="text-danger">
                  , {syncResult.result.errCount} error(es)
                </span>
              )}
            </p>
            {syncResult.result.errors.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-sm text-default-500">
                {syncResult.result.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {syncResult.result.errors.length > 5 && (
                  <li>… y {syncResult.result.errors.length - 5} más</li>
                )}
              </ul>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
