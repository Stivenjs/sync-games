import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Spinner } from "@heroui/react";
import { ArrowLeft, Gamepad2 } from "lucide-react";
import { formatGameDisplayName } from "@utils/gameImage";
import { launchGame, openSaveFolder, removeGame, syncDownloadGame, syncUploadGame } from "@services/tauri";
import { createShareLink } from "@services/share.service";
import { toastError, toastSuccess } from "@utils/toast";
import { useGameDetail } from "@features/game-detail/useGameDetail";
import { GameDetailHero } from "@features/game-detail/GameDetailHero";
import { GameDetailStats } from "@features/game-detail/GameDetailStats";
import { GameDetailActions } from "@features/game-detail/GameDetailActions";
import { GameDetailInfo } from "@features/game-detail/GameDetailInfo";
import type { ConfiguredGame } from "@app-types/config";

export function GameDetailPage() {
  const navigate = useNavigate();
  const { gameId, game, steamDetails, stats, isGameRunning, mediaUrls, isLoading, hasSyncConfig } = useGameDetail();

  const displayName = steamDetails?.name || formatGameDisplayName(gameId);

  const handleBack = useCallback(() => navigate("/"), [navigate]);

  const handleOpenFolder = useCallback(async (g: ConfiguredGame) => {
    try {
      await openSaveFolder(g.id);
    } catch (e) {
      toastError("Error al abrir carpeta", e instanceof Error ? e.message : "Error inesperado");
    }
  }, []);

  const handlePlay = useCallback(async (g: ConfiguredGame) => {
    try {
      await launchGame(g.id);
    } catch (e) {
      toastError("No se pudo abrir el juego", e instanceof Error ? e.message : "Error inesperado");
    }
  }, []);

  const handleSync = useCallback(async (g: ConfiguredGame) => {
    try {
      await syncUploadGame(g.id);
      toastSuccess("Subido", `${formatGameDisplayName(g.id)} sincronizado con la nube.`);
    } catch (e) {
      toastError("Error al sincronizar", e instanceof Error ? e.message : "Error inesperado");
    }
  }, []);

  const handleDownload = useCallback(async (g: ConfiguredGame) => {
    try {
      await syncDownloadGame(g.id);
      toastSuccess("Descargado", `${formatGameDisplayName(g.id)} restaurado desde la nube.`);
    } catch (e) {
      toastError("Error al descargar", e instanceof Error ? e.message : "Error inesperado");
    }
  }, []);

  const handleShare = useCallback(async (g: ConfiguredGame) => {
    try {
      const { shareUrl } = await createShareLink(g.id);
      await navigator.clipboard.writeText(shareUrl);
      toastSuccess("Link copiado", "Válido por 7 días.");
    } catch (e) {
      toastError("No se pudo crear el link", e instanceof Error ? e.message : "Error inesperado");
    }
  }, []);

  const handleRemove = useCallback(
    async (g: ConfiguredGame) => {
      try {
        await removeGame(g.id);
        toastSuccess("Eliminado", `${formatGameDisplayName(g.id)} eliminado.`);
        navigate("/");
      } catch (e) {
        toastError("Error al eliminar", e instanceof Error ? e.message : "Error inesperado");
      }
    },
    [navigate]
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <Spinner size="lg" color="primary" />
        <p className="text-default-500">Cargando detalles del juego...</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <Gamepad2 size={56} className="text-default-400" strokeWidth={1.2} />
        <p className="text-lg font-medium text-default-600">Juego no encontrado</p>
        <p className="text-sm text-default-400">
          El juego <span className="font-mono text-default-500">{gameId}</span> no está configurado.
        </p>
        <Button color="primary" variant="bordered" startContent={<ArrowLeft size={18} />} onPress={handleBack}>
          Volver a juegos
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero banner (full-bleed, botón volver aparece en hover) */}
      <GameDetailHero mediaUrls={mediaUrls} gameName={displayName} gameId={gameId} isLoading={isLoading} />

      {/* Título y acciones */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">{displayName}</h1>
          {game.editionLabel && <p className="text-sm text-default-400">{game.editionLabel}</p>}
        </div>

        <GameDetailActions
          game={game}
          isGameRunning={isGameRunning}
          hasSyncConfig={hasSyncConfig}
          onPlay={handlePlay}
          onOpenFolder={handleOpenFolder}
          onSync={hasSyncConfig ? handleSync : undefined}
          onDownload={hasSyncConfig ? handleDownload : undefined}
          onShare={hasSyncConfig ? handleShare : undefined}
          onRemove={handleRemove}
        />
      </div>

      {/* Stats */}
      <GameDetailStats stats={stats} isGameRunning={isGameRunning} />

      {/* Información del juego (Steam) */}
      <GameDetailInfo details={steamDetails} isLoading={!!game && isLoading} />
    </div>
  );
}
