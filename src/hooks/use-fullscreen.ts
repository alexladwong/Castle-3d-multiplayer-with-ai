"use client";
// src/hooks/use-fullscreen.ts  [U2]
// UI_REDESIGN §5.2. A thin, feature-detected wrapper around the Fullscreen API.
//
// Two things make this more than a one-liner:
//
// 1. Safari still ships the `webkit*` spelling on both the document and the
//    element, so every entry point has a prefixed twin.
// 2. `requestFullscreen()` rejects when the call did not come from a user
//    gesture, and iOS Safari has no element fullscreen at all. The focus layout
//    (§5.2) therefore does NOT depend on real fullscreen: the caller switches
//    `layoutMode` regardless and treats `active` as a bonus.
//
// `active` is read through `useSyncExternalStore` so the server snapshot is
// `false` and the first client render matches it — nothing shifts on hydration.
import { useCallback, useSyncExternalStore } from "react";

interface PrefixedDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface PrefixedElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

/** Both spellings of the change event; browsers fire exactly one of them. */
const EVENTS = ["fullscreenchange", "webkitfullscreenchange"] as const;

function fullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  const doc = document as PrefixedDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function subscribe(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  for (const event of EVENTS) document.addEventListener(event, onChange);
  return () => {
    for (const event of EVENTS) document.removeEventListener(event, onChange);
  };
}

export interface FullscreenApi {
  /** False when neither spelling of the API exists (iPhone Safari, locked-down embeds). */
  supported: boolean;
  /** True while *something* is fullscreen. */
  active: boolean;
  /** Defaults to `document.documentElement` (§5.2). Never throws. */
  enter(element?: HTMLElement | null): Promise<void>;
  exit(): Promise<void>;
  toggle(element?: HTMLElement | null): Promise<void>;
}

export function useFullscreen(): FullscreenApi {
  const active = useSyncExternalStore(
    subscribe,
    () => fullscreenElement() !== null,
    () => false,
  );

  const supported =
    typeof document !== "undefined" &&
    ((document as PrefixedDocument).fullscreenEnabled === true ||
      (document as PrefixedDocument).webkitFullscreenEnabled === true);

  const enter = useCallback(async (element?: HTMLElement | null) => {
    const target = (element ?? document.documentElement) as PrefixedElement;
    try {
      if (typeof target.requestFullscreen === "function") {
        await target.requestFullscreen();
        return;
      }
      await target.webkitRequestFullscreen?.();
    } catch {
      // Rejected (no user gesture, or the browser simply refuses). The focus
      // layout still applies — §5.2 treats real fullscreen as an enhancement.
    }
  }, []);

  const exit = useCallback(async () => {
    if (fullscreenElement() === null) return;
    const doc = document as PrefixedDocument;
    try {
      if (typeof doc.exitFullscreen === "function") {
        await doc.exitFullscreen();
        return;
      }
      await doc.webkitExitFullscreen?.();
    } catch {
      // Already exiting, or the document lost focus. Nothing to recover.
    }
  }, []);

  const toggle = useCallback(
    async (element?: HTMLElement | null) => {
      if (fullscreenElement() !== null) await exit();
      else await enter(element);
    },
    [enter, exit],
  );

  return { supported, active, enter, exit, toggle };
}
