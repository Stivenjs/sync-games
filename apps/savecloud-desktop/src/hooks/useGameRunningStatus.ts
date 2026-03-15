import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { checkGamesRunning } from "@services/tauri";

const QUERY_KEY = ["game-running"] as const;

/**
 * Comprueba qué juegos están en ejecución.
 * Sirve para mostrar advertencias antes de sincronizar.
 *
 * Optimizado: Hace una sola petición inicial para cargar rápido,
 * y luego se actualiza en tiempo real mediante eventos de Tauri (sin polling).
 */
export function useGameRunningStatus(gameIds: readonly string[]): Record<string, boolean> {
  const queryClient = useQueryClient();
  const sortedIds = [...gameIds].sort();

  const { data } = useQuery({
    queryKey: [...QUERY_KEY, sortedIds],
    queryFn: () => checkGamesRunning(sortedIds),
    enabled: sortedIds.length > 0,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (sortedIds.length === 0) return;

    const unlistenPromise = listen<Record<string, boolean>>("games-running-status", (event) => {
      const globalState = event.payload;

      queryClient.setQueryData([...QUERY_KEY, sortedIds], (oldData: Record<string, boolean> | undefined) => {
        if (!oldData) return globalState;

        const updated = { ...oldData };
        let hasChanges = false;

        sortedIds.forEach((id) => {
          if (globalState[id] !== undefined && globalState[id] !== oldData[id]) {
            updated[id] = globalState[id];
            hasChanges = true;
          }
        });

        return hasChanges ? updated : oldData;
      });
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [queryClient, sortedIds.join(",")]);

  const map = data ?? {};
  const result: Record<string, boolean> = {};
  gameIds.forEach((id) => {
    result[id] = map[id] === true;
  });

  return result;
}
