// src/components/board3d/showcase.ts  [U3]
// The additive showcase contract of docs/UI_REDESIGN.md §10.4. It lives in its own
// module — free of three, drei and "use client" — so U1 (landing) and U4 (settings
// preview) can `import type { Board3DShowcase }` without pulling the 3D chunk in.
import type { CameraPresetId, ResolvedQualityTier, RoomColors, RoomPresetId } from "@/lib/types";

/**
 * Present => the board runs in **showcase mode**: it draws itself from these values
 * instead of the ui-store, never writes the store back, and behaves like a display
 * rather than a control surface (§10.4).
 *
 * Everything but `roomPreset` is optional; the defaults below are the landing hero's.
 */
export interface Board3DShowcase {
  /** Which room to sit the board in. The only required field. */
  roomPreset: RoomPresetId;
  /** Custom square/background colours; only meaningful with `roomPreset: "custom"`. */
  roomColors?: RoomColors | null;
  /** Default `"cinematic"` — the slow idle orbit that never exits on interaction. */
  cameraPreset?: CameraPresetId;
  /** Default `"medium"`: the hero is scenery, not the game (§3). */
  tier?: ResolvedQualityTier;
  /** Default `false`. Post-processing is off in showcase unless asked for. */
  postFx?: boolean;
  /** Default `true`: no in-canvas camera overlay, and the wrapper stops being an
   *  `application` widget (there is nothing to operate). */
  hideControls?: boolean;
  /** Default `true`: `frameloop` drops to "demand" while the wrapper is off screen. */
  pauseWhenOffscreen?: boolean;
  /** Default 1.5. Caps `<Canvas dpr>` so a hero never renders at 3x on a retina laptop. */
  maxDpr?: number;
}

export type ResolvedShowcase = Required<Omit<Board3DShowcase, "roomColors">> & {
  roomColors: RoomColors | null;
};

/** §10.4: "dpr capped at maxDpr (default 1.5 in showcase)". */
export const SHOWCASE_MAX_DPR = 1.5;

export const SHOWCASE_DEFAULTS = {
  cameraPreset: "cinematic",
  tier: "medium",
  postFx: false,
  hideControls: true,
  pauseWhenOffscreen: true,
  maxDpr: SHOWCASE_MAX_DPR,
} as const satisfies Omit<ResolvedShowcase, "roomPreset" | "roomColors">;

/** Fills the optional fields in. Pure — safe to call during render. */
export function resolveShowcase(showcase: Board3DShowcase): ResolvedShowcase {
  return {
    roomPreset: showcase.roomPreset,
    roomColors: showcase.roomColors ?? null,
    cameraPreset: showcase.cameraPreset ?? SHOWCASE_DEFAULTS.cameraPreset,
    tier: showcase.tier ?? SHOWCASE_DEFAULTS.tier,
    postFx: showcase.postFx ?? SHOWCASE_DEFAULTS.postFx,
    hideControls: showcase.hideControls ?? SHOWCASE_DEFAULTS.hideControls,
    pauseWhenOffscreen: showcase.pauseWhenOffscreen ?? SHOWCASE_DEFAULTS.pauseWhenOffscreen,
    maxDpr: showcase.maxDpr ?? SHOWCASE_DEFAULTS.maxDpr,
  };
}

/**
 * `<Canvas dpr>` for a showcase board: the tier's range, with both ends pulled down to
 * `maxDpr`. Pure, and exported so the cap is testable without a WebGL context.
 */
export function clampDpr(dpr: [number, number], maxDpr: number): [number, number] {
  return [Math.min(dpr[0], maxDpr), Math.min(dpr[1], maxDpr)];
}
