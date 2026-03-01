import { useState } from "react";
import { Gamepad2 } from "lucide-react";
import { AppLayout, type NavItem } from "@components/layout";
import { GamesPage } from "@features/games";
import "./App.css";

const NAV_ITEMS: NavItem[] = [
  { id: "games", label: "Juegos", icon: <Gamepad2 size={18} /> },
  // Más secciones: Añadir, Subir, Descargar, Config...
];

function PageContent({ activeId }: { activeId: string }) {
  switch (activeId) {
    case "games":
      return <GamesPage />;
    default:
      return (
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-default-500">Sección en desarrollo</p>
        </div>
      );
  }
}

function App() {
  const [activeNavId, setActiveNavId] = useState("games");

  return (
    <AppLayout
      navItems={NAV_ITEMS}
      activeNavId={activeNavId}
      onNavSelect={setActiveNavId}
    >
      <PageContent activeId={activeNavId} />
    </AppLayout>
  );
}

export default App;
