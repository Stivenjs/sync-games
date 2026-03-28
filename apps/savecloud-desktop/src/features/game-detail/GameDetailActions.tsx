import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import {
  Archive,
  ChevronDown,
  CloudDownload,
  CloudUpload,
  ExternalLink,
  FolderOpen,
  History,
  Link2,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ConfiguredGame } from "@app-types/config";

export interface GameDetailActionsProps {
  game: ConfiguredGame;
  isGameRunning?: boolean;
  hasSyncConfig?: boolean;
  onSync?: (game: ConfiguredGame) => void;
  onDownload?: (game: ConfiguredGame) => void;
  onOpenFolder?: (game: ConfiguredGame) => void;
  /** Lanza el .exe configurado en el drawer (Ejecución). Deshabilitado si no hay ruta. */
  onPlay?: (game: ConfiguredGame) => void;
  onRestoreBackup?: (game: ConfiguredGame) => void;
  onFullBackupUpload?: (game: ConfiguredGame) => void;
  onEdit?: (game: ConfiguredGame) => void;
  onShare?: (game: ConfiguredGame) => void;
  onRemove?: (game: ConfiguredGame) => void;
}

export function GameDetailActions({
  game,
  isGameRunning,
  hasSyncConfig,
  onSync,
  onDownload,
  onOpenFolder,
  onPlay,
  onRestoreBackup,
  onFullBackupUpload,
  onEdit,
  onShare,
  onRemove,
}: GameDetailActionsProps) {
  const handleAction = async (key: React.Key) => {
    const action = String(key);
    switch (action) {
      case "folder":
        onOpenFolder?.(game);
        break;
      case "sync":
        onSync?.(game);
        break;
      case "download":
        onDownload?.(game);
        break;
      case "fullBackup":
        onFullBackupUpload?.(game);
        break;
      case "restore":
        onRestoreBackup?.(game);
        break;
      case "edit":
        onEdit?.(game);
        break;
      case "share":
        onShare?.(game);
        break;
      case "remove":
        onRemove?.(game);
        break;
      case "source":
        if (game.sourceUrl) await openUrl(game.sourceUrl);
        break;
    }
  };

  const disabledKeys = isGameRunning ? ["sync", "download", "fullBackup", "restore"] : [];
  const canPlay = Boolean(game.launchExecutablePath?.trim());
  const playDisabled = !canPlay || Boolean(isGameRunning);
  const playTitle = !canPlay
    ? "Configura el ejecutable en la lista de juegos: Editar juego → pestaña Ejecución"
    : isGameRunning
      ? "El juego parece estar en ejecución"
      : undefined;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        color="primary"
        startContent={<Play size={18} />}
        isDisabled={playDisabled}
        title={playTitle}
        onPress={() => onPlay?.(game)}>
        Jugar
      </Button>

      <Dropdown placement="bottom-end">
        <DropdownTrigger>
          <Button variant="bordered" endContent={<ChevronDown size={16} />}>
            Acciones
          </Button>
        </DropdownTrigger>
        <DropdownMenu aria-label={`Acciones para ${game.id}`} onAction={handleAction} disabledKeys={disabledKeys}>
          <DropdownItem key="edit" startContent={<Pencil size={16} />}>
            Editar juego
          </DropdownItem>

          <DropdownItem key="folder" startContent={<FolderOpen size={16} />}>
            Abrir carpeta
          </DropdownItem>

          <DropdownItem
            key="source"
            className={!game.sourceUrl ? "hidden" : "text-primary"}
            startContent={<ExternalLink size={16} />}>
            Ir a la web del juego
          </DropdownItem>

          <DropdownItem
            key="download"
            className={!hasSyncConfig ? "hidden" : ""}
            startContent={<CloudDownload size={16} />}>
            Descargar de la nube
          </DropdownItem>

          <DropdownItem key="sync" className={!hasSyncConfig ? "hidden" : ""} startContent={<CloudUpload size={16} />}>
            Subir a la nube
          </DropdownItem>

          <DropdownItem
            key="fullBackup"
            className={!hasSyncConfig ? "hidden" : ""}
            startContent={<Archive size={16} />}>
            Empaquetar y subir
          </DropdownItem>

          <DropdownItem key="restore" startContent={<History size={16} />}>
            Restaurar backup
          </DropdownItem>

          <DropdownItem key="share" className={!hasSyncConfig ? "hidden" : ""} startContent={<Link2 size={16} />}>
            Compartir link
          </DropdownItem>

          <DropdownItem key="remove" className="text-danger" color="danger" startContent={<Trash2 size={16} />}>
            Eliminar juego
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
    </div>
  );
}
