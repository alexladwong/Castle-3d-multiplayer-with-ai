// @vitest-environment node
// src/lib/tutor/__tests__/annotation-geometry.test.ts
// The arrow maths both boards share (docs/PRO_TUTOR.md §4 / §8). If these numbers are
// wrong the 2D layer and the 3D meshes are wrong together, which is exactly why they
// live in one pure module.
import { describe, expect, it } from "vitest";

import {
  ARROW_HEAD_LENGTH,
  ARROW_HEAD_WIDTH,
  ARROW_START_INSET,
  ARROW_STROKE,
  LINE_BADGE_OFFSET,
  annotationsKey,
  arrowBetween,
  arrowPolygon,
  badgePoint,
  lineStepOpacity,
  squareCentre2d,
  squareCentre3d,
} from "../annotations";

describe("squareCentre2d", () => {
  it("puts a1 in the bottom-left corner from White's seat and top-right from Black's", () => {
    expect(squareCentre2d("a1", "w")).toEqual({ x: 0.5, y: 7.5 });
    expect(squareCentre2d("a1", "b")).toEqual({ x: 7.5, y: 0.5 });
    expect(squareCentre2d("h8", "w")).toEqual({ x: 7.5, y: 0.5 });
  });
});

describe("squareCentre3d", () => {
  it("flattens the world frame into the highlight group's plane (x, -z)", () => {
    // a1 is [-3.5, 0, 3.5] in world units; the group is rotated so -z becomes +y.
    expect(squareCentre3d("a1")).toEqual({ x: -3.5, y: -3.5 });
    expect(squareCentre3d("h8")).toEqual({ x: 3.5, y: 3.5 });
  });

  it("does not care about orientation — in 3D the camera moves, the board does not", () => {
    expect(squareCentre3d("e4")).toEqual(squareCentre3d("e4"));
  });
});

describe("arrowBetween", () => {
  it("lands the head's tip on the target square's centre", () => {
    const arrow = arrowBetween({ x: 0.5, y: 0.5 }, { x: 0.5, y: 4.5 });
    expect(arrow.tipX).toBe(0.5);
    expect(arrow.tipY).toBe(4.5);
    expect(arrow.y1).toBeCloseTo(0.5 + ARROW_START_INSET, 6);
    expect(arrow.y2).toBeCloseTo(4.5 - ARROW_HEAD_LENGTH, 6);
    expect(arrow.length).toBe(4);
  });

  it("keeps the shaft pointing forwards on a one-square arrow", () => {
    const arrow = arrowBetween({ x: 0.5, y: 0.5 }, { x: 1.5, y: 0.5 });
    expect(arrow.x2).toBeGreaterThan(arrow.x1);
    expect(arrow.tipX).toBe(1.5);
    // The head keeps its length (it is what carries the direction); the start inset
    // gives way instead of the shaft inverting.
    expect(arrow.x2).toBeCloseTo(1.5 - ARROW_HEAD_LENGTH, 6);
  });

  it("never lets the head eat more than half of a very short arrow", () => {
    const arrow = arrowBetween({ x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 });
    expect(arrow.x2 - arrow.x1).toBeGreaterThanOrEqual(0);
    expect(arrow.tipX - arrow.x2).toBeCloseTo(0.2, 6);
  });

  it("reports a zero length for an arrow to its own square", () => {
    expect(arrowBetween({ x: 2.5, y: 2.5 }, { x: 2.5, y: 2.5 }).length).toBe(0);
  });
});

describe("arrowPolygon", () => {
  it("is a closed shaft-plus-head outline whose middle point is the tip", () => {
    const arrow = arrowBetween({ x: 0.5, y: 0.5 }, { x: 0.5, y: 4.5 });
    const points = arrowPolygon(arrow);
    expect(points).toHaveLength(7);
    expect(points[3]).toEqual({ x: arrow.tipX, y: arrow.tipY });
    // The shaft is ARROW_STROKE wide and the head ARROW_HEAD_WIDTH across.
    expect(Math.abs(points[0].x - points[6].x)).toBeCloseTo(ARROW_STROKE, 6);
    expect(Math.abs(points[2].x - points[4].x)).toBeCloseTo(ARROW_HEAD_WIDTH, 6);
  });

  it("stays symmetrical about the shaft on a diagonal", () => {
    const arrow = arrowBetween({ x: 0.5, y: 0.5 }, { x: 3.5, y: 3.5 });
    const points = arrowPolygon(arrow);
    const midX = (points[0].x + points[6].x) / 2;
    const midY = (points[0].y + points[6].y) / 2;
    expect(midX).toBeCloseTo(arrow.x1, 6);
    expect(midY).toBeCloseTo(arrow.y1, 6);
  });
});

describe("badgePoint", () => {
  it("sits beside the shaft's start, inside the start square", () => {
    const arrow = arrowBetween({ x: 4.5, y: 6.5 }, { x: 4.5, y: 4.5 });
    const badge = badgePoint(arrow);
    expect(Math.abs(badge.x - 4.5)).toBeCloseTo(LINE_BADGE_OFFSET, 6);
    expect(Math.abs(badge.y - arrow.y1)).toBeLessThan(0.001);
    expect(Math.abs(badge.x - 4.5)).toBeLessThan(0.5);
  });
});

describe("lineStepOpacity", () => {
  it("reads first move first and never fades a step out of sight", () => {
    expect(lineStepOpacity(0)).toBeCloseTo(0.85, 6);
    expect(lineStepOpacity(1)).toBeLessThan(lineStepOpacity(0));
    expect(lineStepOpacity(11)).toBeGreaterThanOrEqual(0.38);
  });
});

describe("annotationsKey", () => {
  it("changes with the drawing and with nothing else", () => {
    const a = { squares: [{ square: "e4" as const, tone: "idea" as const }], arrows: [], line: [] };
    const b = { squares: [{ square: "e4" as const, tone: "bad" as const }], arrows: [], line: [] };
    expect(annotationsKey(a)).toBe(annotationsKey({ ...a, squares: [...a.squares] }));
    expect(annotationsKey(a)).not.toBe(annotationsKey(b));
    expect(annotationsKey(null)).toBe("-");
  });
});
