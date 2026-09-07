import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { Gamepad2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useConfig } from "@hooks/useConfig";
import { detectGameFromText, formatTextWithGameNames } from "@utils/gameImage";
import { PlayingGameThumbnail } from "@features/games/PlayingGameThumbnail";
import { useOverlaySoundSettings } from "@hooks/useOverlaySoundSettings";

/**
 * Payload recibido del evento de notificación
 */
interface NotificationPayload {
  title: string;
  body: string;
  avatar?: string;
  gameId?: string;
  imageUrl?: string;
  steamAppId?: string;
}

/**
 * Notificación del overlay con identificador único
 */
interface OverlayNotification extends NotificationPayload {
  id: string;
}

/** Duración de la notificación en pantalla (ms) */
const NOTIFICATION_DURATION = 5000;

/** Número máximo de notificaciones simultáneas */
const MAX_NOTIFICATIONS = 5;

/** Delay para ocultar overlay al finalizar animación de salida (ms) */
const OVERLAY_HIDE_DELAY = 350;

interface NotificationCardProps extends OverlayNotification {
  isLeft?: boolean;
}

const NotificationCard: React.FC<NotificationCardProps> = ({
  id,
  title,
  body,
  avatar,
  gameId,
  imageUrl,
  steamAppId,
  isLeft = false,
}) => {
  const { config } = useConfig();

  const detectedGameId = useMemo(
    () => detectGameFromText({ gameId, title, body, games: config?.games }),
    [gameId, body, title, config?.games]
  );

  const formattedTitle = useMemo(
    () => formatTextWithGameNames(title, detectedGameId, config?.games),
    [title, detectedGameId, config?.games]
  );

  const formattedBody = useMemo(
    () => formatTextWithGameNames(body, detectedGameId, config?.games),
    [body, detectedGameId, config?.games]
  );

  const slideX = isLeft ? -320 : 320;

  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, x: slideX }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: slideX }}
      transition={{ type: "tween", duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="pointer-events-auto">
      {/* Contenedor principal estilo Steam Toast */}
      <div className="flex bg-[#171a21]/95 border border-white/10 rounded-sm overflow-hidden shadow-[0_8px_28px_rgba(0,0,0,0.7)] backdrop-blur-md">
        {/* Barra verde lateral de acento */}
        <div className="w-1 bg-[#5c7e10] shrink-0" />

        {/* Contenido de la notificación */}
        <div className="flex items-center gap-3 py-2.5 px-3">
          {/* Avatar / Portada de juego / Icono */}
          <div className="shrink-0 flex items-center justify-center">
            {avatar ? (
              <div className="w-10 h-10 rounded-[3px] bg-[#2a2e38] overflow-hidden shrink-0">
                <img src={avatar} alt="" className="w-full h-full object-cover" />
              </div>
            ) : detectedGameId ? (
              <PlayingGameThumbnail
                gameId={detectedGameId}
                imageUrl={imageUrl}
                steamAppId={steamAppId}
                size="md"
                className="h-10 w-16 rounded-sm shadow-xs object-cover"
              />
            ) : (
              <div className="w-9 h-9 rounded-[3px] bg-[#2a2e38] overflow-hidden shrink-0 flex items-center justify-center border border-white/5">
                <Gamepad2 className="w-5 h-5 text-[#8f98a0]" />
              </div>
            )}
          </div>

          {/* Texto */}
          <div className="flex flex-col min-w-0">
            <span className="text-[#c6d4df] text-[14px] font-medium leading-[1.2] truncate max-w-60">
              {formattedTitle}
            </span>
            <span className="text-[#5c7e10] text-[13px] font-normal leading-[1.3] truncate max-w-60">
              {formattedBody}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

/**
 * Hook para gestionar las notificaciones del overlay
 *
 * @returns Estado y funciones para manejar notificaciones
 */
function useOverlayNotifications() {
  const [notifications, setNotifications] = useState<OverlayNotification[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const { soundSettings } = useOverlaySoundSettings();
  const soundSettingsRef = useRef(soundSettings);
  soundSettingsRef.current = soundSettings;

  /**
   * Agrega una nueva notificación y programa su eliminación automática
   */
  const addNotification = useCallback((payload: NotificationPayload) => {
    const id = window.crypto.randomUUID();
    const notification: OverlayNotification = { id, ...payload };

    const { enabled, volume } = soundSettingsRef.current;
    if (enabled && volume > 0) {
      try {
        const audio = new Audio("/sounds/2575.wav");
        audio.volume = Math.max(0, Math.min(1, volume));
        audio.play().catch((e) => console.warn("[Overlay] Audio autoplay blocked or failed:", e));
      } catch (e) {
        console.warn("[Overlay] Failed to play audio:", e);
      }
    }

    setNotifications((prev) => {
      const updated = [...prev, notification];
      if (updated.length > MAX_NOTIFICATIONS) {
        const removed = updated.shift();
        if (removed) {
          const timeout = timeoutsRef.current.get(removed.id);
          if (timeout) {
            clearTimeout(timeout);
            timeoutsRef.current.delete(removed.id);
          }
        }
      }
      return updated;
    });

    // Programar eliminación automática
    const timeout = setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      timeoutsRef.current.delete(id);
    }, NOTIFICATION_DURATION);

    timeoutsRef.current.set(id, timeout);
  }, []);

  /**
   * Limpia todos los timeouts pendientes
   */
  const cleanup = useCallback(() => {
    timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    timeoutsRef.current.clear();
  }, []);

  return { notifications, addNotification, cleanup };
}

/**
 * Aplicación de overlay para mostrar notificaciones sobre juegos
 *
 * Características:
 * - Renderiza notificaciones en la esquina inferior derecha
 * - Animaciones de entrada/salida suaves
 * - Auto-eliminación después de 5 segundos
 * - Límite de notificaciones simultáneas
 * - Transparente al mouse (pointer-events-none) excepto las notificaciones
 *
 * @example
 * // En modo overlay, la aplicación escucha eventos y muestra notificaciones
 * <OverlayApp />
 */
export function OverlayApp() {
  const { t } = useTranslation();
  const { notifications, addNotification, cleanup } = useOverlayNotifications();
  const { settings } = useOverlaySoundSettings();
  const hasSignaledReadyRef = useRef(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let mounted = true;

    const setupListenerAndSignalReady = async () => {
      try {
        unlisten = await listen<NotificationPayload>("show-overlay-notification", (event) => {
          const { title, body, avatar, gameId, imageUrl, steamAppId } = event.payload;

          if (!title?.trim() || !body?.trim()) {
            console.warn("[Overlay] Notificación inválida descartada", event.payload);
            return;
          }

          addNotification({ title, body, avatar, gameId, imageUrl, steamAppId });
        });

        if (mounted && !hasSignaledReadyRef.current) {
          await emit("overlay-ready");
          hasSignaledReadyRef.current = true;
        }
      } catch (error) {
        console.error("[Overlay] Error en setup inicial:", error);
      }
    };

    setupListenerAndSignalReady();

    return () => {
      mounted = false;
      unlisten?.();
      cleanup();
    };
  }, [addNotification, cleanup]);

  useEffect(() => {
    if (notifications.length > 0) {
      return;
    }

    const hideTimer = setTimeout(() => {
      void invoke("hide_overlay_window").catch((error: unknown) => {
        console.error("[Overlay] No se pudo ocultar la ventana:", error);
      });
    }, OVERLAY_HIDE_DELAY);

    return () => {
      clearTimeout(hideTimer);
    };
  }, [notifications.length]);

  const currentPosition = settings.position;

  const isLeft = currentPosition.endsWith("-left");

  const positionClasses = useMemo(() => {
    switch (currentPosition) {
      case "top-left":
        return "top-4 left-4 flex flex-col items-start gap-2.5 pointer-events-none";
      case "top-right":
        return "top-4 right-4 flex flex-col items-end gap-2.5 pointer-events-none";
      case "bottom-left":
        return "bottom-17 left-4 flex flex-col items-start gap-2.5 pointer-events-none";
      case "bottom-right":
      default:
        return "bottom-17 right-4 flex flex-col items-end gap-2.5 pointer-events-none";
    }
  }, [currentPosition]);

  return (
    <div className="fixed inset-0 m-0 p-0 pointer-events-none bg-transparent overflow-hidden">
      {/* Contenedor de notificaciones - posicionado dinámicamente según preferencia */}
      <div
        className={`absolute ${positionClasses}`}
        role="region"
        aria-label={t("overlay.ariaLabel", "Notificaciones de overlay")}
        aria-live="polite">
        <AnimatePresence mode="popLayout">
          {notifications.map((notification) => (
            <NotificationCard key={notification.id} {...notification} isLeft={isLeft} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
