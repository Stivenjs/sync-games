import { Loader2, RefreshCw } from "lucide-react";
import { useConfig } from "@hooks/useConfig";
import { GamesList } from "@features/games/GamesList";

export function GamesPage() {
  const { config, loading, error, refetch } = useConfig();

  if (loading) {
    return (
      <div className="page page--center">
        <Loader2 className="page__spinner" size={32} strokeWidth={2} />
        <p className="page__muted">Cargando configuración...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page page--center">
        <p className="page__error">{error}</p>
        <button type="button" className="btn" onClick={() => refetch?.()}>
          <RefreshCw size={16} />
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Juegos configurados</h1>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => refetch?.()}
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </header>
      <GamesList games={config?.games ?? []} />
    </div>
  );
}
