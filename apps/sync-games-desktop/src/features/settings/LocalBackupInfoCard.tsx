import { Card, CardBody } from "@heroui/react";

export function LocalBackupInfoCard() {
  return (
    <Card>
      <CardBody>
        <p className="font-medium">Respaldo local</p>
        <p className="text-sm text-default-500">
          Antes de descargar guardados desde la nube, se crea una copia de
          seguridad en la carpeta de configuración:{" "}
          <code className="rounded bg-default-100 px-1">
            sync-games/backups/[juego]/[fecha]
          </code>
        </p>
      </CardBody>
    </Card>
  );
}

