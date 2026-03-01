import type { ReactNode } from "react";
import { Button } from "@heroui/react";
import { Gamepad2 } from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface SidebarProps {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function Sidebar({ items, activeId, onSelect }: SidebarProps) {
  return (
    <aside className="flex w-56 flex-col border-r border-default-200 bg-default-100">
      <div className="flex items-center gap-3 border-b border-default-200 px-4 py-5">
        <Gamepad2 size={24} className="text-primary" aria-hidden />
        <span className="font-semibold text-foreground">sync-games</span>
      </div>
      <nav className="flex flex-col gap-0.5 p-2">
        {items.map((item) => (
          <Button
            key={item.id}
            variant={activeId === item.id ? "flat" : "light"}
            color={activeId === item.id ? "primary" : "default"}
            className="justify-start"
            startContent={item.icon}
            onPress={() => onSelect(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </nav>
    </aside>
  );
}
