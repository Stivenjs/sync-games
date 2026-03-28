import { create } from "zustand";

interface ShellUiStore {
  /** Contador: cada incremento dispara un toggle del menú lateral (StaggeredMenu). */
  staggeredMenuToggleRequest: number;
  /** Contador: cada incremento pide abrir el drawer de perfil (GamesPage). */
  profileOpenRequest: number;
  requestStaggeredMenuToggle: () => void;
  requestProfileOpen: () => void;
}

export const useShellUiStore = create<ShellUiStore>((set) => ({
  staggeredMenuToggleRequest: 0,
  profileOpenRequest: 0,
  requestStaggeredMenuToggle: () => set((s) => ({ staggeredMenuToggleRequest: s.staggeredMenuToggleRequest + 1 })),
  requestProfileOpen: () => set((s) => ({ profileOpenRequest: s.profileOpenRequest + 1 })),
}));
