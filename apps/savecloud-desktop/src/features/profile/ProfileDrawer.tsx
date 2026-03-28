import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Divider, Drawer, DrawerBody, DrawerContent, DrawerHeader, Input } from "@heroui/react";
import { open } from "@tauri-apps/plugin-dialog";
import { Gamepad2, ImageIcon, Layers, Link2, MonitorPlay, Save, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Config } from "@app-types/config";
import type { ConnectionStatus } from "@hooks/useLastSyncInfo";
import { CONFIG_QUERY_KEY } from "@hooks/useConfig";
import { readImageAsDataUrl, scheduleConfigBackupToCloud, setProfileAppearance } from "@services/tauri";
import { formatPlaytime } from "@utils/format";
import { isProfileVideoSource, resolveProfileAsset } from "@utils/profileMedia";
import { toastError, toastSuccess } from "@utils/toast";

interface ProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  config: Config | null;
  hasSyncConfig?: boolean;
  connectionStatus?: ConnectionStatus;
}

function connectionLabel(status: ConnectionStatus | undefined): { text: string; tone: string } {
  switch (status) {
    case "connected":
      return { text: "En línea", tone: "text-success" };
    case "connecting":
      return { text: "Conectando…", tone: "text-default-500" };
    case "retrying":
      return { text: "Reintentando…", tone: "text-warning" };
    case "error":
      return { text: "Sin conexión", tone: "text-danger" };
    default:
      return { text: "—", tone: "text-default-400" };
  }
}

function ProfileHeroBackground({ rawUrl }: { rawUrl: string }) {
  const resolved = useMemo(() => resolveProfileAsset(rawUrl), [rawUrl]);
  const isVideo = isProfileVideoSource(rawUrl);

  if (!resolved) return null;

  if (isVideo) {
    return <video src={resolved} className="absolute inset-0 size-full object-cover" autoPlay muted loop playsInline />;
  }
  return <img src={resolved} alt="" className="absolute inset-0 size-full object-cover" />;
}

