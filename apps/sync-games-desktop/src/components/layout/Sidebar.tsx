import type { ReactNode } from "react";
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
    <aside className="sidebar">
      <div className="sidebar__brand">
        <Gamepad2 className="sidebar__logo" size={24} aria-hidden="true" />
        <span className="sidebar__title">sync-games</span>
      </div>
      <nav className="sidebar__nav">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar__item ${
              activeId === item.id ? "sidebar__item--active" : ""
            }`}
            onClick={() => onSelect(item.id)}
          >
            {item.icon ?? null}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
