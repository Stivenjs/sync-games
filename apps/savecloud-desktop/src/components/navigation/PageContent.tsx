import { lazy, Suspense } from "react";
import { Gamepad2, History, Info, Settings, Users } from "lucide-react";
import type { NavItem } from "@components/layout";
import { Routes, Route } from "react-router-dom";
import { Spinner } from "@heroui/react";

const GamesPage = lazy(() => import("@features/games").then((m) => ({ default: m.GamesPage })));
const FriendsPage = lazy(() => import("@features/friends/FriendsPage").then((m) => ({ default: m.FriendsPage })));
const HistoryPage = lazy(() => import("@features/history/HistoryPage").then((m) => ({ default: m.HistoryPage })));
const SettingsPage = lazy(() => import("@features/settings").then((m) => ({ default: m.SettingsPage })));

export const NAV_ITEMS: NavItem[] = [
  { id: "/", label: "Juegos", icon: <Gamepad2 size={18} /> },
  { id: "/friends", label: "Amigos", icon: <Users size={18} /> },
  { id: "/history", label: "Historial", icon: <History size={18} /> },
  { id: "/settings", label: "Configuración", icon: <Settings size={18} /> },
  { id: "/about", label: "Acerca de", icon: <Info size={18} /> },
];

const PageLoader = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <Spinner size="lg" color="primary" label="Cargando..." />
  </div>
);

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<GamesPage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route
          path="*"
          element={
            <div className="flex min-h-[40vh] items-center justify-center">
              <p className="text-default-500">Sección en desarrollo</p>
            </div>
          }
        />
      </Routes>
    </Suspense>
  );
}
