import { useCallback, useEffect, useRef, useState } from "react";
import { useRegisterGlobalBack } from "@hooks/useRegisterGlobalBack";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Spinner, Tab, Tabs } from "@heroui/react";
import { ArrowLeft, Cpu, Gamepad2, LayoutList, ScrollText } from "lucide-react";
import { formatGameDisplayName } from "@utils/gameImage";
import { launchGame, openSaveFolder, removeGame, scheduleConfigBackupToCloud } from "@services/tauri";
import { createShareLink } from "@services/share.service";
import { toastError, toastSuccess } from "@utils/toast";
import { CONFIG_QUERY_KEY } from "@hooks/useConfig";
import { LARGE_GAME_BLOCK_SIZE_BYTES } from "@utils/packageRecommendation";
import { GameDrawer } from "@features/games/GameDrawer";
import { GameTorrentDrawer } from "@features/games/GameTorrentDrawer";
import { FullBackupConfirmModal } from "@features/games/FullBackupConfirmModal";
import { RestoreBackupModal } from "@features/games/RestoreBackupModal";
import { useGameDetail } from "@/hooks/useGameDetail";
import { useGameDetailCloudActions } from "@/hooks/useGameDetailCloudActions";
import { GameDetailHero } from "@features/game-detail/GameDetailHero";
import { GameDetailActionStrip } from "@features/game-detail/GameDetailActionStrip";
import {
  GameDetailLocalSummary,
  GameDetailRequirementsPanel,
  GameDetailSteamDetailsPanel,
  GameDetailSummaryPanel,
  hasSteamRequirements,
} from "@features/game-detail/GameDetailInfo";
import type { ConfiguredGame } from "@app-types/config";

