// @vitest-environment node
// The table is pure addition: it may not move a square and it may not reach the
// reflective playing surface. Both are one arithmetic assertion each, and both are the
// kind of thing a later tweak to a thickness would break silently.
//
// The top became a RECTANGLE when the captured-piece trays were given something to stand
// on, so the second half of this file is the new contract: the top reaches under both
// trays, the trays hold the whole slot grid, and their rim is flush with the squares.
import { describe, expect, it } from "vitest";

import { CAPTURE_TRAY_X, PIECE_HEIGHTS } from "@/lib/constants";
import {
  BOARD_SURFACE_Y,
  PLINTH_HEIGHT,
  PLINTH_SIZE,
  PLINTH_TOP_Y,
  SQUARE_TOP_Y,
  TABLE_APRON_HEIGHT,
  TABLE_APRON_INSET,
  TABLE_FOOT_Y,
  TABLE_LEG_INSET,
  TABLE_LEG_INSET_X,
  TABLE_LEG_INSET_Z,
  TABLE_LEG_RADIUS,
  TABLE_SIZE,
  TABLE_SIZE_X,
  TABLE_SIZE_Z,
  TABLE_THICKNESS,
  TABLE_TOP_Y,
  TRAY_COLUMNS,
  TRAY_COLUMN_GAP,
  TRAY_FELT_Y,
  TRAY_FLOOR_Y,
  TRAY_INNER_X,
  TRAY_INNER_Z,
  TRAY_CENTRE_X,
  TRAY_CENTRE_Z,
  TRAY_OUTER_X,
  TRAY_PIECE_SCALE,
  TRAY_ROWS,
  TRAY_SIZE_X,
  TRAY_SIZE_Z,
  TRAY_WALL,
  traySlot,
} from "../layout";

/** Radii of the turned-leg lathe profile in table.tsx, before TABLE_LEG_RADIUS. */
const LEG_MAX_PROFILE_RADIUS = 0.185;
/** How far a TRAY piece's base reaches past the slot centre it stands on. */
const TRAY_PIECE_HALF_WIDTH = 0.25 * TRAY_PIECE_SCALE;

describe("table geometry", () => {
  it("puts its top face exactly where the plinth's underside already was", () => {
    expect(TABLE_TOP_Y).toBe(PLINTH_TOP_Y - PLINTH_HEIGHT);
    // ...which is the whole point: the squares have not moved.
    expect(SQUARE_TOP_Y).toBeGreaterThan(TABLE_TOP_Y);
  });

  it("never reaches the reflector", () => {
    expect(TABLE_TOP_Y).toBeLessThan(BOARD_SURFACE_Y);
    expect(BOARD_SURFACE_Y - TABLE_TOP_Y).toBeGreaterThan(0.2);
  });

  it("keeps the depth it always had, under the name it always had", () => {
    expect(TABLE_SIZE_Z).toBe(PLINTH_SIZE + 0.7);
    expect(TABLE_SIZE).toBe(TABLE_SIZE_Z);
  });

  it("is wider than it is deep, and reaches out under BOTH trays", () => {
    expect(TABLE_SIZE_X).toBeGreaterThan(TABLE_SIZE_Z);
    // The owner's bug, as one line: nothing about a tray may hang off the top.
    expect(TABLE_SIZE_X / 2).toBeGreaterThan(TRAY_OUTER_X);
    // ...with real margin, not a rounding error's worth.
    expect(TABLE_SIZE_X / 2 - TRAY_OUTER_X).toBeGreaterThanOrEqual(0.4);
    // The brief's floor: half a top past the outer slot column plus ~0.9.
    expect(TABLE_SIZE_X / 2).toBeGreaterThanOrEqual(CAPTURE_TRAY_X + TRAY_COLUMN_GAP + 0.9);
  });

  it("is wider than the plinth, and hangs together top to foot", () => {
    expect(TABLE_SIZE_Z).toBeGreaterThan(PLINTH_SIZE);
    const apronTop = TABLE_TOP_Y - TABLE_THICKNESS;
    const apronBottom = apronTop - TABLE_APRON_HEIGHT;
    expect(apronBottom).toBeGreaterThan(TABLE_FOOT_Y);
    // The legs have a real length to fill rather than a sliver.
    expect(apronBottom - TABLE_FOOT_Y).toBeGreaterThan(1);
  });

  it("stands its legs at the corners of the rectangle, inside the apron", () => {
    expect(TABLE_LEG_INSET).toBe(TABLE_LEG_INSET_Z);
    expect(TABLE_LEG_INSET_X).toBeGreaterThan(TABLE_LEG_INSET_Z);
    const legHalf = LEG_MAX_PROFILE_RADIUS * TABLE_LEG_RADIUS;
    for (const [inset, size] of [
      [TABLE_LEG_INSET_X, TABLE_SIZE_X],
      [TABLE_LEG_INSET_Z, TABLE_SIZE_Z],
    ] as const) {
      expect(inset + legHalf).toBeLessThanOrEqual(size / 2 - TABLE_APRON_INSET + 1e-9);
    }
    // ...and outside the board they hold up, so a leg is never seen through the squares.
    expect(TABLE_LEG_INSET_Z - legHalf).toBeGreaterThan(PLINTH_SIZE / 2 - 1);
    // The X pair is further out still — it has to clear a tray, not just the frame.
    expect(TABLE_LEG_INSET_X - legHalf).toBeGreaterThan(TRAY_OUTER_X - 1);
  });
});

