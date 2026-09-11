// src/components/board3d/__tests__/showcase.test.ts  [U3]
// The pure half of the showcase contract (docs/UI_REDESIGN §10.4). Everything else in
// the package needs a WebGL context; these two functions decide what the Canvas is
// handed, so they are worth pinning here rather than in a browser.
import { describe, expect, it } from "vitest";
import { QUALITY_TIERS } from "@/lib/camera";
import { SHOWCASE_DEFAULTS, SHOWCASE_MAX_DPR, clampDpr, resolveShowcase } from "../showcase";

describe("resolveShowcase", () => {
  it("fills every optional field with the landing hero's defaults", () => {
    expect(resolveShowcase({ roomPreset: "study" })).toEqual({
      roomPreset: "study",
      roomColors: null,
      cameraPreset: "cinematic",
      tier: "medium",
      postFx: false,
      hideControls: true,
      pauseWhenOffscreen: true,
      maxDpr: SHOWCASE_MAX_DPR,
    });
    expect(SHOWCASE_MAX_DPR).toBe(1.5);
  });

  it("keeps every value it is given, including the falsy ones", () => {
    const colors = { background: "#101010", lightSquare: "#d9b98a", darkSquare: "#7a4a22" };
    expect(
      resolveShowcase({
        roomPreset: "custom",
        roomColors: colors,
        cameraPreset: "white",
        tier: "low",
        postFx: true,
        hideControls: false,
        pauseWhenOffscreen: false,
        maxDpr: 1,
      }),
    ).toEqual({
      roomPreset: "custom",
      roomColors: colors,
      cameraPreset: "white",
      tier: "low",
      postFx: true,
      hideControls: false,
      pauseWhenOffscreen: false,
      maxDpr: 1,
    });
  });

  it("never reads a tier the quality table does not define", () => {
    expect(QUALITY_TIERS[SHOWCASE_DEFAULTS.tier]).toBeDefined();
  });
});

describe("clampDpr", () => {
  it("caps the High tier's 2x range at the showcase maximum", () => {
    expect(clampDpr(QUALITY_TIERS.high.dpr, SHOWCASE_MAX_DPR)).toEqual([1, 1.5]);
  });

  it("leaves a range that is already below the cap alone", () => {
    expect(clampDpr(QUALITY_TIERS.low.dpr, SHOWCASE_MAX_DPR)).toEqual([1, 1.25]);
  });

  it("pulls the floor down too, so a cap below 1 is honoured", () => {
    expect(clampDpr([1, 2], 0.75)).toEqual([0.75, 0.75]);
  });
});
