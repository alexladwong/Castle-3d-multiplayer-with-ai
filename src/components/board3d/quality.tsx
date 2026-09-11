// src/components/board3d/quality.tsx
// The frame-time watchdog and the resolution-scaling wiring, mounted inside <Canvas>.
"use client";
import { Suspense, useCallback, useEffect } from "react";
import { PerformanceMonitor, useDetectGPU } from "@react-three/drei";
import type { QualityWatchdog } from "@/hooks/use-quality-watchdog";
import { useUiStore } from "@/lib/stores/ui-store";

/** FR-31: 10 iterations x 500 ms = a 5 s window under 30 fps before a tier is dropped. */
const BOUNDS = (): [number, number] => [30, 55];

/**
 * FR-31 (tier drop) + FR-32 (resolution scaling).
 *
 * `flipflops`/`onFallback` are left at their defaults on purpose — see
 * use-quality-watchdog.ts: drei counts an INCLINE as a flip-flop too, so wiring
 * `onFallback` to the tier drop degrades a machine that is running perfectly.
 *
 * drei's <AdaptiveDpr> is not mounted either: it only reacts to
 * `state.performance.current`, which nothing in this app ever regresses, so it could
 * never scale the resolution. The same fps window drives the dpr instead — and it does so
 * by asking the OWNER of the `<Canvas dpr>` prop to change it, because fiber re-applies
 * that prop on every configure() and would undo a bare `setDpr()` on the next render.
 */
export interface QualityWatchdogProps {
  watchdog: QualityWatchdog;
  /** Below the lower fps bound: drop to the tier's `maxPixelRatioOnRegress`. */
  onRegressDpr(): void;
  /** Comfortably above the upper bound again: hand the resolution back. */
  onRestoreDpr(): void;
}

export function QualityWatchdog({
  watchdog,
  onRegressDpr,
  onRestoreDpr,
}: QualityWatchdogProps) {
  const drop = watchdog.onDecline;
  const onDecline = useCallback(() => {
    onRegressDpr();
    drop();
  }, [drop, onRegressDpr]);

  return (
    <PerformanceMonitor
      key={watchdog.key}
      ms={500}
      iterations={10}
      threshold={0.75}
      bounds={BOUNDS}
      onDecline={onDecline}
      onIncline={onRestoreDpr}
    />
  );
}

/**
 * FR-31 auto-selection (§E.10 step 3). `useDetectGPU` suspends, so it lives behind its
 * own <Suspense> and is mounted OUTSIDE the Canvas — it needs no fiber context, and a
 * slow GPU-benchmark lookup must never hold up the first frame.
 *
 * `autoDetectTier` is a no-op unless the player left the quality setting on "auto".
 */
function AutoTierProbeInner() {
  const gpu = useDetectGPU();

  useEffect(() => {
    useUiStore.getState().autoDetectTier({
      hardwareConcurrency: navigator.hardwareConcurrency || 4,
      devicePixelRatio: window.devicePixelRatio || 1,
      gpuTier: gpu.tier,
      isMobile: gpu.isMobile ?? false,
    });
  }, [gpu]);

  return null;
}

export function AutoTierProbe() {
  return (
    <Suspense fallback={null}>
      <AutoTierProbeInner />
    </Suspense>
  );
}
