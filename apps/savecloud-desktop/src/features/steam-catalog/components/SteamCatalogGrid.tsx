import type { CatalogListItem } from "@services/tauri";
import type { SteamAppdetailsMediaResult } from "@services/tauri";
import { GameCard } from "@features/games/GameCard";
import { GamesListMotionContainer, GamesListMotionItem } from "@features/games/GamesListMotion";
import { catalogListItemToConfiguredGame } from "@features/steam-catalog/model/catalogConfiguredGame";

type SteamCatalogGridProps = {
  items: CatalogListItem[];
  listKey: string;
  mediaBySteamAppId: Record<string, SteamAppdetailsMediaResult> | null;
};

export function SteamCatalogGrid({ items, listKey, mediaBySteamAppId }: SteamCatalogGridProps) {
  return (
    <GamesListMotionContainer className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5" listKey={listKey}>
      {items.map((item) => {
        const game = catalogListItemToConfiguredGame(item);
        return (
          <GamesListMotionItem key={game.id}>
            <GameCard game={game} cardTitle={item.name} mediaBySteamAppId={mediaBySteamAppId ?? null} mediaFromBatch />
          </GamesListMotionItem>
        );
      })}
    </GamesListMotionContainer>
  );
}
