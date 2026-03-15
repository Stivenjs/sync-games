import { useCallback, useState } from "react";
import { useSyncProgress } from "@contexts/SyncProgressContext";
import { useUnsyncedSaves } from "@hooks/useUnsyncedSaves";
import { UnsyncedSavesModal } from "@features/games/UnsyncedSavesModal";
import { syncUploadGame, createAndUploadFullBackup } from "@services/tauri";
import { toastError, toastSuccess, toastSyncResult } from "@utils/toast";
import { notifyUploadError, notifyFullBackupError } from "@utils/notification";
import { formatGameDisplayName } from "@utils/gameImage";

export function UnsyncedSavesModalWithProgress() {
  const { setSyncOperation } = useSyncProgress();
  const { unsyncedGameIds, showUnsyncedModal, closeModal, uploadAll, isUploading, refetchUnsynced } =
    useUnsyncedSaves();
  const [loadingGameId, setLoadingGameId] = useState<string | null>(null);

  const handleUploadAll = useCallback(async () => {
    setSyncOperation({ type: "upload", mode: "batch", gameId: null });
    try {
      await uploadAll();
    } finally {
      setSyncOperation(null);
    }
  }, [uploadAll, setSyncOperation]);

  const handleUploadGame = useCallback(
    async (gameId: string) => {
      setLoadingGameId(gameId);
      setSyncOperation({ type: "upload", mode: "single", gameId });
      try {
        const result = await syncUploadGame(gameId);
        toastSyncResult(result, formatGameDisplayName(gameId));
        await refetchUnsynced();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toastSyncResult({ okCount: 0, errCount: 1, errors: [msg] }, formatGameDisplayName(gameId));
        notifyUploadError(formatGameDisplayName(gameId), msg).catch(() => {});
      } finally {
        setLoadingGameId(null);
        setSyncOperation(null);
      }
    },
    [refetchUnsynced, setSyncOperation]
  );

  const handleFullBackupGame = useCallback(
    async (gameId: string) => {
      setLoadingGameId(gameId);
      setSyncOperation({ type: "upload", mode: "single", gameId });
      try {
        await createAndUploadFullBackup(gameId);
        toastSuccess("Backup completo subido", `${formatGameDisplayName(gameId)}: empaquetado subido a la nube.`);
        await refetchUnsynced();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toastError("Error al empaquetar y subir", msg);
        notifyFullBackupError(formatGameDisplayName(gameId), msg).catch(() => {});
      } finally {
        setLoadingGameId(null);
        setSyncOperation(null);
      }
    },
    [refetchUnsynced, setSyncOperation]
  );

  return (
    <UnsyncedSavesModal
      isOpen={showUnsyncedModal}
      onClose={closeModal}
      gameIds={unsyncedGameIds}
      onUploadAll={handleUploadAll}
      onUploadGame={handleUploadGame}
      onFullBackupGame={handleFullBackupGame}
      isLoadingAll={isUploading}
      loadingGameId={loadingGameId}
    />
  );
}
