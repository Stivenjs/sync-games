import { useState } from "react";
import { AppLayout, type NavItem } from "@components/layout";
import { GamesPage } from "@features/games";
import "./App.css";

const NAV_ITEMS: NavItem[] = [
  { id: "games", label: "Juegos" },
  // Más secciones: Añadir, Subir, Descargar, Config...
];

function PageContent({ activeId }: { activeId: string }) {
  switch (activeId) {
    case "games":
      return <GamesPage />;
    default:
      return (
        <div className="page page--center">
          <p className="page__muted">Sección en desarrollo</p>
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
