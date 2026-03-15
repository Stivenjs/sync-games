import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppLayout, SyncProgressBar } from "@components/layout";
import { SyncProgressProvider } from "@contexts/SyncProgressContext";
import { NAV_ITEMS, PageContent, pageTransition } from "@components/navigation/PageContent";
import { TrayActionsListener } from "@components/sync/TrayActionsListener";
import { UnsyncedSavesModalWithProgress } from "@features/games";
import { useAppInitialization } from "@hooks/useAppInitialization";

import "./App.css";

function App() {
  const [activeNavId, setActiveNavId] = useState("games");

  useAppInitialization();

  return (
    <SyncProgressProvider>
      <TrayActionsListener />
      <UnsyncedSavesModalWithProgress />

      <AppLayout navItems={NAV_ITEMS} activeNavId={activeNavId} onNavSelect={setActiveNavId}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeNavId}
            initial={pageTransition.initial}
            animate={pageTransition.animate}
            exit={pageTransition.exit}
            transition={pageTransition.transition}
            className="min-h-[50vh]">
            <PageContent activeId={activeNavId} />
          </motion.div>
        </AnimatePresence>
      </AppLayout>

      <SyncProgressBar />
    </SyncProgressProvider>
  );
}

export default App;
