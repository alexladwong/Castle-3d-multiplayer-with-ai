"use client";
// src/lib/ui/use-reduced-motion.ts  [U0]
import { useCallback, useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * `true` when the OS asks for reduced motion (UI_REDESIGN §1.3).
 *
 * Server snapshot is `false` and the first client snapshot is read in the same
 * commit, so nothing shifts on hydration — a component may only use this to
 * *skip* motion, never to change layout.
 */
export function useReducedMotion(): boolean {
  const getSnapshot = useCallback(
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(QUERY).matches : false),
    [],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
