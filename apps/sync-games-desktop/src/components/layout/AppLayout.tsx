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
    <div className="flex min-h-screen">
      <Sidebar items={navItems} activeId={activeNavId} onSelect={onNavSelect} />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
