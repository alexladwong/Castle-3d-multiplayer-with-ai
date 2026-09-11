"use client";
// src/components/tutor/use-tutor-surface.ts
// Which shape the tutor panel takes at this width (docs/PRO_TUTOR.md §3), read
// the hydration-safe way: the server snapshot is the desk (`column`), and the
// first client snapshot is taken in the same commit, so the game screen never
// flashes the wrong one.
import { useCallback, useSyncExternalStore } from "react";

/** `column` from 1280 (a third grid track), `overlay` from 1024, `sheet` below. */
export type TutorSurface = "column" | "overlay" | "sheet";

const COLUMN_QUERY = "(min-width: 1280px)";
const OVERLAY_QUERY = "(min-width: 1024px)";

/** Hoisted so `useSyncExternalStore` never re-subscribes. */
function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const queries = [window.matchMedia(COLUMN_QUERY), window.matchMedia(OVERLAY_QUERY)];
  for (const query of queries) query.addEventListener("change", onChange);
  return () => {
    for (const query of queries) query.removeEventListener("change", onChange);
  };
}

function read(): TutorSurface {
  if (typeof window === "undefined" || !window.matchMedia) return "column";
  if (window.matchMedia(COLUMN_QUERY).matches) return "column";
  if (window.matchMedia(OVERLAY_QUERY).matches) return "overlay";
  return "sheet";
}

export function useTutorSurface(): TutorSurface {
  const snapshot = useCallback(() => read(), []);
  return useSyncExternalStore(subscribe, snapshot, () => "column" as const);
}
