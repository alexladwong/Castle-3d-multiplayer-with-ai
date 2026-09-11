// src/components/board3d/layout.ts
// Vertical stacking and off-board geometry for the 3D scene. Everything here is
// expressed in board-square units (1 square = 1 world unit, board centred on the
// origin, +Y up, white seated at +Z) exactly as `src/lib/constants.ts` defines.
import { BOARD_EXTENT, CAPTURE_TRAY_X, PIECE_HEIGHTS, type PieceMeshName } from "@/lib/constants";
import type { Colour } from "@/lib/types";

/** Base plane the plinth rises from; the room floor/grid sits below it. */
export const PLINTH_TOP_Y = 0;
export const PLINTH_HEIGHT = 0.22;
/** Height of the board slab above the plinth base; its top is where pieces stand. */
export const SQUARE_THICKNESS = 0.06;
export const SQUARE_TOP_Y = PLINTH_TOP_Y + SQUARE_THICKNESS;
export const PIECE_Y = SQUARE_TOP_Y;

/**
 * FR-27 wants the pieces to reflect IN the board, so the reflective plane IS the
 * checkerboard (its 8x8 pattern is painted into a canvas texture) rather than a mirror
 * buried under 64 opaque tiles. It floats a hair above the plinth's top face — enough to
 * beat the depth buffer at this near/far range, well under the 1 mm the click colliders
 * and the highlight overlays sit at.
 */
export const BOARD_SURFACE_Y = SQUARE_TOP_Y + 0.0006;
/** The plinth rises all the way to the playing surface, so the board is one solid body. */
export const PLINTH_BODY_HEIGHT = PLINTH_HEIGHT + SQUARE_THICKNESS;
export const PLINTH_CENTRE_Y = SQUARE_TOP_Y - PLINTH_BODY_HEIGHT / 2;
/** Emissive overlays float just above the tiles so they never z-fight. */
export const HIGHLIGHT_Y = SQUARE_TOP_Y + 0.004;
export const COORD_Y = SQUARE_TOP_Y + 0.003;
export const CONTACT_SHADOW_Y = SQUARE_TOP_Y + 0.008;

/** Frame left visible around the 8x8 playing area (the plinth's own top face). */
export const FRAME_WIDTH = 0.55;
export const BOARD_SIZE = BOARD_EXTENT; // 8 units across
export const PLINTH_SIZE = BOARD_SIZE + FRAME_WIDTH * 2;

/* ------------------------------------------------------- the captured trays */
/** Captured pieces are shown small so a full tray never crowds the board. */
export const TRAY_PIECE_SCALE = 0.55;
export const TRAY_COLUMN_GAP = 0.62;
export const TRAY_ROW_GAP = 0.62;
export const TRAY_FIRST_ROW_Z = -2.35;
/** A side can take at most 15 men; two columns of eight is the grid that holds them. */
export const TRAY_COLUMNS = 2;
export const TRAY_ROWS = 8;

/**
 * The tray each side's trophies stand IN — a rounded block on the table top whose rim is
 * flush with the squares and whose floor is a shallow felt recess. Every number below is
 * derived from the slot grid above, so moving a slot moves the thing it stands on.
 *
 * `TRAY_MARGIN` is the clearance from the outermost slot CENTRES to the outer wall; a
 * tray piece's base reaches about 0.14 past its centre, so this is comfortable rather
 * than tight.
 */
export const TRAY_MARGIN = 0.48;
export const TRAY_SIZE_X = TRAY_COLUMN_GAP * (TRAY_COLUMNS - 1) + TRAY_MARGIN * 2;
export const TRAY_SIZE_Z = TRAY_ROW_GAP * (TRAY_ROWS - 1) + TRAY_MARGIN * 2;
/** Centre of a tray on the side `trayDirection` gives (its X is mirrored per side). */
export const TRAY_CENTRE_X = CAPTURE_TRAY_X + (TRAY_COLUMN_GAP * (TRAY_COLUMNS - 1)) / 2;
export const TRAY_CENTRE_Z = TRAY_FIRST_ROW_Z + (TRAY_ROW_GAP * (TRAY_ROWS - 1)) / 2;
/** How far a tray reaches from the world centre — what the table top has to cover. */
export const TRAY_OUTER_X = TRAY_CENTRE_X + TRAY_SIZE_X / 2;
export const TRAY_OUTER_Z = Math.abs(TRAY_CENTRE_Z) + TRAY_SIZE_Z / 2;

/** The rim top IS the playing surface's height; the felt sits this far under it. */
export const TRAY_RECESS = 0.05;
export const TRAY_FLOOR_Y = SQUARE_TOP_Y - TRAY_RECESS;
/**
 * The felt slab's top face, a hair proud of the body it is laid into — the same trick
 * `BOARD_SURFACE_Y` plays over the plinth, and for the same reason: two coplanar faces
 * at this near/far range flicker.
 */
