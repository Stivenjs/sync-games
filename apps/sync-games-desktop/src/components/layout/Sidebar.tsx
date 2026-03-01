import type { ReactNode } from "react";

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
        <div className="sidebar__logo" aria-hidden="true">
          🎮
        </div>
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
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
