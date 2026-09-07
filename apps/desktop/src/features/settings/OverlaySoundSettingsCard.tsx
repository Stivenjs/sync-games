/**
 * @file OverlaySoundSettingsCard.tsx
 * @description Tarjeta de configuración para el sonido y volumen del overlay en juego.
 * Alineada con el sistema de diseño nativo de SaveCloud y HeroUI.
 */

import { useState, useCallback, useRef } from "react";
import { Button, Card, CardBody, Slider, Switch } from "@heroui/react";
import { Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOverlaySoundSettings } from "@hooks/useOverlaySoundSettings";
import { toastError } from "@utils/toast";

export function OverlaySoundSettingsCard() {
  const { t } = useTranslation();
  const { soundSettings, isLoading, isSaving, updateSettings } = useOverlaySoundSettings();

  // Volumen transitorio durante el arrastre del slider
  const [dragVolume, setDragVolume] = useState<number | null>(null);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const enabled = soundSettings.enabled;
  const currentVolume = dragVolume ?? soundSettings.volume;

  const handleToggleEnabled = useCallback(
    (nextEnabled: boolean) => {
      updateSettings(
        { enabled: nextEnabled, volume: currentVolume },
        {
          onError: (err) => {
            toastError(
              err instanceof Error
                ? err.message
                : t("settings.overlaySound.toastError", "No se pudo guardar la configuración de sonido del overlay")
            );
          },
        }
      );
    },
    [currentVolume, updateSettings, t]
  );

  const handleSliderChange = useCallback((val: number | number[]) => {
    const nextVal = Array.isArray(val) ? val[0] : val;
    const normalized = Math.max(0, Math.min(1, nextVal / 100));
    setDragVolume(normalized);
  }, []);

  const handleSliderChangeEnd = useCallback(
    (val: number | number[]) => {
      const nextVal = Array.isArray(val) ? val[0] : val;
      const normalized = Math.max(0, Math.min(1, nextVal / 100));
      setDragVolume(null);
      updateSettings(
        { enabled, volume: normalized },
        {
          onError: (err) => {
            toastError(
              err instanceof Error
                ? err.message
                : t("settings.overlaySound.toastError", "No se pudo guardar la configuración de sonido del overlay")
            );
          },
        }
      );
    },
    [enabled, updateSettings, t]
  );

  const handleTestSound = useCallback(() => {
    if (!enabled || currentVolume === 0) return;

    try {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
      }

      const audio = new Audio("/sounds/2575.wav");
      audio.volume = Math.max(0, Math.min(1, currentVolume));
      activeAudioRef.current = audio;

      setIsPlayingTest(true);
      audio.onended = () => setIsPlayingTest(false);
      audio.onerror = () => setIsPlayingTest(false);

      audio.play().catch((err) => {
        console.warn("[OverlaySoundSettingsCard] Reproducción bloqueada:", err);
        setIsPlayingTest(false);
      });
    } catch (err) {
      console.warn("[OverlaySoundSettingsCard] Error reproduciendo audio:", err);
      setIsPlayingTest(false);
    }
  }, [enabled, currentVolume]);

  const volumePercentage = Math.round(currentVolume * 100);

  return (
    <Card>
      <CardBody className="gap-4">
        {/* Cabecera con Switch */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Volume2 size={20} className="mt-0.5 shrink-0 text-default-500" />
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {t("settings.overlaySound.title", "Sonido del overlay en juego")}
              </h2>
              <p className="mt-0.5 text-sm text-default-500">
                {t(
                  "settings.overlaySound.subtitle",
                  "Controla el volumen de alerta audible que suena cuando aparece una notificación superpuesta mientras juegas."
                )}
              </p>
            </div>
          </div>
          <Switch
            isSelected={enabled}
            onValueChange={handleToggleEnabled}
            isDisabled={isLoading || isSaving}
            aria-label={t("settings.overlaySound.enableSound", "Activar sonido del overlay")}
          />
        </div>

        {/* Fila de controles: Slider de volumen y botón de prueba */}
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1 transition-opacity ${
            !enabled ? "opacity-40 pointer-events-none" : ""
          }`}>
          <div className="flex-1 space-y-1.5 max-w-md">
            <div className="flex items-center justify-between text-xs text-default-500">
              <span>{t("settings.overlaySound.volume", "Volumen")}</span>
              <span className="font-mono font-medium text-foreground">{volumePercentage}%</span>
            </div>
            <Slider
              size="sm"
              step={1}
              minValue={0}
              maxValue={100}
              value={volumePercentage}
              onChange={handleSliderChange}
              onChangeEnd={handleSliderChangeEnd}
              isDisabled={!enabled || isLoading || isSaving}
              aria-label={t("settings.overlaySound.volume", "Volumen")}
              className="max-w-full"
            />
          </div>

          <Button
            size="sm"
            variant="flat"
            onPress={handleTestSound}
            isDisabled={!enabled || currentVolume === 0}
            isLoading={isPlayingTest}
            className="shrink-0 font-medium cursor-pointer">
            {t("settings.overlaySound.testButton", "Probar sonido")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
