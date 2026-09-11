// src/lib/webgl.ts
// FR-19 / NFR-2 / §E.10. three r185 is WebGL2-only and fiber's <Canvas> swallows a
// renderer-constructor throw into an unhandled rejection — the `fallback` prop does NOT
// cover it. So probe BEFORE mounting the Canvas and fall back to Board2D when this says no.
//
// Browser-only: every entry point returns the "unavailable" answer on the server instead of
// throwing, so it is safe to import from a module that is also evaluated during SSR.
import type { RenderFailureReason } from "./types";

export interface WebglProbe {
  ok: boolean;
  /** Why 3D is unavailable; null when `ok`. */
  reason: RenderFailureReason | null;
  /** True when WebGL2 exists but only through a software / heavily-degraded path. */
  majorPerformanceCaveat: boolean;
}

const UNAVAILABLE: WebglProbe = {
  ok: false,
  reason: "webgl-unavailable",
  majorPerformanceCaveat: false,
};

function releaseContext(gl: WebGL2RenderingContext): void {
  // Browsers cap the number of live WebGL contexts (~16). The probe context is
  // disposable, so hand it back immediately rather than waiting for GC.
  try {
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  } catch {
    // Losing the probe context is best-effort; never let it break the probe result.
  }
}

/**
 * Run the full probe. Client-only; returns `UNAVAILABLE` during SSR.
 *
 * Distinguishes three outcomes:
 *  - WebGL2 with `failIfMajorPerformanceCaveat: true`  -> ok
 *  - WebGL2 only without that flag                     -> "low-end-gpu" (software renderer)
 *  - no WebGL2 at all                                  -> "webgl-unavailable"
 */
export function probeWebgl(): WebglProbe {
  if (typeof window === "undefined" || typeof document === "undefined") return UNAVAILABLE;

  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement("canvas");
  } catch {
    return UNAVAILABLE;
  }

  try {
    const strict = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (strict) {
      releaseContext(strict);
      return { ok: true, reason: null, majorPerformanceCaveat: false };
    }

    const lenient = canvas.getContext("webgl2");
    if (lenient) {
      releaseContext(lenient);
      // WebGL2 exists but the UA warned us about it (llvmpipe/SwiftShader, blocklisted GPU…).
      return { ok: false, reason: "low-end-gpu", majorPerformanceCaveat: true };
    }
  } catch {
    return UNAVAILABLE;
  }

  return UNAVAILABLE;
}

/** The one-line answer used by the game shell before mounting <Canvas>. */
export function canUse3D(): boolean {
  return probeWebgl().ok;
}

/** Human-readable copy for the FR-19 toast. */
export function renderFailureMessage(reason: RenderFailureReason): string {
  switch (reason) {
    case "webgl-unavailable":
      return "3D needs WebGL2, which this browser does not provide. Showing the 2D board instead.";
    case "low-end-gpu":
      return "This device has no hardware-accelerated 3D. Showing the 2D board instead.";
    case "context-lost":
      return "The 3D view lost its graphics context. Switched to the 2D board.";
  }
}
