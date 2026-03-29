import { useCallback, useState } from "react";
import { Spinner, Tab, Tabs } from "@heroui/react";
import type { ConfiguredGame } from "@app-types/config";
import { useFriendsPage } from "@features/friends/useFriendsPage";
import { AddFriendGamesModal } from "@features/friends/AddFriendGamesModal";
import { FriendGameTemplateModal } from "@features/friends/FriendGameTemplateModal";
import { FriendGamesSection } from "@features/friends/FriendGamesSection";
import { FriendProfileCard } from "@features/friends/FriendProfileCard";
import { ShareLinkCard } from "@features/friends/ShareLinkCard";
import { ShareLinkImportConfirmModal } from "@features/friends/ShareLinkImportConfirmModal";
import { CopyFriendSavesConfirmModal } from "@features/friends/CopyFriendSavesConfirmModal";
import { useNavigationStore } from "@features/input/store";
import { useRegisterGlobalBack } from "@hooks/useRegisterGlobalBack";

type FriendsTabKey = "link" | "user";

export function FriendsPage() {
  const [friendsTab, setFriendsTab] = useState<FriendsTabKey>("link");
  const popLayer = useNavigationStore((s) => s.popLayer);
  const {
    friendIdInput,
    setFriendIdInput,
    loading,
    error,
    friendConfig,
    summaries,
    copyingGameId,
    ourGameIds,
    templateGame,
    setTemplateGame,
    templateOpen,
    setTemplateOpen,
    addFriendGamesOpen,
    setAddFriendGamesOpen,
    shareLinkInput,
    setShareLinkInput,
    shareLinkLoading,
    shareLinkPreview,
    setShareLinkPreview,
    shareLinkConfirmLoading,
    copyConfirmPreview,
    setCopyConfirmPreview,
    handleConfirmCopySaves,
    ourConfig,
    handleLoadFriend,
    handleImportFromShareLink,
    handleConfirmShareLinkImport,
    handleCopySaves,
    invalidateConfig,
  } = useFriendsPage();

  const handleAddGamesPress = useCallback(() => setAddFriendGamesOpen(true), [setAddFriendGamesOpen]);
  const handleUseAsTemplate = useCallback((game: ConfiguredGame) => setTemplateGame(game), [setTemplateGame]);

  useRegisterGlobalBack(() => {
    switch (true) {
      case !!copyConfirmPreview:
        setCopyConfirmPreview(null);
        return true;
      case !!shareLinkPreview:
        setShareLinkPreview(null);
        return true;
      case templateOpen:
        setTemplateOpen(false);
        setTemplateGame(null);
        return true;
      case addFriendGamesOpen:
        setAddFriendGamesOpen(false);
        return true;
      default:
        popLayer();
        return true;
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Amigos</h1>
          <span className="inline-flex h-7 items-center rounded-full bg-default-100 px-3 text-xs text-default-500">
            Importar desde link o ver perfil por User ID
          </span>
        </div>
        <p className="max-w-3xl text-sm text-default-600">
          Usa <strong className="text-foreground">Importar por link</strong> si te pasaron un enlace de compartir, o{" "}
          <strong className="text-foreground">Buscar por User ID</strong> para cargar el perfil de un amigo de
          confianza.
        </p>
      </div>

      <Tabs
        selectedKey={friendsTab}
        onSelectionChange={(k) => setFriendsTab((String(k) as FriendsTabKey) || "link")}
        variant="underlined"
        classNames={{ panel: "pt-4" }}>
        <Tab key="link" title="Importar por link">
          <ShareLinkCard
            shareLinkInput={shareLinkInput}
            onShareLinkChange={setShareLinkInput}
            onImportPress={handleImportFromShareLink}
            loading={shareLinkLoading}
            disabled={!ourConfig?.apiBaseUrl?.trim()}
          />
        </Tab>
        <Tab key="user" title="Buscar por User ID">
          <FriendProfileCard
            friendIdInput={friendIdInput}
            onFriendIdChange={setFriendIdInput}
            onLoadPress={handleLoadFriend}
            loading={loading}
            error={error}
          />
        </Tab>
      </Tabs>

      {loading ? (
        <div className="flex min-h-[20vh] flex-col items-center justify-center gap-3">
          <Spinner size="lg" color="primary" />
          <p className="text-default-500">Cargando perfil del amigo...</p>
        </div>
      ) : null}

      {friendConfig && !loading ? (
        <FriendGamesSection
          userIdDisplay={friendConfig.userId ?? "(sin userId en config)"}
          summaries={summaries}
          copyingGameId={copyingGameId}
          onAddGamesPress={handleAddGamesPress}
          onCopySaves={handleCopySaves}
          onUseAsTemplate={handleUseAsTemplate}
        />
      ) : null}

      <AddFriendGamesModal
        isOpen={addFriendGamesOpen}
        onClose={() => setAddFriendGamesOpen(false)}
        friendGames={friendConfig?.games ?? []}
        ourGameIds={ourGameIds}
        onAdded={invalidateConfig}
      />
      <FriendGameTemplateModal isOpen={templateOpen} game={templateGame} onClose={() => setTemplateOpen(false)} />

      <ShareLinkImportConfirmModal
        isOpen={!!shareLinkPreview}
        onClose={() => setShareLinkPreview(null)}
        gameId={shareLinkPreview?.gameId ?? ""}
        gameDisplayName={shareLinkPreview?.gameName}
        files={shareLinkPreview?.files ?? []}
        onConfirm={handleConfirmShareLinkImport}
        isLoading={shareLinkConfirmLoading}
      />

      <CopyFriendSavesConfirmModal
        isOpen={!!copyConfirmPreview}
        onClose={() => setCopyConfirmPreview(null)}
        gameId={copyConfirmPreview?.gameId ?? ""}
        gameDisplayName={copyConfirmPreview?.gameDisplayName}
        items={
          copyConfirmPreview?.plan.map((p) => ({
            filename: p.filename,
            targetFilename: p.targetFilename,
          })) ?? []
        }
        newCount={copyConfirmPreview?.newCount ?? 0}
        conflictCount={copyConfirmPreview?.conflictCount ?? 0}
        onConfirm={handleConfirmCopySaves}
        isLoading={copyConfirmPreview ? copyingGameId === copyConfirmPreview.gameId : false}
      />
    </div>
  );
}
