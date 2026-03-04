import { Button, Card, CardBody } from "@heroui/react";

interface NotificationsCardProps {
  testingNotification: boolean;
  onTestNotification: () => void | Promise<void>;
}

export function NotificationsCard({
  testingNotification,
  onTestNotification,
}: NotificationsCardProps) {
  return (
    <Card>
      <CardBody className="gap-4">
        <p className="font-medium">Notificaciones</p>
        <p className="text-sm text-default-500">
          Se muestran notificaciones cuando se suben guardados automáticamente
          (por ejemplo, con la app en la bandeja).
        </p>
        <Button
          size="sm"
          variant="flat"
          onPress={onTestNotification}
          isLoading={testingNotification}
        >
          Probar notificación
        </Button>
      </CardBody>
    </Card>
  );
}

