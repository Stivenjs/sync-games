import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { backupConfigToCloud, checkForUpdatesWithPrompt } from "@services/tauri";
import { toastSyncResult } from "@utils/toast";
import { notifySyncComplete, notifySyncError } from "@utils/notification";
import { formatGameDisplayName } from "@utils/gameImage";

/**
 * Hook encargado de inicializar comportamientos globales de la aplicación.
 *
 * Este hook centraliza tareas que deben ejecutarse automáticamente
 * cuando la app arranca, como:
 *
 * - Respaldar periódicamente la configuración del usuario en la nube.
 * - Comprobar actualizaciones de la aplicación (solo en producción).
 * - Escuchar eventos de sincronización automática emitidos desde el backend de Tauri.
 *
 * Debe usarse una sola vez en el nivel raíz de la aplicación
 * (por ejemplo en `App.tsx`).
 *
 * @example
 * ```tsx
 * function App() {
 *   useAppInitialization();
 *   return <Router />;
 * }
 * ```
 */
export function useAppInitialization() {
  /**
   * Realiza respaldos periódicos de la configuración del usuario en la nube.
   *
   * Esto permite evitar pérdida de datos si el usuario cambia de dispositivo
   * o reinstala la aplicación.
   *
   * Frecuencia: cada 5 minutos.
   */
  useEffect(() => {
    const interval = setInterval(
      () => {
        backupConfigToCloud().catch(() => {
          // Ignorar errores silenciosamente para no interrumpir la UX
        });
      },
      5 * 60 * 1000
    );

    return () => clearInterval(interval);
  }, []);

  /**
   * Comprueba si hay nuevas versiones disponibles de la aplicación.
   *
   * - Solo se ejecuta en entorno de producción.
   * - Espera 2 segundos después del inicio para no afectar el arranque.
   * - Si hay una actualización disponible, se muestra un prompt al usuario.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) {
      const timer = setTimeout(() => {
        checkForUpdatesWithPrompt(true).catch(() => {
          // Ignorar errores de actualización
        });
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, []);

  /**
   * Escucha eventos emitidos desde el backend de Tauri relacionados con
   * sincronización automática de juegos.
   *
   * Eventos manejados:
   *
   * - `auto-sync-done`
   *   Se dispara cuando una sincronización termina correctamente.
   *
   * - `auto-sync-error`
   *   Se dispara cuando ocurre un error durante la sincronización.
   *
   * En ambos casos:
   * - Se muestra un toast con el resultado.
   * - Se envía una notificación del sistema.
   */
  useEffect(() => {
    /**
     * Evento emitido cuando la sincronización automática finaliza.
     */
    const unsubDone = listen<{
      gameId: string;
      okCount: number;
      errCount: number;
    }>("auto-sync-done", (ev) => {
      const gameName = formatGameDisplayName(ev.payload.gameId);

      toastSyncResult(
        {
          okCount: ev.payload.okCount,
          errCount: ev.payload.errCount,
          errors: [],
        },
        gameName
      );

      notifySyncComplete(gameName, ev.payload.okCount, ev.payload.errCount);
    });

    /**
     * Evento emitido cuando ocurre un error durante la sincronización automática.
     */
    const unsubErr = listen<{
      gameId: string;
      error: string;
    }>("auto-sync-error", (ev) => {
      const gameName = formatGameDisplayName(ev.payload.gameId);

      toastSyncResult(
        {
          okCount: 0,
          errCount: 1,
          errors: [ev.payload.error],
        },
        gameName
      );

      notifySyncError(gameName, ev.payload.error);
    });

    /**
     * Cleanup: elimina los listeners cuando el componente se desmonta.
     */
    return () => {
      unsubDone.then((f) => f());
      unsubErr.then((f) => f());
    };
  }, []);
}
