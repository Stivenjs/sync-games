import { useState } from "react";
import { Card, CardBody, Spinner, Tab, Tabs } from "@heroui/react";
import { History } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { listOperationHistory, type OperationLogEntry } from "@services/tauri";
import { formatGameDisplayName } from "@utils/gameImage";
import { useNavigationStore } from "@features/input/store";
import { useRegisterGlobalBack } from "@hooks/useRegisterGlobalBack";

type HistoryFilter = "all" | OperationLogEntry["kind"];

function formatKind(kind: OperationLogEntry["kind"]): string {
  switch (kind) {
    case "upload":
      return "Subida";
    case "download":
      return "Descarga";
    case "copy_friend":
      return "Copia desde amigo";
    default:
      return kind;
  }
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

export function HistoryPage() {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const popLayer = useNavigationStore((s) => s.popLayer);
  useRegisterGlobalBack(() => {
    switch (true) {
      default:
        popLayer();
        return true;
    }
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["operation-history"],
    queryFn: listOperationHistory,
  });

  const allEntries = [...(data ?? [])].reverse();
  const entries = filter === "all" ? allEntries : allEntries.filter((e) => e.kind === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Historial de operaciones</h1>
        <span className="inline-flex h-7 items-center rounded-full bg-default-100 px-3 text-xs text-default-500">
          Subidas, descargas y copias desde amigos
        </span>
      </div>

      {!isLoading && !error && allEntries.length > 0 && (
        <Tabs
          selectedKey={filter}
          onSelectionChange={(k) => setFilter((k as HistoryFilter) ?? "all")}
          variant="underlined">
          <Tab key="all" title="Todos" />
          <Tab key="upload" title="Subidas" />
          <Tab key="download" title="Descargas" />
          <Tab key="copy_friend" title="Copia amigos" />
        </Tabs>
      )}

      {isLoading && (
        <div className="flex min-h-[20vh] flex-col items-center justify-center gap-3">
          <Spinner size="lg" color="primary" />
          <p className="text-default-500">Cargando historial...</p>
        </div>
      )}

      {error && !isLoading && (
        <Card>
          <CardBody>
            <p className="text-sm text-danger">
              No se pudo cargar el historial: {error instanceof Error ? error.message : "Error desconocido"}
            </p>
          </CardBody>
        </Card>
      )}

      {!isLoading && !error && entries.length === 0 && (
        <Card>
          <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
            <History size={40} className="text-default-400" />
            <p className="text-default-500">
              Aún no hay operaciones registradas. Cuando subas, descargues o copies guardados desde amigos, aparecerán
              aquí.
            </p>
          </CardBody>
        </Card>
      )}

      {!isLoading && !error && entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <Card key={`${entry.timestamp}-${entry.gameId}-${index}`}>
              <CardBody className="flex flex-col gap-1 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{formatKind(entry.kind)}</span>
                  <span className="text-xs text-default-500">{formatTimestamp(entry.timestamp)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-default-500">
                  <span>
                    {formatGameDisplayName(entry.gameId)}
                    <span className="ml-1 font-mono text-default-400">({entry.gameId})</span>
                  </span>
                  <span>
                    Archivos: {entry.fileCount} ok / {entry.errCount} error
                    {entry.errCount === 1 ? "" : "es"}
                  </span>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && !error && allEntries.length > 0 && entries.length === 0 && (
        <Card>
          <CardBody className="py-8 text-center text-default-500">
            No hay operaciones de este tipo en el historial.
          </CardBody>
        </Card>
      )}
    </div>
  );
}
