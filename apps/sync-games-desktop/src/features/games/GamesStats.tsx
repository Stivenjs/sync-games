import {
  Button,
  Card,
  CardBody,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  useDisclosure,
} from "@heroui/react";
import { Cloud, CloudOff, Gamepad2, HardDrive, Info } from "lucide-react";
import { formatGameDisplayName } from "@utils/gameImage";
import { formatSize } from "@utils/format";
import type { CloudGameSummary } from "@hooks/useLastSyncInfo";

interface GamesStatsProps {
  gamesCount: number;
  lastSyncAt: Date | null;
  /** Nombre del último juego sincronizado (opcional). */
  lastSyncGameId?: string | null;
  /** Cargando datos de última sincronización / nube. */
  lastSyncLoading?: boolean;
  /** Si hay config de sync, mostrar card y detalle de la nube. */
  hasSyncConfig?: boolean;
  /** Juegos en la nube con conteo y tamaño (solo si hasSyncConfig). */
  cloudGames?: CloudGameSummary[];
  /** Tamaño total en la nube en bytes. */
  totalCloudSize?: number;
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
  hasSyncConfig = false,
  cloudGames = [],
  totalCloudSize = 0,
}: GamesStatsProps) {
  const showCloudSection = hasSyncConfig;
  const hasCloudGames = cloudGames.length > 0;
  const useModal = cloudGames.length > 8;
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const cloudDetailContent = (
    <ul className="space-y-2">
      {cloudGames.map((g) => (
        <li
          key={g.gameId}
          className="flex items-center justify-between rounded-lg bg-default-100 px-3 py-2"
        >
          <span className="truncate text-sm font-medium text-foreground">
            {formatGameDisplayName(g.gameId)}
          </span>
          <span className="ml-2 shrink-0 text-xs text-default-500">
            {g.fileCount} archivo{g.fileCount !== 1 ? "s" : ""} ·{" "}
            {formatSize(g.totalSize)}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        {showCloudSection && (
          <Card className="border border-default-200">
            <CardBody className="flex flex-row items-center gap-4 py-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/10">
                <HardDrive size={24} className="text-secondary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-default-500">En la nube</p>
                <p className="text-lg font-medium text-foreground">
                  {lastSyncLoading
                    ? "Cargando..."
                    : hasCloudGames
                    ? `${cloudGames.length} juego${
                        cloudGames.length !== 1 ? "s" : ""
                      } · ${formatSize(totalCloudSize)}`
                    : "Vacío"}
                </p>
              </div>
              {hasCloudGames &&
                (useModal ? (
                  <>
                    <button
                      type="button"
                      onClick={onOpen}
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-default-400 transition-colors hover:bg-default-100 hover:text-foreground"
                      aria-label="Ver detalle de guardados en la nube"
                    >
                      <Info size={18} />
                    </button>
                    <Modal
                      isOpen={isOpen}
                      onOpenChange={onOpenChange}
                      size="2xl"
                      scrollBehavior="inside"
                    >
                      <ModalContent>
                        <ModalHeader>
                          <p className="text-lg font-medium">
                            Guardados en la nube ({cloudGames.length} juegos)
                          </p>
                        </ModalHeader>
                        <ModalBody>
                          <div className="max-h-[60vh] overflow-y-auto">
                            {cloudDetailContent}
                          </div>
                        </ModalBody>
                        <ModalFooter>
                          <Button
                            color="primary"
                            onPress={() => onOpenChange()}
                          >
                            Cerrar
                          </Button>
                        </ModalFooter>
                      </ModalContent>
                    </Modal>
                  </>
                ) : (
                  <Popover placement="bottom" showArrow>
                    <PopoverTrigger>
                      <button
                        type="button"
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-default-400 transition-colors hover:bg-default-100 hover:text-foreground"
                        aria-label="Ver detalle de guardados en la nube"
                      >
                        <Info size={18} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0">
                      <div className="border-b border-default-200 px-4 py-3">
                        <p className="text-sm font-medium text-foreground">
                          Guardados en la nube
                        </p>
                      </div>
                      <div className="max-h-72 overflow-y-auto p-3">
                        {cloudDetailContent}
                      </div>
                    </PopoverContent>
                  </Popover>
                ))}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