export function ProfileDrawer({ isOpen, onClose, config, hasSyncConfig, connectionStatus }: ProfileDrawerProps) {
  const queryClient = useQueryClient();
  const [bg, setBg] = useState("");
  const [avatar, setAvatar] = useState("");
  const [frame, setFrame] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !config) return;
    setBg(config.profileBackground ?? "");
    setAvatar(config.profileAvatar ?? "");
    setFrame(config.profileFrame ?? "");
  }, [isOpen, config]);

  const gamesCount = config?.games?.length ?? 0;
  const totalSeconds = config?.totalPlaytime ?? 0;
  const userId = config?.userId?.trim() ?? "";
  const displayName = userId || "Usuario";
  const conn = connectionLabel(hasSyncConfig ? connectionStatus : undefined);

  const level = useMemo(
    () => Math.min(99, Math.max(1, Math.floor(Math.sqrt(Math.max(1, totalSeconds / 3600))) + 1)),
    [totalSeconds]
  );

  const avatarResolved = useMemo(() => resolveProfileAsset(avatar || undefined), [avatar]);
  const frameResolved = useMemo(() => resolveProfileAsset(frame || undefined), [frame]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await setProfileAppearance({
        profileBackground: bg.trim() || null,
        profileAvatar: avatar.trim() || null,
        profileFrame: frame.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY });
      scheduleConfigBackupToCloud();
      toastSuccess("Perfil actualizado", "Se guardó la apariencia del perfil.");
      onClose();
    } catch (e) {
      toastError("No se pudo guardar", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [avatar, bg, frame, onClose, queryClient]);

  const pickFile = useCallback(async (kind: "background" | "avatar" | "frame") => {
    try {
      if (kind === "background") {
        const selected = await open({
          multiple: false,
          title: "Elegir imagen o vídeo de fondo",
          filters: [
            { name: "Imagen o vídeo", extensions: ["jpg", "jpeg", "png", "gif", "webp", "mp4", "webm", "mov"] },
          ],
        });
        if (typeof selected === "string") {
          setBg(selected);
        }
        return;
      }
      const selected = await open({
        multiple: false,
        title: kind === "avatar" ? "Elegir imagen de perfil" : "Elegir imagen de marco",
        filters: [{ name: "Imagen", extensions: ["jpg", "jpeg", "png", "gif", "webp"] }],
      });
      if (typeof selected === "string") {
        const dataUrl = await readImageAsDataUrl(selected);
        if (kind === "avatar") setAvatar(dataUrl);
        else setFrame(dataUrl);
      }
    } catch (e) {
      toastError("Archivo no válido", e instanceof Error ? e.message : String(e));
    }
  }, []);

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(openState) => {
        if (!openState) onClose();
      }}
      placement="right"
      size="lg"
      backdrop="blur"
      classNames={{ base: "sm:max-w-lg" }}>
      <DrawerContent className="bg-content1">
        <DrawerHeader className="flex flex-col gap-0 border-b border-default-200 p-0">
          <div className="relative h-44 w-full overflow-hidden">
            {bg.trim() ? (
              <ProfileHeroBackground rawUrl={bg.trim()} />
            ) : (
              <div className="absolute inset-0 bg-[linear-gradient(125deg,#1b2838_0%,#0e1621_45%,#1b2838_100%)]" />
            )}
            <div className="absolute inset-0 bg-linear-to-t from-content1 via-content1/70 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 px-4 pb-3">
              <div className="relative size-[72px] shrink-0">
                <div className="relative size-full overflow-hidden rounded-md border border-white/10 bg-black/30 shadow-lg">
                  {avatarResolved ? (
                    <img src={avatarResolved} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-default-400">
                      <User size={36} strokeWidth={1.2} />
                    </div>
                  )}
                </div>
                {frameResolved && (
                  <img
                    src={frameResolved}
                    alt=""
                    className="pointer-events-none absolute inset-0 size-full object-contain"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <h2 className="truncate text-lg font-semibold text-foreground">{displayName}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`font-medium ${conn.tone}`}>{conn.text}</span>
                  <span className="text-default-400">·</span>
                  <span className="text-default-500">{formatPlaytime(totalSeconds)} jugados</span>
                  <span className="text-default-400">·</span>
                  <span className="text-default-500">
                    {gamesCount} {gamesCount === 1 ? "juego" : "juegos"}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 pb-0.5">
                <div className="flex items-center gap-1.5 rounded-full border border-default-200/80 bg-default-100/80 px-2.5 py-0.5 text-xs dark:bg-default-50/10">
                  <span className="text-default-500">Nivel</span>
                  <span className="flex size-6 items-center justify-center rounded-full border border-primary/40 bg-primary/10 font-semibold text-primary">
                    {level}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </DrawerHeader>

        <DrawerBody className="gap-4 px-4 py-4">
          <p className="text-xs text-default-500">
            Pega enlaces remotos (https) o elige archivos locales. El fondo admite imagen, GIF o vídeo; avatar y marco,
            imagen.
          </p>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-default-700">
              <MonitorPlay size={16} />
              Fondo del perfil
            </div>
            <Input
              size="sm"
              label="URL"
              placeholder="https://… o deja vacío para quitar"
              value={bg}
              onValueChange={setBg}
              variant="bordered"
              startContent={<Link2 size={14} className="text-default-400" />}
            />
            <Button size="sm" variant="flat" className="w-full" onPress={() => void pickFile("background")}>
              Elegir archivo del sistema…
            </Button>
          </section>

          <Divider />

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-default-700">
              <ImageIcon size={16} />
              Foto de perfil
            </div>
            <Input
              size="sm"
              label="URL"
              placeholder="https://… o data URL"
              value={avatar}
              onValueChange={setAvatar}
              variant="bordered"
              startContent={<Link2 size={14} className="text-default-400" />}
            />
            <Button size="sm" variant="flat" className="w-full" onPress={() => void pickFile("avatar")}>
              Elegir imagen local…
            </Button>
          </section>

          <Divider />

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-default-700">
              <Layers size={16} />
              Marco (opcional)
            </div>
            <Input
              size="sm"
              label="URL"
              placeholder="PNG con transparencia recomendado"
              value={frame}
              onValueChange={setFrame}
              variant="bordered"
              startContent={<Link2 size={14} className="text-default-400" />}
            />
            <Button size="sm" variant="flat" className="w-full" onPress={() => void pickFile("frame")}>
              Elegir imagen local…
            </Button>
          </section>

          <div className="flex gap-2 pt-2">
            <Button variant="flat" className="flex-1" onPress={onClose}>
              Cancelar
            </Button>
            <Button
              color="primary"
              className="flex-1"
              isLoading={saving}
              startContent={<Save size={18} />}
              onPress={() => void handleSave()}>
              Guardar
            </Button>
          </div>

          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-default-200 py-3 text-default-400">
            <Gamepad2 size={18} />
            <span className="text-xs">Vista previa arriba · estilo compacto</span>
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
