"use client";
// src/lib/ui/use-reveal.ts  [U0]
import { useEffect, useRef, useState } from "react";

export interface UseRevealOptions {
  /** Fraction of the element that must be visible. Default 0.15. */
  threshold?: number;
  /** Extra margin around the root box, e.g. "0px 0px -10% 0px". */
  rootMargin?: string;
  /** Skip the observer and reveal immediately (reduced motion, tests, print). */
  disabled?: boolean;
}

export interface UseRevealResult<T extends Element> {
  ref: React.RefObject<T | null>;
  revealed: boolean;
  /** Spread onto the element together with the `reveal` utility class. */
  revealProps: { "data-revealed": "true" | "false" };
}

/**
 * Reveal-once on scroll (UI_REDESIGN §1.3): pair with the `reveal` utility class
 * from globals.css, which owns the opacity/translate transition.
 */
export function useReveal<T extends Element = HTMLElement>(
  options: UseRevealOptions = {},
): UseRevealResult<T> {
  const { threshold = 0.15, rootMargin = "0px 0px -8% 0px", disabled = false } = options;
  const ref = useRef<T | null>(null);
  const [observed, setObserved] = useState(false);
  // `disabled` is a prop, so it can be resolved in render — no state to reset.
  const revealed = disabled || observed;

  useEffect(() => {
    if (revealed) return;

    // No IntersectionObserver (very old browser, some test runners): reveal on the
    // next tick rather than leaving the content invisible forever.
    if (typeof IntersectionObserver === "undefined") {
      const id = window.setTimeout(() => setObserved(true), 0);
      return () => window.clearTimeout(id);
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setObserved(true);
            observer.disconnect();
            return;
          }
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [revealed, threshold, rootMargin]);

  return { ref, revealed, revealProps: { "data-revealed": revealed ? "true" : "false" } };
}
