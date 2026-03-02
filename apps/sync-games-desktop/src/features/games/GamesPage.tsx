import { Button, Spinner } from "@heroui/react";
import { RefreshCw } from "lucide-react";
import { AddGameModal } from "@features/games/AddGameModal";
import { GamesFilters } from "@features/games/GamesFilters";
import { GamesList } from "@features/games/GamesList";
import { GamesPageHeader } from "@features/games/GamesPageHeader";
import { GamesStats } from "@features/games/GamesStats";
import { OperationErrorCard } from "@features/games/OperationErrorCard";
import { RemoveGameModal } from "@features/games/RemoveGameModal";
import { ScanModal } from "@features/games/ScanModal";
import { useGamesPage } from "@features/games/useGamesPage";

export function GamesPage() {
  const {
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
  } = useGamesPage();

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
      <GamesPageHeader
        hasSyncConfig={hasSyncConfig}
        gamesCount={config?.games?.length ?? 0}
        syncing={syncing}
        downloading={downloading}
        onScanPress={() => setScanModalOpen(true)}
        onAddPress={() => {
          setAddModalInitial({ path: "", suggestedId: "" });
          setAddModalOpen(true);
        }}
        onDownloadAllPress={handleDownloadAll}
        onSyncAllPress={handleSyncAll}
        onRefreshPress={handleRefresh}
      />

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
        <GamesStats
          gamesCount={config?.games?.length ?? 0}
          lastSyncAt={lastSyncAt}
          lastSyncGameId={lastSyncGameId}
          lastSyncLoading={hasSyncConfig && lastSyncLoading}
          hasSyncConfig={hasSyncConfig}
          cloudGames={cloudGames}
          totalCloudSize={totalCloudSize}
        />
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
        games={filteredGames}
        onRemove={handleRemoveGame}
        onSync={hasSyncConfig ? handleSyncOne : undefined}
        syncingId={syncing}
        onDownload={hasSyncConfig ? handleDownloadOne : undefined}
        downloadingId={downloading}
        emptyFilterMessage={emptyFilterMessage}
      />

      {operationResult && operationResult.result.errors.length > 0 && (
        <OperationErrorCard operationResult={operationResult} />
      )}
    </div>
  );
}