describe("the captured-piece trays", () => {
  it("puts the rim flush with the squares and the felt in a shallow recess under it", () => {
    expect(TRAY_FLOOR_Y).toBeLessThan(SQUARE_TOP_Y);
    expect(SQUARE_TOP_Y - TRAY_FLOOR_Y).toBeCloseTo(0.05, 10);
    // The felt is proud of the body it is laid into, and still under the rim.
    expect(TRAY_FELT_Y).toBeGreaterThan(TRAY_FLOOR_Y);
    expect(TRAY_FELT_Y).toBeLessThan(SQUARE_TOP_Y);
    // A tray stands ON the table rather than in it.
    expect(TRAY_FLOOR_Y).toBeGreaterThan(TABLE_TOP_Y);
  });

  it("stands every captured man on the felt, and never on the board's own height", () => {
    for (const capturer of ["w", "b"] as const) {
      for (let index = 0; index < TRAY_ROWS * TRAY_COLUMNS; index += 1) {
        const [, y] = traySlot(capturer, index);
        expect(y).toBe(TRAY_FELT_Y);
      }
    }
    // White's trophies are on white's right hand, black's on the other side.
    expect(traySlot("w", 0)[0]).toBeGreaterThan(0);
    expect(traySlot("b", 0)[0]).toBeLessThan(0);
  });

  it("holds the whole 2x8 grid inside its recess, with a piece's base to spare", () => {
    const innerHalfX = TRAY_INNER_X / 2;
    const innerHalfZ = TRAY_INNER_Z / 2;
    for (let index = 0; index < TRAY_ROWS * TRAY_COLUMNS; index += 1) {
      const [x, , z] = traySlot("w", index);
      // ...measured in the tray's own frame.
      expect(Math.abs(Math.abs(x) - TRAY_CENTRE_X) + TRAY_PIECE_HALF_WIDTH).toBeLessThan(innerHalfX);
      expect(Math.abs(z - TRAY_CENTRE_Z) + TRAY_PIECE_HALF_WIDTH).toBeLessThan(innerHalfZ);
    }
    expect(TRAY_SIZE_X - TRAY_INNER_X).toBeCloseTo(TRAY_WALL * 2, 10);
    expect(TRAY_SIZE_Z - TRAY_INNER_Z).toBeCloseTo(TRAY_WALL * 2, 10);
  });

  it("is the shape the brief asked for: about 1.6 wide and 5.3 deep", () => {
    expect(TRAY_SIZE_X).toBeGreaterThan(1.4);
    expect(TRAY_SIZE_X).toBeLessThan(1.8);
    expect(TRAY_SIZE_Z).toBeGreaterThan(5.0);
    expect(TRAY_SIZE_Z).toBeLessThan(5.6);
  });

  it("never lets a trayed king reach the board's own playing surface", () => {
    const kingTop = TRAY_FELT_Y + PIECE_HEIGHTS.King * TRAY_PIECE_SCALE;
    // Taller than the rim — a tray is a tray, not a box with a lid...
    expect(kingTop).toBeGreaterThan(SQUARE_TOP_Y);
    // ...and still shorter than a king standing on the board.
    expect(kingTop).toBeLessThan(SQUARE_TOP_Y + PIECE_HEIGHTS.King);
  });
});
