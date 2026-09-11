"use client";
// src/components/landing/use-in-view.ts  [U1]
// The small client-only signals the landing hero needs and the ui-kit does not
// have: "is this element on screen right now" (continuous, unlike `useReveal`,
// which latches once), "has the client mounted", and a media query.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const NOOP_SUBSCRIBE = () => () => {};

/**
 * `false` on the server and on the hydrating render, `true` afterwards — the
 * `ThemeToggle` pattern (§D.12 rule 6: no setState in an effect just to say
 * "mounted"). Guards anything that must not exist until the client is ready,
 * such as the hero's WebGL canvas.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    NOOP_SUBSCRIBE,
    () => true,
    () => false,
  );
}

function subscribeVisibility(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** `true` while the tab is in the foreground. */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => (typeof document === "undefined" ? true : document.visibilityState !== "hidden"),
    () => true,
  );
}

/**
 * A media query as a boolean. `false` during SSR and on the hydrating render, so
 * it may only *upgrade* an experience (a bigger quality tier, a hover affordance),
 * never change layout — that stays in CSS, where there is no hydration gap.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(query).matches
        : false,
    () => false,
  );
}

export interface UseInViewResult<T extends Element> {
  ref: React.RefObject<T | null>;
  inView: boolean;
}

/**
 * Continuous intersection state, ANDed with the tab's own visibility: the hero
 * replay runs only while a visitor could actually see it. Starts `true` so nothing
 * is gated behind an observer that has not fired yet.
 */
export function useInView<T extends Element = HTMLElement>(rootMargin = "0px"): UseInViewResult<T> {
  const ref = useRef<T | null>(null);
  const [intersecting, setIntersecting] = useState(true);
  const documentVisible = useDocumentVisible();

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setIntersecting(entry.isIntersecting);
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, inView: intersecting && documentVisible };
}
