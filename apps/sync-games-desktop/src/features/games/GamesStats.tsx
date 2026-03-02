import { Card, CardBody, Spinner } from "@heroui/react";
import { Cloud, CloudOff, Gamepad2 } from "lucide-react";
import { formatGameDisplayName } from "@utils/gameImage";

interface GamesStatsProps {
  gamesCount: number;
  lastSyncAt: Date | null;
  /** Nombre del último juego sincronizado (opcional). */
  lastSyncGameId?: string | null;
  /** Cargando datos de última sincronización (evita mostrar "Nunca" antes de tener datos). */
  lastSyncLoading?: boolean;
}

function formatLastSync(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Hace un momento";
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours} h`;
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return date.toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function GamesStats({
  gamesCount,
  lastSyncAt,
  lastSyncGameId,
  lastSyncLoading = false,
}: GamesStatsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card className="border border-default-200">
        <CardBody className="flex flex-row items-center gap-4 py-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Gamepad2 size={24} className="text-primary" />
          </div>
          <div>
            <p className="text-sm text-default-500">Juegos configurados</p>
            <p className="text-2xl font-semibold text-foreground">
              {gamesCount}
            </p>
          </div>
        </CardBody>
      </Card>
      <Card className="border border-default-200">
        <CardBody className="flex flex-row items-center gap-4 py-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-default-100">
            {lastSyncLoading ? (
              <Spinner size="sm" color="primary" />
            ) : lastSyncAt ? (
              <Cloud size={24} className="text-primary" />
            ) : (
              <CloudOff size={24} className="text-default-500" />
            )}
          </div>
          <div>
            <p className="text-sm text-default-500">Última sincronización</p>
            <p className="text-lg font-medium text-foreground">
              {lastSyncLoading
                ? "Cargando..."
                : lastSyncAt
                ? formatLastSync(lastSyncAt)
                : "Nunca"}
            </p>
            {lastSyncAt && lastSyncGameId && (
              <p className="text-sm text-default-400">
                {formatGameDisplayName(lastSyncGameId)}
              </p>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
