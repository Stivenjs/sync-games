import { useQueries } from "@tanstack/react-query";
import { listFullBackups } from "@services/tauri";

const CLOUD_BACKUP_COUNTS_QUERY_KEY = ["cloud-backup-counts"] as const;

/**
 * Obtiene el número de backups completos (empaquetados) en la nube por juego.
 * Usa una petición por gameId; útil para mostrar en la lista qué juegos tienen backups empaquetados.
 */
export function useCloudBackupCounts(gameIds: string[], enabled: boolean) {
  const results = useQueries({
    queries: gameIds.map((gameId) => ({
      queryKey: [...CLOUD_BACKUP_COUNTS_QUERY_KEY, gameId],
      queryFn: () => listFullBackups(gameId),
      enabled: enabled && !!gameId,
    })),
  });

  const countByGameId: Record<string, number> = {};
  results.forEach((result, index) => {
    const gameId = gameIds[index];
    if (gameId && result.data) {
      countByGameId[gameId] = result.data.length;
    }
  });

  const isLoading = results.some((r) => r.isLoading);

  return {
    countByGameId,
    isLoading,
  };
}
