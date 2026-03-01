import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { PathCandidate } from "@services/tauri";
import { getSteamAppName } from "@services/tauri";
import { extractAppIdFromFolderName } from "@utils/gameImage";

const CANDIDATE_NAME_QUERY_KEY = ["candidate-name"] as const;

/**
 * Resuelve los nombres de juegos para candidatos que tienen Steam App ID
 * (ej. "EMPRESS — 2050650" → "Resident Evil 4").
 */
export function useResolvedCandidateNames(
  candidates: PathCandidate[] | undefined
): Record<string, string | null | undefined> {
  const toResolve = useMemo(
    () =>
      (candidates ?? []).filter((c) =>
        extractAppIdFromFolderName(c.folderName ?? "")
      ),
    [candidates]
  );

  const queries = useQueries({
    queries: toResolve.map((c) => ({
      queryKey: [...CANDIDATE_NAME_QUERY_KEY, c.path],
      queryFn: async () => {
        const appId = extractAppIdFromFolderName(c.folderName ?? "");
        if (!appId) return null;
        return getSteamAppName(appId);
      },
    })),
  });

  return useMemo(() => {
    const result: Record<string, string | null | undefined> = {};
    toResolve.forEach((c, i) => {
      const { data, isFetched } = queries[i] ?? {};
      result[c.path] = isFetched ? data ?? null : undefined;
    });
    return result;
  }, [toResolve, queries]);
}
