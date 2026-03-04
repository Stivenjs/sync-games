import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";
import {
  backupConfigToCloud,
  createConfigFile,
  exportConfigToFile,
  getConfigPath,
  importConfigFromFile,
  restoreConfigFromCloud,
  checkForUpdatesWithPrompt,
} from "@services/tauri";
import { useConfig } from "@hooks/useConfig";
import { useQueryClient } from "@tanstack/react-query";
import { toastError, toastSuccess } from "@utils/toast";
import { notifyTest } from "@utils/notification";
import { AutostartCard } from "@features/settings/AutostartCard";
import { UpdatesCard } from "@features/settings/UpdatesCard";
import { NotificationsCard } from "@features/settings/NotificationsCard";
import { ConfigSection } from "@features/settings/ConfigSection";
import { CreateConfigModal } from "@features/settings/CreateConfigModal";
import { RestoreConfigModal } from "@features/settings/RestoreConfigModal";
import { LocalBackupInfoCard } from "@features/settings/LocalBackupInfoCard";

export function SettingsPage() {
  const [autostart, setAutostart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testingNotification, setTestingNotification] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [configPath, setConfigPath] = useState<string>("");
  const [createConfigModalOpen, setCreateConfigModalOpen] = useState(false);
  const [createApiBaseUrl, setCreateApiBaseUrl] = useState("");
  const [createApiKey, setCreateApiKey] = useState("");
  const [createUserId, setCreateUserId] = useState("");
  const [creatingConfig, setCreatingConfig] = useState(false);
  const [createConfigError, setCreateConfigError] = useState<string | null>(
    null
  );
  const [backingUpConfig, setBackingUpConfig] = useState(false);
  const [restoringConfig, setRestoringConfig] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);

  const { config, refetch: refetchConfig } = useConfig();
  const queryClient = useQueryClient();

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

  const handleCheckUpdates = async () => {
    setCheckingUpdate(true);
    try {
      await checkForUpdatesWithPrompt();
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleBackupConfigToCloud = async () => {
    setBackingUpConfig(true);
    try {
      await backupConfigToCloud();
      toastSuccess(
        "Configuración respaldada",
        "Se subió config.json a la nube para este usuario."
      );
    } catch (e) {
      toastError(
        "Error al respaldar",
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      setBackingUpConfig(false);
    }
  };

  const performRestoreConfigFromCloud = async () => {
    setRestoringConfig(true);
    try {
      await restoreConfigFromCloud();
      toastSuccess(
        "Configuración restaurada",
        "Se aplicó la configuración desde la nube."
      );
      window.location.reload();
    } catch (e) {
      toastError(
        "Error al restaurar",
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      setRestoringConfig(false);
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

  useEffect(() => {
    getConfigPath().then(setConfigPath);
  }, []);

  useEffect(() => {
    if (createConfigModalOpen && config) {
      setCreateApiBaseUrl(config.apiBaseUrl ?? "");
      setCreateApiKey(config.apiKey ?? "");
      setCreateUserId(config.userId ?? "");
    }
  }, [
    createConfigModalOpen,
    config?.apiBaseUrl,
    config?.apiKey,
    config?.userId,
  ]);

  const handleCreateConfigFile = async () => {
    setCreatingConfig(true);
    setCreateConfigError(null);
    try {
      const path = await createConfigFile(
        createApiBaseUrl,
        createApiKey,
        createUserId
      );
      toastSuccess("Archivo de configuración creado", path);
      setCreateConfigModalOpen(false);
      refetchConfig?.();
      queryClient.invalidateQueries({ queryKey: ["config"] });
      const newPath = await getConfigPath();
      setConfigPath(newPath);
    } catch (e) {
      setCreateConfigError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingConfig(false);
    }
  };

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
      <AutostartCard
        autostart={autostart}
        loading={loading}
        onChange={handleAutostartChange}
      />
      <UpdatesCard
        checkingUpdate={checkingUpdate}
        onCheckUpdates={handleCheckUpdates}
      />
      <NotificationsCard
        testingNotification={testingNotification}
        onTestNotification={handleTestNotification}
      />
      <ConfigSection
        exporting={exporting}
        importing={importing}
        backingUpConfig={backingUpConfig}
        restoringConfig={restoringConfig}
        configPath={configPath}
        onCreateConfig={() => {
          setCreateConfigError(null);
          setCreateConfigModalOpen(true);
        }}
        onExport={handleExportConfig}
        onImportMerge={() => handleImportConfig("merge")}
        onImportReplace={() => handleImportConfig("replace")}
        onBackupToCloud={handleBackupConfigToCloud}
        onRestoreFromCloud={() => setRestoreConfirmOpen(true)}
      />
      <CreateConfigModal
        isOpen={createConfigModalOpen}
        apiBaseUrl={createApiBaseUrl}
        apiKey={createApiKey}
        userId={createUserId}
        error={createConfigError}
        creating={creatingConfig}
        onApiBaseUrlChange={setCreateApiBaseUrl}
        onApiKeyChange={setCreateApiKey}
        onUserIdChange={setCreateUserId}
        onClose={() => setCreateConfigModalOpen(false)}
        onSubmit={handleCreateConfigFile}
      />
      <RestoreConfigModal
        isOpen={restoreConfirmOpen}
        restoring={restoringConfig}
        onCancel={() => setRestoreConfirmOpen(false)}
        onConfirm={async () => {
          await performRestoreConfigFromCloud();
          setRestoreConfirmOpen(false);
        }}
      />
      <LocalBackupInfoCard />
    </div>
  );
}
