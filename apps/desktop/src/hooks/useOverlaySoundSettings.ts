/**
 * @file useOverlaySoundSettings.ts
 * @description Hook de TanStack Query para gestionar la configuración de sonido del overlay (sin useEffect).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getOverlaySoundSettings, setOverlaySoundSettings, type OverlaySoundSettings } from "@services/tauri";
import { listen } from "@tauri-apps/api/event";
import { queryClient } from "@lib/queryClient";

export const OVERLAY_SOUND_QUERY_KEYS = {
  all: ["overlay-sound-settings"] as const,
};

let isOverlaySoundListenerRegistered = false;

function registerOverlaySoundListener() {
  if (isOverlaySoundListenerRegistered) return;
  isOverlaySoundListenerRegistered = true;
  void listen<OverlaySoundSettings>("overlay-sound-settings-changed", (event) => {
    if (event.payload) {
      queryClient.setQueryData<OverlaySoundSettings>(OVERLAY_SOUND_QUERY_KEYS.all, event.payload);
    }
  });
}

// Auto-registrar listener de eventos cross-window de Tauri
registerOverlaySoundListener();

export function useOverlaySoundSettings() {
  const qc = useQueryClient();

  const {
    data: soundSettings = { enabled: true, volume: 0.6 },
    isLoading,
    refetch,
  } = useQuery({
    queryKey: OVERLAY_SOUND_QUERY_KEYS.all,
    queryFn: getOverlaySoundSettings,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { mutate: updateSettings, isPending: isSaving } = useMutation({
    mutationFn: setOverlaySoundSettings,
    onMutate: async (newSettings: OverlaySoundSettings) => {
      await qc.cancelQueries({ queryKey: OVERLAY_SOUND_QUERY_KEYS.all });
      const previous = qc.getQueryData<OverlaySoundSettings>(OVERLAY_SOUND_QUERY_KEYS.all);
      qc.setQueryData<OverlaySoundSettings>(OVERLAY_SOUND_QUERY_KEYS.all, newSettings);
      return { previous };
    },
    onError: (_err, _newSettings, context) => {
      if (context?.previous) {
        qc.setQueryData<OverlaySoundSettings>(OVERLAY_SOUND_QUERY_KEYS.all, context.previous);
      }
    },
  });

  return {
    soundSettings,
    isLoading,
    isSaving,
    updateSettings,
    refetch,
  };
}
