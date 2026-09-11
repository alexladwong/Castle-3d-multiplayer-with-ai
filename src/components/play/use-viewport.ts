"use client";
// src/components/play/use-viewport.ts  [U5]
// The lobby's own media-query hook. `useSyncExternalStore` rather than an effect:
// the server snapshot is a hard `false`, so the table preview's <Canvas> can never
// be part of the hydrating render, and there is no flash of a mounted-then-removed
// WebGL context on a phone.
import { useCallback, useSyncExternalStore } from "react";

const EMPTY = () => () => {};

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return EMPTY();
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** §3.1/§3.3: the table preview exists from 1024px up and is not mounted below it. */
export const DESKTOP_QUERY = "(min-width: 1024px)";
