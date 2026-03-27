import { lazy, Suspense, type ReactNode, ViewTransition } from "react";
import { Gamepad2, History, Info, Settings, Users } from "lucide-react";
import type { NavItem } from "@components/layout";
import { Routes, Route, useLocation } from "react-router-dom";
import { Spinner } from "@heroui/react";

const gameDetailImport = () => import("@features/game-detail");

const GamesPage = lazy(() => import("@features/games").then((m) => ({ default: m.GamesPage })));
const FriendsPage = lazy(() => import("@features/friends/FriendsPage").then((m) => ({ default: m.FriendsPage })));
const HistoryPage = lazy(() => import("@features/history/HistoryPage").then((m) => ({ default: m.HistoryPage })));
const SettingsPage = lazy(() => import("@features/settings").then((m) => ({ default: m.SettingsPage })));
const GameDetailPage = lazy(() => gameDetailImport().then((m) => ({ default: m.GameDetailPage })));

/** Precarga el módulo GameDetailPage (llamar en hover de GameCard) */
export const preloadGameDetail = () => {
  gameDetailImport();
};

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

function AnimatedPage({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      enter={{ "game-detail": "none", default: "page-slide" }}
      exit={{ "game-detail": "none", default: "page-slide" }}
      default="none">
      {children}
    </ViewTransition>
  );
}

export function AppRoutes() {
  const location = useLocation();

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes key={location.pathname}>
        <Route
          path="/"
          element={
            <AnimatedPage>
              <GamesPage />
            </AnimatedPage>
          }
        />
        <Route
          path="/games/:gameId"
          element={
            <AnimatedPage>
              <GameDetailPage />
            </AnimatedPage>
          }
        />
        <Route
          path="/friends"
          element={
            <AnimatedPage>
              <FriendsPage />
            </AnimatedPage>
          }
        />
        <Route
          path="/history"
          element={
            <AnimatedPage>
              <HistoryPage />
            </AnimatedPage>
          }
        />
        <Route
          path="/settings"
          element={
            <AnimatedPage>
              <SettingsPage />
            </AnimatedPage>
          }
        />
        <Route
          path="*"
          element={
            <AnimatedPage>
              <div className="flex min-h-[40vh] items-center justify-center">
                <p className="text-default-500">Sección en desarrollo</p>
              </div>
            </AnimatedPage>
          }
        />
      </Routes>
    </Suspense>
  );
}
