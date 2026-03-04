import { Button, Card, CardBody } from "@heroui/react";

interface UpdatesCardProps {
  checkingUpdate: boolean;
  onCheckUpdates: () => void | Promise<void>;
}

export function UpdatesCard({
  checkingUpdate,
  onCheckUpdates,
}: UpdatesCardProps) {
  return (
    <Card>
      <CardBody className="gap-4">
        <p className="font-medium">Actualizaciones</p>
        <p className="text-sm text-default-500">
          Comprueba si hay una nueva versión disponible e instálala.
        </p>
        <Button
          size="sm"
          variant="flat"
          onPress={onCheckUpdates}
          isLoading={checkingUpdate}
        >
          Buscar actualizaciones
        </Button>
      </CardBody>
    </Card>
  );
}

