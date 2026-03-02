import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let permissionChecked = false;

async function ensurePermission(): Promise<boolean> {
  if (permissionChecked) {
    return isPermissionGranted();
  }
  const granted = await isPermissionGranted();
  if (granted) {
    permissionChecked = true;
    return true;
  }
  const result = await requestPermission();
  permissionChecked = true;
  return result === "granted";
}

/**
 * Muestra una notificación de sistema (útil cuando la app está en la bandeja).
 */
export async function notifySyncComplete(
  gameName: string,
  okCount: number,
  errCount: number
): Promise<void> {
  if (!(await ensurePermission())) return;

  if (errCount === 0) {
    sendNotification({
      title: "sync-games",
      body: `${gameName}: ${okCount} archivo(s) subido(s) a la nube`,
    });
  } else if (okCount > 0) {
    sendNotification({
      title: "sync-games",
      body: `${gameName}: ${okCount} subido(s), ${errCount} error(es)`,
    });
  } else {
    sendNotification({
      title: "sync-games: Error",
      body: `${gameName}: No se pudo subir`,
    });
  }
}

/**
 * Envía una notificación de prueba (útil para verificar permisos).
 */
export async function notifyTest(): Promise<boolean> {
  const granted = await ensurePermission();
  if (!granted) return false;
  sendNotification({
    title: "sync-games",
    body: "Notificación de prueba — si ves esto, todo funciona correctamente",
  });
  return true;
}

/**
 * Notificación cuando hay error en la subida automática.
 */
export async function notifySyncError(
  gameName: string,
  error: string
): Promise<void> {
  if (!(await ensurePermission())) return;

  sendNotification({
    title: "sync-games: Error",
    body: `${gameName}: ${error}`,
  });
}