export function GameDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { handleSync, handleDownload, handleFullBackupUpload, isSyncing, isDownloading, fullBackupUploadingGameId } =
    useGameDetailCloudActions();
  const { gameId, game, steamDetails, stats, isGameRunning, mediaUrls, isLoading, hasSyncConfig } = useGameDetail();
  const [activeTab, setActiveTab] = useState("summary");
  const tabsShellRef = useRef<HTMLDivElement>(null);
  const [gameToEdit, setGameToEdit] = useState<ConfiguredGame | null>(null);
  const [gameForTorrent, setGameForTorrent] = useState<ConfiguredGame | null>(null);
  const [gameToFullBackupConfirm, setGameToFullBackupConfirm] = useState<ConfiguredGame | null>(null);
  const [gameToRestoreBackup, setGameToRestoreBackup] = useState<ConfiguredGame | null>(null);

  useRegisterGlobalBack(() => {
    switch (true) {
      case !!gameToEdit:
        setGameToEdit(null);
        return true;
      case !!gameForTorrent:
        setGameForTorrent(null);
        return true;
      case !!gameToFullBackupConfirm:
        setGameToFullBackupConfirm(null);
        return true;
      case !!gameToRestoreBackup:
        setGameToRestoreBackup(null);
        return true;
      default:
        navigate("/");
        return true;
    }
  });

  useEffect(() => {
    setActiveTab("summary");
  }, [gameId]);

  const handleTabsSelectionChange = useCallback((key: React.Key) => {
    setActiveTab(String(key));
    requestAnimationFrame(() => {
      tabsShellRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

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

  const showRequirementsTab = steamDetails ? hasSteamRequirements(steamDetails) : false;
  const isUploadTooLarge = (stats?.localSizeBytes ?? 0) >= LARGE_GAME_BLOCK_SIZE_BYTES;

  return (
    <div className="space-y-5 pb-4">
      <GameDetailHero
        mediaUrls={mediaUrls}
        headerImage={steamDetails?.headerImage}
        customImageUrl={game.imageUrl}
        gameName={displayName}
        editionLabel={game.editionLabel}
        gameId={gameId}
        isLoading={isLoading}
      />

      <GameDetailActionStrip
        game={game}
        stats={stats}
        isGameRunning={isGameRunning}
        isUploadTooLarge={isUploadTooLarge}
        isSyncing={isSyncing}
        isDownloading={isDownloading}
        isFullBackupUploading={fullBackupUploadingGameId === game.id}
        onPlay={handlePlay}
        onOpenFolder={handleOpenFolder}
        onEdit={setGameToEdit}
        onTorrent={setGameForTorrent}
        onSync={hasSyncConfig ? handleSync : undefined}
        onDownload={hasSyncConfig ? handleDownload : undefined}
        onShare={hasSyncConfig ? handleShare : undefined}
        onRemove={handleRemove}
        onRestoreBackup={setGameToRestoreBackup}
        onFullBackupUpload={hasSyncConfig ? setGameToFullBackupConfirm : undefined}
      />

      <GameDrawer
        isOpen={!!gameToEdit}
        onClose={() => setGameToEdit(null)}
        onSuccess={() => {
          scheduleConfigBackupToCloud();
          void queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY });
          setGameToEdit(null);
        }}
        mode="edit"
        game={gameToEdit}
      />
      <GameTorrentDrawer
        isOpen={!!gameForTorrent}
        onClose={() => setGameForTorrent(null)}
        game={gameForTorrent}
        cloudEnabled={hasSyncConfig}
      />
      <FullBackupConfirmModal
        isOpen={!!gameToFullBackupConfirm}
        onClose={() => setGameToFullBackupConfirm(null)}
        game={gameToFullBackupConfirm}
        onConfirm={async () => {
          if (gameToFullBackupConfirm) {
            await handleFullBackupUpload(gameToFullBackupConfirm);
          }
        }}
      />
      <RestoreBackupModal
        isOpen={!!gameToRestoreBackup}
        onClose={() => setGameToRestoreBackup(null)}
        game={gameToRestoreBackup}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ["game-stats"] });
          void queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY });
        }}
      />

      {steamDetails ? (
        <div
          ref={tabsShellRef}
          className="scroll-mt-6 overflow-hidden rounded-2xl border border-default-200/80 bg-content1/95 shadow-md ring-1 ring-black/5 dark:border-default-100/25 dark:bg-default-50/15 dark:ring-white/5">
          <Tabs
            selectedKey={activeTab}
            onSelectionChange={handleTabsSelectionChange}
            variant="solid"
            color="default"
            size="md"
            classNames={{
              base: "w-full",
              tabList:
                "w-full gap-1 rounded-t-2xl border-b border-default-200/70 bg-default-100/90 p-1.5 dark:border-default-100/20 dark:bg-default-100/25",
              tab: "h-11 max-w-none flex-1 data-[selected=true]:bg-content1 data-[selected=true]:shadow-sm",
              cursor: "hidden",
              panel:
                "min-h-[16rem] border-t border-default-200/40 bg-linear-to-b from-default-50/60 to-content1 px-5 py-6 sm:min-h-[18rem] sm:px-7 sm:py-8 dark:border-default-100/15 dark:from-default-50/10 dark:to-default-50/5",
            }}
            aria-label="Secciones del juego">
            <Tab
              key="summary"
              title={
                <span className="flex items-center justify-center gap-2">
                  <LayoutList size={17} className="opacity-90" />
                  <span>Resumen</span>
                </span>
              }>
              <GameDetailSummaryPanel details={steamDetails} />
            </Tab>
            <Tab
              key="details"
              title={
                <span className="flex items-center justify-center gap-2">
                  <ScrollText size={17} className="opacity-90" />
                  <span>Detalles</span>
                </span>
              }>
              <GameDetailSteamDetailsPanel details={steamDetails} />
            </Tab>
            {showRequirementsTab ? (
              <Tab
                key="requirements"
                title={
                  <span className="flex items-center justify-center gap-2">
                    <Cpu size={17} className="opacity-90" />
                    <span>Requisitos</span>
                  </span>
                }>
                <GameDetailRequirementsPanel details={steamDetails} />
              </Tab>
            ) : null}
          </Tabs>
        </div>
      ) : (
        <section className="rounded-xl border border-default-200/60 bg-content1/40 px-4 py-5 dark:border-default-100/20">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-default-500">Resumen</h2>
          <GameDetailLocalSummary game={game} />
        </section>
      )}
    </div>
  );
}
