import { Button, Spinner } from "@heroui/react";
import { RefreshCw } from "lucide-react";
import { useConfig } from "@hooks/useConfig";
import { GamesList } from "@features/games/GamesList";

export function GamesPage() {
  const { config, loading, error, refetch } = useConfig();

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
    <div className="max-w-3xl">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">
          Juegos configurados
        </h1>
        <Button
          variant="flat"
          startContent={<RefreshCw size={18} />}
          onPress={() => refetch?.()}
        >
          Actualizar
        </Button>
      </header>
      <GamesList games={config?.games ?? []} />
    </div>
  );
}
