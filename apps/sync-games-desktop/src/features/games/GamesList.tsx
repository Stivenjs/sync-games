import { Card, CardBody, CardHeader, Code } from "@heroui/react";
import { Gamepad2, FolderOpen } from "lucide-react";
import type { ConfiguredGame } from "@app-types/config";

interface GamesListProps {
  games: readonly ConfiguredGame[];
}

export function GamesList({ games }: GamesListProps) {
  if (games.length === 0) {
    return (
      <Card className="border border-dashed border-default-300">
        <CardBody className="flex flex-col items-center gap-4 py-12 text-center">
          <Gamepad2 size={48} className="text-default-400" strokeWidth={1.5} />
          <div>
            <p className="text-default-500">No hay juegos configurados.</p>
            <p className="mt-2 text-sm text-default-400">
              Añade juegos desde la línea de comandos con:{" "}
              <Code>sync-games add &lt;game-id&gt; &lt;ruta&gt;</Code>
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {games.map((game) => (
        <Card key={game.id}>
          <CardHeader className="flex gap-2 pb-0">
            <Gamepad2 size={20} className="text-primary" />
            <span className="font-semibold">{game.id}</span>
          </CardHeader>
          <CardBody className="pt-2">
            <ul className="flex flex-col gap-1 text-small text-default-500">
              {game.paths.map((path) => (
                <li key={path} className="flex items-center gap-2 font-mono">
                  <FolderOpen size={14} className="shrink-0 opacity-70" />
                  {path}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
