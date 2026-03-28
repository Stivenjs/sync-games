import { User, Button, Divider } from "@heroui/react";
import { Copy } from "lucide-react";
import { toastSuccess } from "@utils/toast";
import type { ConnectionStatus } from "@hooks/useLastSyncInfo";
import { ConnectionStatusIndicator } from "@features/games/ConnectionStatusIndicator";

export interface UserBadgeProps {
  userId?: string | null;
  hasSyncConfig?: boolean;
  connectionStatus?: ConnectionStatus;
  /** Abre el drawer de perfil (apariencia y estadísticas). */
  onOpenProfile?: () => void;
}

export function UserBadge({ userId, hasSyncConfig, connectionStatus, onOpenProfile }: UserBadgeProps) {
  const isConfigured = !!userId?.trim();

  const handleCopy = async () => {
    if (!isConfigured) return;
    try {
      await navigator.clipboard.writeText(userId ?? "");
      toastSuccess("User ID copiado", "Puedes compartirlo con tus amigos.");
    } catch {
      // ignore
    }
  };

  const userBlock = (
    <User
      name={<span className="text-xs font-medium text-foreground">Tu ID de Sincronización</span>}
      description={
        isConfigured ? (
          <code className="font-mono text-xs text-default-500">{userId}</code>
        ) : (
          <span className="text-xs text-default-400">Sin configurar</span>
        )
      }
      avatarProps={{
        size: "sm",
        showFallback: true,
        className: "bg-primary/10 text-primary",
      }}
      className="justify-start"
    />
  );

  return (
    <div className="flex w-fit items-center gap-2 rounded-lg border border-default-200 bg-default-50 px-3 py-1.5 dark:border-default-100 dark:bg-default-50/50">
      {onOpenProfile ? (
        <Button variant="light" className="h-auto min-h-0 flex-1 justify-start gap-0 px-1 py-0" onPress={onOpenProfile}>
          {userBlock}
        </Button>
      ) : (
        userBlock
      )}

      {isConfigured && (
        <Button
          size="sm"
          variant="light"
          isIconOnly
          aria-label="Copiar User ID"
          onPress={handleCopy}
          className="-ml-1 text-default-400 hover:text-foreground">
          <Copy size={16} />
        </Button>
      )}

      {hasSyncConfig && connectionStatus && (
        <>
          <Divider orientation="vertical" className="mx-1 h-6" />
          <div className="px-1">
            <ConnectionStatusIndicator status={connectionStatus} />
          </div>
        </>
      )}
    </div>
  );
}
