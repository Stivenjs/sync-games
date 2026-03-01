import { useState } from "react";
import { Button, Spinner } from "@heroui/react";
import { RefreshCw } from "lucide-react";
import { useConfig } from "@hooks/useConfig";
import {
  GamesFilters,
  filterGames,
  type OriginFilter,
} from "@features/games/GamesFilters";
import { GamesList } from "@features/games/GamesList";
import { GamesStats } from "@features/games/GamesStats";

export function GamesPage() {
  const { config, loading, error, refetch } = useConfig();
  const [searchTerm, setSearchTerm] = useState("");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");

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
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">
          Juegos configurados
        </h1>
        <Button
          variant="solid"
          startContent={<RefreshCw size={18} />}
          onPress={() => refetch?.()}
        >
          Actualizar
        </Button>
      </header>
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
