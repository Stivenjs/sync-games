import { useState } from "react";
import { Button, Spinner } from "@heroui/react";
import { FolderSearch, PlusCircle, RefreshCw } from "lucide-react";
import { useConfig } from "@hooks/useConfig";
import { removeGame } from "@services/tauri";
import type { ConfiguredGame } from "@app-types/config";
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
        emptyFilterMessage={
          (config?.games?.length ?? 0) > 0 &&
          (searchTerm !== "" || originFilter !== "all")
            ? "No se encontraron juegos con los filtros aplicados."
            : undefined
        }
      />
    </div>
  );
}
