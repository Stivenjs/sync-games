import { useState } from "react";
import { Card, CardFooter } from "@heroui/react";
import { Gamepad2 } from "lucide-react";
import type { ConfiguredGame } from "@app-types/config";
import { formatGameDisplayName, getGameImageUrl } from "@utils/gameImage";

export interface GameCardProps {
  game: ConfiguredGame;
  /** Steam App ID resuelto dinámicamente (por búsqueda). Opcional. */
  resolvedSteamAppId?: string | null;
}

/**
 * Tarjeta de juego con portada, usando HeroUI.
 * La imagen mantiene la proporción correcta de Steam (460×215) sin distorsión.
 */
export function GameCard({ game, resolvedSteamAppId }: GameCardProps) {
  const [imgError, setImgError] = useState(false);
  const imageUrl = getGameImageUrl(game, resolvedSteamAppId);
  const showImage = imageUrl && !imgError;

  return (
    <Card
      isFooterBlurred
      className="overflow-hidden border-none shadow-md transition-all duration-200 ease-out hover:-translate-y-2 hover:shadow-xl"
      radius="lg"
    >
      {showImage ? (
        <div className="relative aspect-460/215 w-full overflow-hidden rounded-t-large">
          <img
            src={imageUrl}
            alt={`Portada de ${game.id}`}
            className="size-full object-cover object-center"
            loading="lazy"
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
