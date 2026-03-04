import { Button, Card, CardBody } from "@heroui/react";

interface ConfigSectionProps {
  exporting: boolean;
  importing: boolean;
  backingUpConfig: boolean;
  restoringConfig: boolean;
  configPath: string;
  onCreateConfig: () => void;
  onExport: () => void | Promise<void>;
  onImportMerge: () => void | Promise<void>;
  onImportReplace: () => void | Promise<void>;
  onBackupToCloud: () => void | Promise<void>;
  onRestoreFromCloud: () => void | Promise<void>;
}

export function ConfigSection({
  exporting,
  importing,
  backingUpConfig,
  restoringConfig,
  configPath,
  onCreateConfig,
  onExport,
  onImportMerge,
  onImportReplace,
  onBackupToCloud,
  onRestoreFromCloud,
}: ConfigSectionProps) {
  return (
    <Card>
      <CardBody className="gap-4">
        <p className="font-medium">Exportar / Importar configuración</p>
        <p className="text-sm text-default-500">
          Exporta la lista de juegos y rutas a JSON para usar en otra PC.
          Importar fusiona juegos nuevos o reemplaza toda la configuración. Si
          no tienes archivo de configuración, créalo con los datos de la API y
          aparecerán las opciones de subir a la nube.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="flat"
            color="primary"
            onPress={onCreateConfig}
          >
            Crear archivo de configuración
          </Button>
          <Button
            size="sm"
            variant="flat"
            onPress={onExport}
            isLoading={exporting}
          >
            Exportar
          </Button>
          <Button
            size="sm"
            variant="flat"
            onPress={onImportMerge}
            isLoading={importing}
          >
            Importar (fusionar)
          </Button>
          <Button
            size="sm"
            variant="flat"
            color="warning"
            onPress={onImportReplace}
            isLoading={importing}
          >
            Importar (reemplazar)
          </Button>
          <Button
            size="sm"
            variant="flat"
            color="primary"
            onPress={onBackupToCloud}
            isLoading={backingUpConfig}
          >
            Respaldar en la nube
          </Button>
          <Button
            size="sm"
            variant="flat"
            color="secondary"
            onPress={onRestoreFromCloud}
            isLoading={restoringConfig}
          >
            Restaurar desde la nube
          </Button>
        </div>
        {configPath ? (
          <div className="mt-2 rounded-md bg-default-100 p-3 text-sm">
            <p className="font-medium text-default-700">
              Ruta del archivo de configuración
            </p>
            <p className="mt-1 break-all font-mono text-default-600">
              {configPath}
            </p>
            <p className="mt-2 text-default-500">
              La app solo lee{" "}
              <code className="rounded px-1 bg-default-200">config.json</code>{" "}
              desde esta ruta. Si te enviaron un JSON, usa &quot;Importar
              (reemplazar)&quot; arriba para cargarlo aquí. El JSON debe tener{" "}
              <code className="rounded px-1 bg-default-200">apiBaseUrl</code>,{" "}
              <code className="rounded px-1 bg-default-200">userId</code> y{" "}
              <code className="rounded px-1 bg-default-200">apiKey</code> (en
              camelCase) para que aparezcan las opciones de subir a la nube.
            </p>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

