import { useState, lazy, Suspense } from "react";
import { Tab, Tabs } from "@heroui/react";
import { AppWindow, Cloud, FlaskConical } from "lucide-react";
import { AutostartCard } from "@features/settings/AutostartCard";
import { ConfigSection } from "@features/settings/ConfigSection";
import { CreateConfigModal } from "@features/settings/CreateConfigModal";
import { ExperimentalFeaturesCard } from "@features/settings/ExperimentalFeaturesCard";
import { LocalBackupInfoCard } from "@features/settings/LocalBackupInfoCard";
import { NotificationsCard } from "@features/settings/NotificationsCard";
import { ReleaseNotesCard } from "@features/settings/ReleaseNotesCard";
import { RestoreConfigModal } from "@features/settings/RestoreConfigModal";
import { PullFriendConfigModal } from "@/features/settings/PullFriendConfigModal";
import { UpdatesCard } from "@features/settings/UpdatesCard";
import { useSettingsPage } from "@features/settings/useSettingsPage";
import { DevSdk } from "@features/settings/DevSdk";

const ReleaseNotesDialogLazy = lazy(() =>
  import("@features/settings/ReleaseNotesDialog").then((module) => ({ default: module.ReleaseNotesDialog }))
);

export function SettingsPage() {
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string>("account");
  const {
    autostart,
    loading,
    loadingConfigData,
    testingNotification,
    exporting,
    importing,
    checkingUpdate,
    configPath,
    config,
    s3TransferEndpointType,
    createConfigModalOpen,
    createApiBaseUrl,
    createApiKey,
    createUserId,
    creatingConfig,
    createConfigError,
    pullFriendConfigModalOpen,
    pullFriendUserId,
    pullingFriendConfig,
    backingUpConfig,
    restoringConfig,
    restoreConfirmOpen,
    handleExportConfig,
    handleImportConfig,
    handleCheckUpdates,
    handleBackupConfigToCloud,
    performRestoreConfigFromCloud,
    handleTestNotification,
    handleCreateConfigFile,
    handlePullFriendConfig,
    handleAutostartChange,
    handleFullBackupStreamingChange,
    handleFullBackupStreamingDryRunChange,
    openCreateConfigModal,
    setCreateApiBaseUrl,
    setCreateApiKey,
    setCreateUserId,
    setCreateConfigModalOpen,
    setRestoreConfirmOpen,
    setPullFriendConfigModalOpen,
    setPullFriendUserId,
  } = useSettingsPage();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="mt-1 text-sm text-default-500">
          Cuenta y datos de la app, preferencias del sistema y opciones avanzadas.
        </p>
      </div>

      <Tabs
        aria-label="Secciones de configuración"
        selectedKey={settingsTab}
        onSelectionChange={(key) => setSettingsTab(String(key))}
        variant="underlined"
        color="primary"
        classNames={{
          tabList: "gap-4 w-full border-b border-default-200",
          tab: "h-11 px-0 data-[selected=true]:font-semibold",
          panel: "pt-5",
        }}>
        <Tab
          key="account"
          title={
            <span className="flex items-center gap-2">
              <Cloud size={17} className="opacity-90" />
              Cuenta y datos
            </span>
          }>
          <ConfigSection
            exporting={exporting}
            importing={importing}
            backingUpConfig={backingUpConfig}
            restoringConfig={restoringConfig}
            configPath={configPath}
            userId={config?.userId}
            s3TransferEndpointType={s3TransferEndpointType}
            isLoadingData={loadingConfigData}
            onCreateConfig={openCreateConfigModal}
            onPullFriendConfig={() => setPullFriendConfigModalOpen(true)}
            onExport={handleExportConfig}
            onImportMerge={() => handleImportConfig("merge")}
            onImportReplace={() => handleImportConfig("replace")}
            onBackupToCloud={handleBackupConfigToCloud}
            onRestoreFromCloud={() => setRestoreConfirmOpen(true)}
          />
        </Tab>

        <Tab
          key="app"
          title={
            <span className="flex items-center gap-2">
              <AppWindow size={17} className="opacity-90" />
              Aplicación
            </span>
          }>
          <div className="space-y-4">
            <AutostartCard autostart={autostart} loading={loading} onChange={handleAutostartChange} />
            <div className="grid gap-4 sm:grid-cols-2">
              <UpdatesCard checkingUpdate={checkingUpdate} onCheckUpdates={handleCheckUpdates} />
              <ReleaseNotesCard onOpenNotes={() => setReleaseNotesOpen(true)} />
            </div>
            <NotificationsCard testingNotification={testingNotification} onTestNotification={handleTestNotification} />
          </div>
        </Tab>

        <Tab
          key="advanced"
          title={
            <span className="flex items-center gap-2">
              <FlaskConical size={17} className="opacity-90" />
              Avanzado
            </span>
          }>
          <div className="space-y-4">
            <LocalBackupInfoCard />
            <ExperimentalFeaturesCard
              fullBackupStreaming={!!config?.fullBackupStreaming}
              onFullBackupStreamingChange={handleFullBackupStreamingChange}
              fullBackupStreamingDryRun={!!config?.fullBackupStreamingDryRun}
              onFullBackupStreamingDryRunChange={handleFullBackupStreamingDryRunChange}
            />
            <DevSdk />
          </div>
        </Tab>
      </Tabs>
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
      <PullFriendConfigModal
        isOpen={pullFriendConfigModalOpen}
        userId={pullFriendUserId}
        pulling={pullingFriendConfig}
        onChangeUserId={setPullFriendUserId}
        onClose={() => setPullFriendConfigModalOpen(false)}
        onSubmit={handlePullFriendConfig}
      />
      {releaseNotesOpen && (
        <Suspense fallback={null}>
          <ReleaseNotesDialogLazy isOpen={releaseNotesOpen} onClose={() => setReleaseNotesOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
