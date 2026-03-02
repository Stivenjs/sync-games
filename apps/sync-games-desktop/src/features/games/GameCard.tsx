import { useState } from "react";
import { Card, CardFooter, Skeleton } from "@heroui/react";
import { CloudDownload, CloudUpload, Gamepad2, Trash2 } from "lucide-react";
import type { ConfiguredGame } from "@app-types/config";
import { formatGameDisplayName, getGameImageUrl } from "@utils/gameImage";

export interface GameCardProps {
  game: ConfiguredGame;
  /** Steam App ID resuelto dinámicamente (por búsqueda). Opcional. */
  resolvedSteamAppId?: string | null;
  /** Muestra skeleton mientras se resuelve Steam ID o carga la imagen. */
  isLoading?: boolean;
  /** Callback al eliminar el juego. Si no se pasa, no se muestra el botón. */
  onRemove?: (game: ConfiguredGame) => void;
  /** Callback al sincronizar (subir) el juego. Si no se pasa, no se muestra el botón. */
  onSync?: (game: ConfiguredGame) => void;
  /** Muestra spinner en el botón de sincronizar. */
  isSyncing?: boolean;
  /** Callback al descargar el juego. Si no se pasa, no se muestra el botón. */
  onDownload?: (game: ConfiguredGame) => void;
  /** Muestra spinner en el botón de descargar. */
  isDownloading?: boolean;
}

/**
 * Tarjeta de juego con portada, usando HeroUI.
 * La imagen mantiene la proporción correcta de Steam (460×215) sin distorsión.
 * Muestra skeletons de HeroUI mientras carga.
 */
export function GameCard({
  game,
  resolvedSteamAppId,
  isLoading: externalLoading,
  onRemove,
  onSync,
  isSyncing,
  onDownload,
  isDownloading,
}: GameCardProps) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const imageUrl = getGameImageUrl(game, resolvedSteamAppId);
  const showImage = imageUrl && !imgError;
  const imageLoading = showImage && !imgLoaded;
  const isLoading = externalLoading ?? imageLoading;

  if (isLoading) {
    return (
      <Card
        isFooterBlurred
        className="overflow-hidden border-none shadow-md"
        radius="lg"
      >
        <Skeleton className="aspect-460/215 w-full rounded-t-large" />
        <CardFooter className="absolute bottom-0 left-0 right-0 flex items-center justify-center overflow-hidden rounded-b-large border-0 bg-black/60 px-3 py-2 backdrop-blur-sm shadow-[0_-4px_20px_rgba(0,0,0,0.4)] z-10">
          <Skeleton className="h-3 w-3/4 rounded-lg bg-white/30" />
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card
      isFooterBlurred
      className="group relative overflow-hidden border-none shadow-md transition-all duration-200 ease-out hover:-translate-y-2 hover:shadow-xl"
      radius="lg"
    >
      <div className="absolute right-2 top-2 z-20 flex gap-1">
        {onDownload && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDownload(game);
            }}
            disabled={isDownloading || isSyncing}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-secondary hover:opacity-100 focus:opacity-100 group-hover:opacity-100 disabled:opacity-100"
            aria-label={`Descargar ${game.id}`}
          >
            {isDownloading ? (
              <span className="size-[18px] animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <CloudDownload size={18} />
            )}
          </button>
        )}
        {onSync && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSync(game);
            }}
            disabled={isSyncing || isDownloading}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-primary hover:opacity-100 focus:opacity-100 group-hover:opacity-100 disabled:opacity-100"
            aria-label={`Subir ${game.id}`}
          >
            {isSyncing ? (
              <span className="size-[18px] animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <CloudUpload size={18} />
            )}
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(game);
            }}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-danger hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
            aria-label={`Eliminar ${game.id}`}
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
      {showImage ? (
        <div className="relative aspect-460/215 w-full overflow-hidden rounded-t-large">
          <img
            src={imageUrl}
            alt={`Portada de ${game.id}`}
            className="size-full object-cover object-center"
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className="flex aspect-460/215 w-full items-center justify-center rounded-t-large bg-default-100">
          <Gamepad2 size={48} className="text-default-400" strokeWidth={1.5} />
        </div>
      )}
      <CardFooter className="absolute bottom-0 left-0 right-0 flex items-center justify-center overflow-hidden rounded-b-large border-0 bg-black/60 px-3 py-2 backdrop-blur-sm shadow-[0_-4px_20px_rgba(0,0,0,0.4)] z-10">
        <p className="truncate text-center text-xs font-bold uppercase tracking-wider text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          {formatGameDisplayName(game.id)}
        </p>
      </CardFooter>
    </Card>
  );
}
