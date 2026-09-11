"use client";
// src/components/landing/use-replay-pause.ts  [UI upgrade 2 §2.1]
// "paused state persists for the visit": the hero's play/pause choice, stored in
// sessionStorage and read through `useSyncExternalStore` rather than an effect.
//
// Why not `useState` + an effect: the server has no sessionStorage, so reading it
// during render would be a hydration mismatch and reading it in an effect would
// be a setState-in-effect (which the project's lint rule rejects, correctly).
// An external store has exactly the shape React wants: a server snapshot of
// `false`, a client snapshot read once and cached, and a subscription so every
// mounted copy of the control agrees.
import { useSyncExternalStore } from "react";

const KEY = "castle:hero-replay-paused";

const listeners = new Set<() => void>();
let cached: boolean | null = null;

function read(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    // Private mode or storage disabled: the replay simply always starts playing.
    return false;
  }
}

function getSnapshot(): boolean {
  if (cached === null) cached = read();
  return cached;
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function setReplayPaused(next: boolean): void {
  cached = next;
  try {
    window.sessionStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    // The choice holds for this page, it just does not survive a navigation.
  }
  for (const listener of listeners) listener();
}

/** `true` while the visitor has the hero replay stopped. */
export function useReplayPaused(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
