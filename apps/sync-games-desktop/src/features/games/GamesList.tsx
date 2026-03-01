import { Gamepad2, FolderOpen } from "lucide-react";
import type { ConfiguredGame } from "@app-types/config";

interface GamesListProps {
  games: readonly ConfiguredGame[];
}

export function GamesList({ games }: GamesListProps) {
  if (games.length === 0) {
    return (
      <div className="empty-state">
        <Gamepad2 className="empty-state__icon" size={48} strokeWidth={1.5} />
        <p className="empty-state__text">No hay juegos configurados.</p>
        <p className="empty-state__hint">
          Añade juegos desde la línea de comandos con:{" "}
          <code>sync-games add &lt;game-id&gt; &lt;ruta&gt;</code>
        </p>
      </div>
    );
  }

  return (
    <ul className="games-list">
      {games.map((game) => (
        <li key={game.id} className="games-list__item">
          <div className="games-list__id">{game.id}</div>
          <ul className="games-list__paths">
            {game.paths.map((path) => (
              <li key={path} className="games-list__path">
                <FolderOpen size={14} className="games-list__path-icon" />
                {path}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
