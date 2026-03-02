import { useEffect, useState } from "react";
import { Card, CardBody, Switch } from "@heroui/react";
import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";

export function SettingsPage() {
  const [autostart, setAutostart] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    isEnabled().then(setAutostart).finally(() => setLoading(false));
  }, []);

  const handleAutostartChange = async (checked: boolean) => {
    try {
      if (checked) {
        await enable();
      } else {
        await disable();
      }
      setAutostart(checked);
    } catch (e) {
      console.error("Error al cambiar autostart:", e);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Configuración</h1>
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
                onValueChange={handleAutostartChange}
                isDisabled={loading}
              />
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
