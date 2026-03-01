import type { ReactNode } from "react";
import { Sidebar, type NavItem } from "@components/layout/Sidebar";

interface AppLayoutProps {
  navItems: NavItem[];
  activeNavId: string;
  onNavSelect: (id: string) => void;
  children: ReactNode;
}

export function AppLayout({
  navItems,
  activeNavId,
  onNavSelect,
  children,
}: AppLayoutProps) {
  return (
    <div className="app-layout">
      <Sidebar items={navItems} activeId={activeNavId} onSelect={onNavSelect} />
      <main className="app-layout__main">{children}</main>
    </div>
  );
}
