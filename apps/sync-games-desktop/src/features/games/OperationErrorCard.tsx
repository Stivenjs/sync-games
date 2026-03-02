import { Card, CardBody } from "@heroui/react";
import type { OperationResult } from "@features/games/useGamesPage";

interface OperationErrorCardProps {
  operationResult: OperationResult;
}

export function OperationErrorCard({
  operationResult,
}: OperationErrorCardProps) {
  const { type, result } = operationResult;
  const hasErrors = result.errors.length > 0;

  if (!hasErrors) return null;

  const title =
    type === "sync" ? "Errores de sincronización" : "Errores de descarga";

  return (
    <Card className="mt-6 border border-danger-200 bg-danger-50/30 dark:border-danger-800 dark:bg-danger-900/20">
      <CardBody>
        <h3 className="mb-3 font-medium text-foreground">{title}</h3>
        <ul className="list-inside list-disc text-sm text-default-600">
          {result.errors.slice(0, 5).map((err, i) => (
            <li key={i}>{err}</li>
          ))}
          {result.errors.length > 5 && (
            <li>… y {result.errors.length - 5} más</li>
          )}
        </ul>
      </CardBody>
    </Card>
  );
}
