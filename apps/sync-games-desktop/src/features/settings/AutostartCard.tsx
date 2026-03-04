import { Card, CardBody, Switch } from "@heroui/react";

interface AutostartCardProps {
  autostart: boolean;
  loading: boolean;
  onChange: (checked: boolean) => void;
}

export function AutostartCard({
  autostart,
  loading,
  onChange,
}: AutostartCardProps) {
  return (
    <Card>
      <CardBody className="gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">Iniciar con Windows</p>
              <p className="text-sm text-default-500">
                Abrir sync-games automáticamente al iniciar sesión en el equipo
              </p>
            </div>
            <Switch
              isSelected={autostart}
              onValueChange={onChange}
              isDisabled={loading}
            />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

