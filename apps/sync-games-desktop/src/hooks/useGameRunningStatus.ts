import { useQueries } from "@tanstack/react-query";
import { checkGameRunning } from "@services/tauri";

const QUERY_KEY = ["game-running"] as const;

/**
 * Comprueba qué juegos están en ejecución.
 * Sirve para mostrar advertencias antes de sincronizar.
 */
export function useGameRunningStatus(
  gameIds: readonly string[]
): Record<string, boolean> {
  const queries = useQueries({
    queries: gameIds.map((id) => ({
      queryKey: [...QUERY_KEY, id],
      queryFn: () => checkGameRunning(id),
      refetchInterval: 15_000, // cada 15 s
      staleTime: 10_000,
    })),
  });

  const result: Record<string, boolean> = {};
  gameIds.forEach((id, i) => {
    const { data } = queries[i] ?? {};
    result[id] = data === true;
  });
  return result;
}
