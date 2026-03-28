import { createContext, useContext, type RefObject } from "react";

/** Ref al `<main>` con `overflow-auto` — necesario para `useScroll({ container })` en Framer Motion. */
export const ScrollContainerRefContext = createContext<RefObject<HTMLElement | null> | null>(null);

export function useScrollContainerRef() {
  return useContext(ScrollContainerRefContext);
}
