import { useQuery } from "@tanstack/react-query";
import { checkGamesRunning } from "@services/tauri";

const QUERY_KEY = ["game-running"] as const;

/**
 * Comprueba qué juegos están en ejecución.
 * Sirve para mostrar advertencias antes de sincronizar.
 *
 * Optimizado para hacer una sola llamada a Tauri y
 * refrescar la lista de procesos una vez por intervalo.
 */
export function useGameRunningStatus(
  gameIds: readonly string[]
): Record<string, boolean> {
  const sortedIds = [...gameIds].sort();

  const { data } = useQuery({
    queryKey: [...QUERY_KEY, sortedIds],
    queryFn: () => checkGamesRunning(sortedIds),
    enabled: sortedIds.length > 0,
    refetchInterval: 15_000, // cada 15 s
    staleTime: 10_000,
  });

  const map = data ?? {};
  const result: Record<string, boolean> = {};
  gameIds.forEach((id) => {
    result[id] = map[id] === true;
  });
  return result;
}
