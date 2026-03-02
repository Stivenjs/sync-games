import { addToast } from "@heroui/react";
import type { SyncResult } from "@services/tauri";

type ToastColor = "default" | "primary" | "secondary" | "success" | "warning" | "danger";

interface ToastOptions {
  timeout?: number;
  color?: ToastColor;
}

/**
 * Muestra un toast de éxito (verde).
 */
export function toastSuccess(
  title: string,
  description?: string,
  options?: ToastOptions
): void {
  addToast({
    title,
    description,
    color: "success",
    timeout: 5000,
    ...options,
  });
}

/**
 * Muestra un toast de error (rojo).
 */
export function toastError(
  title: string,
  description?: string,
  options?: ToastOptions
): void {
  addToast({
    title,
    description,
    color: "danger",
    timeout: 8000,
    ...options,
  });
}

/**
 * Muestra un toast de advertencia (amarillo).
 */
export function toastWarning(
  title: string,
  description?: string,
  options?: ToastOptions
): void {
  addToast({
    title,
    description,
    color: "warning",
    timeout: 7000,
    ...options,
  });
}

/**
 * Muestra un toast de información (azul/por defecto).
 */
export function toastInfo(
  title: string,
  description?: string,
  options?: ToastOptions
): void {
  addToast({
    title,
    description,
    color: "primary",
    timeout: 6000,
    ...options,
  });
}

/**
 * Muestra el toast adecuado según el resultado de una descarga.
 * @param result - Resultado de syncDownloadGame
 * @param gameName - Nombre formateado del juego (opcional, para un solo juego)
 */
export function toastDownloadResult(
  result: SyncResult,
  gameName?: string
): void {
  if (result.errCount === 0 && result.okCount > 0) {
    toastSuccess(
      "Descarga completada",
      gameName
        ? `${gameName}: ${result.okCount} archivo(s) descargado(s)`
        : `${result.okCount} archivo(s) descargado(s)`
    );
  } else if (result.errCount === 0 && result.okCount === 0) {
    toastInfo(
      "Sin guardados en la nube",
      result.errors[0] ?? "No hay guardados de este juego"
    );
  } else if (result.okCount > 0) {
    toastWarning(
      "Descarga parcial",
      `${result.okCount} descargado(s), ${result.errCount} error(es)`
    );
  } else {
    toastError(
      "Error en la descarga",
      result.errors[0] ?? "No se pudo descargar"
    );
  }
}

/**
 * Muestra el toast adecuado según el resultado de una sincronización (subida).
 * @param result - Resultado de syncUploadGame
 * @param gameName - Nombre formateado del juego (opcional, para un solo juego)
 */
export function toastSyncResult(result: SyncResult, gameName?: string): void {
  if (result.errCount === 0) {
    toastSuccess(
      "Sincronización completada",
      gameName
        ? `${gameName}: ${result.okCount} archivo(s) subido(s)`
        : `${result.okCount} archivo(s) subido(s)`
    );
  } else if (result.okCount > 0) {
    toastWarning(
      "Sincronización parcial",
      `${result.okCount} subido(s), ${result.errCount} error(es)`
    );
  } else {
    toastError(
      "Error en la sincronización",
      result.errors[0] ?? "No se pudo subir"
    );
  }
}
