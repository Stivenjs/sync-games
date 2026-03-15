import { Gamepad2, History, Info, Settings, Users } from "lucide-react";
import type { NavItem } from "@components/layout";
import { GamesPage } from "@features/games";
import { FriendsPage } from "@features/friends/FriendsPage";
import { HistoryPage } from "@features/history/HistoryPage";
import { SettingsPage } from "@features/settings";

export const NAV_ITEMS: NavItem[] = [
  { id: "games", label: "Juegos", icon: <Gamepad2 size={18} /> },
  { id: "friends", label: "Amigos", icon: <Users size={18} /> },
  { id: "history", label: "Historial", icon: <History size={18} /> },
  { id: "settings", label: "Configuración", icon: <Settings size={18} /> },
  { id: "about", label: "Acerca de", icon: <Info size={18} /> },
];

export const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: "easeOut" as const },
};

export function PageContent({ activeId }: { activeId: string }) {
  switch (activeId) {
    case "games":
      return <GamesPage />;
    case "friends":
      return <FriendsPage />;
    case "history":
      return <HistoryPage />;
    case "settings":
      return <SettingsPage />;
    default:
      return (
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-default-500">Sección en desarrollo</p>
        </div>
      );
  }
}
