import { useEffect, useState } from "react";
import { Button, Card, CardBody, Switch } from "@heroui/react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";
import { exportConfigToFile, importConfigFromFile } from "@services/tauri";
import { toastError, toastSuccess } from "@utils/toast";
import { notifyTest } from "@utils/notification";

export function SettingsPage() {
  const [autostart, setAutostart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testingNotification, setTestingNotification] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExportConfig = async () => {
    setExporting(true);
    try {
      const path = await save({
        title: "Exportar configuración",
        defaultPath: "sync-games-config.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (path) {
        await exportConfigToFile(path);
        toastSuccess("Configuración exportada", path);
      }
    } catch (e) {
      toastError(
        "Error al exportar",
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      setExporting(false);
    }
  };

  const handleImportConfig = async (mode: "merge" | "replace") => {
    setImporting(true);
    try {
      const path = await open({
        title: "Importar configuración",
        directory: false,
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (path && typeof path === "string") {
        await importConfigFromFile(path, mode);
        toastSuccess(
          "Configuración importada",
          mode === "merge" ? "Juegos fusionados" : "Configuración reemplazada"
        );
        window.location.reload();
      }
    } catch (e) {
      toastError(
        "Error al importar",
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      setImporting(false);
    }
  };

  const handleTestNotification = async () => {
    setTestingNotification(true);
    try {
      const ok = await notifyTest();
      if (!ok) {
        alert(
          "Los permisos para notificaciones no están concedidos. Revisa la configuración del sistema."
        );
      }
    } finally {
      setTestingNotification(false);
    }
  };

  useEffect(() => {
    isEnabled()
      .then(setAutostart)
      .finally(() => setLoading(false));
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
                  Abrir sync-games automáticamente al iniciar sesión en el
                  equipo
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
            onPress={handleTestNotification}
            isLoading={testingNotification}
          >
            Probar notificación
          </Button>
        </CardBody>
      </Card>
      <Card>
        <CardBody className="gap-4">
          <p className="font-medium">Exportar / Importar configuración</p>
          <p className="text-sm text-default-500">
            Exporta la lista de juegos y rutas a JSON para usar en otra PC.
            Importar fusiona juegos nuevos o reemplaza toda la configuración.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="flat"
              onPress={handleExportConfig}
              isLoading={exporting}
            >
              Exportar
            </Button>
            <Button
              size="sm"
              variant="flat"
              onPress={() => handleImportConfig("merge")}
              isLoading={importing}
            >
              Importar (fusionar)
            </Button>
            <Button
              size="sm"
              variant="flat"
              color="warning"
              onPress={() => handleImportConfig("replace")}
              isLoading={importing}
            >
              Importar (reemplazar)
            </Button>
          </div>
        </CardBody>
      </Card>
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
    </div>
  );
}
