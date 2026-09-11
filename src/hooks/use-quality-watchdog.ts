// src/hooks/use-quality-watchdog.ts
// FR-31 / §E.10 step 4. `<PerformanceMonitor ms={500} iterations={10} bounds={() => [30, 55]}>`
// is exactly the required window: 10 samples x 500 ms = 5 s below 30 fps -> drop one tier.
//
// `onFallback` is deliberately NOT wired: drei increments `api.flipped` on the INCLINE
// branch as well as the decline one, so a machine holding a perfect 60 fps trips the
// fallback after a handful of windows and would silently collapse High -> Low. The
// monitor is left on its `flipflops = Infinity` default and only `onDecline` drops a tier.
//
// PerformanceMonitor keeps its sample state in a `useState` initialiser, so the caller
// re-mounts it with the returned `key` whenever the tier changes.
"use client";
import { useCallback, useRef } from "react";
import { useUiStore } from "@/lib/stores/ui-store";
import type { ResolvedQualityTier } from "@/lib/types";

/** Never drop more than one tier per this many ms — a tier switch itself costs a hitch. */
const COOLDOWN_MS = 8_000;

export interface QualityWatchdog {
  /** Re-mount key for <PerformanceMonitor>; changes whenever the tier changes. */
  key: ResolvedQualityTier;
  tier: ResolvedQualityTier;
  onDecline(): void;
}

export function useQualityWatchdog(): QualityWatchdog {
  const tier = useUiStore((state) => state.resolvedTier);
  const lastDropAt = useRef(0);

  const drop = useCallback(() => {
    const now = Date.now();
    if (now - lastDropAt.current < COOLDOWN_MS) return;
    const store = useUiStore.getState();
    if (store.resolvedTier === "low") return;
    lastDropAt.current = now;
    store.degradeTier();
  }, []);

  return { key: tier, tier, onDecline: drop };
}