export const TRAY_FELT_Y = TRAY_FLOOR_Y + 0.0006;
/** Wall thickness of the rim that frames the recess. */
export const TRAY_WALL = 0.16;
export const TRAY_INNER_X = TRAY_SIZE_X - TRAY_WALL * 2;
export const TRAY_INNER_Z = TRAY_SIZE_Z - TRAY_WALL * 2;
export const TRAY_CORNER_RADIUS = 0.18;
export const TRAY_INNER_CORNER_RADIUS = 0.1;

/**
 * Where captured pieces belonging to `capturer` are stacked. `capturer` is the
 * colour that made the capture (matching `CapturedPieces`' keys), so white's
 * trophies sit on white's right-hand side at +X.
 */
export function trayDirection(capturer: Colour): 1 | -1 {
  return capturer === "w" ? 1 : -1;
}

/**
 * World position of the `index`-th tray slot on `capturer`'s side. The Y is the FELT,
 * not the board: a piece origin is its base, so this stands it on the recess floor.
 */
export function traySlot(capturer: Colour, index: number): [number, number, number] {
  const dir = trayDirection(capturer);
  const column = index % TRAY_COLUMNS;
  const row = Math.floor(index / TRAY_COLUMNS);
  return [
    dir * (CAPTURE_TRAY_X + column * TRAY_COLUMN_GAP),
    TRAY_FELT_Y,
    TRAY_FIRST_ROW_Z + row * TRAY_ROW_GAP,
  ];
}

/* ------------------------------------------------------------------- the table */
/**
 * The table the board stands on (`table` in src/lib/rooms.ts). Its TOP FACE is exactly
 * where the plinth's underside already was, so the table is pure addition: not one square
 * moves, `SQUARE_TOP_Y` is untouched, and the reflective playing surface — which lives a
 * quarter of a unit above this — is never intersected.
 */
export const TABLE_TOP_Y = PLINTH_TOP_Y - PLINTH_HEIGHT;
export const TABLE_THICKNESS = 0.35;
/**
 * The top is a RECTANGLE, not a square, and the difference is the whole point of it: the
 * captured-piece trays stand at +/-`TRAY_OUTER_X`, far outside the plinth, and a square
 * top ending 0.35 past the plinth left them — and the men in them — hanging in mid air.
 *
 * Z keeps the depth it always had: a shade wider than the plinth, enough for the board to
 * sit ON something rather than flush with it. X runs out under both trays with
 * `TABLE_EDGE_MARGIN` of top to spare beyond each one.
 */
export const TABLE_EDGE_MARGIN = 0.5;
export const TABLE_SIZE_Z = PLINTH_SIZE + 0.7;
export const TABLE_SIZE_X = (TRAY_OUTER_X + TABLE_EDGE_MARGIN) * 2;
/**
 * The old square size, kept as the DEPTH it always was so importers that only ever meant
 * "how deep is the table" still read correctly. Anything about the width must say
 * `TABLE_SIZE_X`.
 */
export const TABLE_SIZE = TABLE_SIZE_Z;
/** The rail under the top that the legs are joined into. */
export const TABLE_APRON_INSET = 0.6;
export const TABLE_APRON_HEIGHT = 0.34;
/** Where the feet land — and, in a room that paints its own floor, where that floor goes. */
export const TABLE_FOOT_Y = -2.9;
/** Distance from the table's centre to a leg's axis. The legs stand at the four corners
 *  of the rectangle, so the two axes no longer agree. */
export const TABLE_LEG_INSET_X = TABLE_SIZE_X / 2 - TABLE_APRON_INSET - 0.32;
export const TABLE_LEG_INSET_Z = TABLE_SIZE_Z / 2 - TABLE_APRON_INSET - 0.32;
/** The depth inset, under its old name. */
export const TABLE_LEG_INSET = TABLE_LEG_INSET_Z;
/** Scales the turned leg's lathe profile, whose radii are written normalised to ~0.18. */
export const TABLE_LEG_RADIUS = 1.7;
/** The Space pedestal's lathe scale: one column, but a plate wide enough for a long top. */
export const TABLE_PEDESTAL_RADIUS = 1.4;

/** Squares are drawn slightly inset so the checker reads as separate tiles. */
export const TILE_SIZE = 0.98;
/** Overlay disc/ring radii (base diameter of a piece is ~0.49 units). */
export const LEGAL_DOT_RADIUS = 0.16;
export const CAPTURE_RING_INNER = 0.36;
export const CAPTURE_RING_OUTER = 0.47;

/** Half-height of a piece — used to aim the capture flight arc at its middle. */
export function pieceHalfHeight(mesh: PieceMeshName): number {
  return PIECE_HEIGHTS[mesh] / 2;
}

export function easeInOutCubic(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/** Exponential-decay rate that settles a slide in roughly `MOVE_ANIMATION_MS`. */
export const MOVE_DAMP_LAMBDA = 16;
export const LIFT_DAMP_LAMBDA = 12;
/** How high a piece rides while it is travelling between squares. */
export const TRAVEL_LIFT_Y = 0.18;
