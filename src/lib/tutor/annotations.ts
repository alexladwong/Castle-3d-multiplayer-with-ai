// src/lib/tutor/annotations.ts
// The tutor's drawings on the board (docs/PRO_TUTOR.md §4). Both boards render this
// shape; the tutor panel produces it from the model's tool calls; nothing here knows
// about the AI SDK, Convex or React.
import { gridPosition, squareToWorld } from "@/lib/constants";
import type { Colour, SquareId } from "@/lib/types";

/** What a drawing MEANS. Colour follows the tone, and the chip text names it too. */
export type AnnotationTone = "good" | "bad" | "threat" | "idea";

export interface AnnotationSquare {
  square: SquareId;
  tone: AnnotationTone;
}

export interface AnnotationArrow {
  from: SquareId;
  to: SquareId;
  tone: AnnotationTone;
}

/** One step of a candidate line, drawn as a numbered arrow (first move strongest). */
export interface AnnotationLineStep {
  from: SquareId;
  to: SquareId;
  san: string;
}

export interface BoardAnnotations {
  squares: AnnotationSquare[];
  arrows: AnnotationArrow[];
  line: AnnotationLineStep[];
}

export const EMPTY_ANNOTATIONS: Readonly<BoardAnnotations> = Object.freeze({
  squares: [],
  arrows: [],
  line: [],
});

/** DESIGN.md roles: baize = good, ember = bad, the capture marker = threat, brass = idea. */
export const ANNOTATION_TONE_VAR: Record<AnnotationTone, string> = {
  good: "--live",
  bad: "--danger",
  threat: "--board-capture",
  idea: "--accent",
};

export const ANNOTATION_TONE_TOKEN: Record<AnnotationTone, string> = {
  good: "var(--live)",
  bad: "var(--danger)",
  threat: "var(--board-capture)",
  idea: "var(--accent)",
};

/**
 * Last-resort colours for a renderer that cannot read the document (the 3D scene
 * before its first paint, SSR, a test). These are the DARK theme's values of the four
 * tokens above, because the board ships on the dark room by default.
 */
export const ANNOTATION_TONE_FALLBACK: Record<AnnotationTone, string> = {
  good: "#3f9b73",
  bad: "#d4644a",
  threat: "#dd7256",
  idea: "#c9a24a",
};

/** The word the annotation chip shows beside the colour, so colour is never alone. */
export const ANNOTATION_TONE_LABEL: Record<AnnotationTone, string> = {
  good: "good",
  bad: "mistake",
  threat: "threat",
  idea: "idea",
};

export function isEmptyAnnotations(a: BoardAnnotations | null | undefined): boolean {
  return !a || (a.squares.length === 0 && a.arrows.length === 0 && a.line.length === 0);
}

/* ------------------------------------------------------------ geometry (§4)
 * Pure maths shared by the two boards, so an arrow drawn on the 2D board and the
 * same arrow drawn in the 3D scene are the same shape. Everything is expressed in
 * BOARD SQUARES (1 square = 1 unit), which is what both renderers use: the 2D layer
 * is an `<svg viewBox="0 0 8 8">` and the 3D scene puts one square on one world unit.
 *
 * The two boards differ only in where a square's centre is:
 *   2D  `squareCentre2d` — orientation-aware (the grid is drawn from a seat).
 *   3D  `squareCentre3d` — world coordinates flattened into the highlight group's
 *       local plane (that group is rotated -90 deg about X, so world -Z is local +Y);
 *       the camera moves instead of the board, so orientation does not come into it.
 */

/** A point in board-square units. */
export interface AnnotationPoint {
  x: number;
  y: number;
}

/** Stroke width of an arrow shaft, in squares (docs/PRO_TUTOR.md §4). */
export const ARROW_STROKE = 0.22;
/** How far the head reaches back from the target square's centre. */
export const ARROW_HEAD_LENGTH = 0.34;
export const ARROW_HEAD_WIDTH = 0.46;
/** The shaft starts outside the piece it leaves, not under it. */
export const ARROW_START_INSET = 0.3;

/**
 * THE ARROW'S CASING, and why there are TWO rings rather than one.
 *
 * A square tint knows which square it sits on, so its edge can be pushed away from
 * that square's own value (`toneEdgeToken`). An ARROW does not: one shaft crosses
 * light and dark squares in the same stroke. And no single colour can clear 3:1
 * against both of this board's squares — `--board-light` #d9b98a has a relative
 * luminance of 0.560 and `--board-dark` #7a4a22 of 0.092, so a casing dark enough
 * for the light square (L <= 0.153) is automatically too dark for the dark one, and
 * a casing light enough for the dark square (L >= 0.375) is too light for the light
 * one. The two windows do not overlap; that is arithmetic, not taste.
 *
 * So the arrow carries BOTH: a ring pushed toward black on the outside and a ring
 * pushed toward white inside it, hue kept, with the tone at full strength in the
 * core. Whichever square the shaft is crossing, one of the two rings clears 3:1
 * against it (measured on brass, the worst tone: the black-ward ring is 4.9:1 on a
 * light square, the white-ward ring 4.9:1 on a dark one), and the boundary between
 * the two rings is 4.3:1 everywhere. This is the cartographer's casing, and it is
 * the only treatment that survives a stroke crossing a chequerboard.
 */
export const ARROW_CASING_WIDTH = 0.03;
/** Shaft width of the inner (white-ward) ring: the core plus one casing each side. */
export const ARROW_CASING_INNER_STROKE = ARROW_STROKE + 2 * ARROW_CASING_WIDTH;
/** Shaft width of the outer (black-ward) ring. */
export const ARROW_CASING_OUTER_STROKE = ARROW_STROKE + 4 * ARROW_CASING_WIDTH;
export const ARROW_CASING_INNER_HEAD = ARROW_HEAD_WIDTH + 2 * ARROW_CASING_WIDTH;
export const ARROW_CASING_OUTER_HEAD = ARROW_HEAD_WIDTH + 4 * ARROW_CASING_WIDTH;
/** Square tint (§4). Arrows are drawn heavier so they read over a tint. */
export const SQUARE_TINT_OPACITY = 0.45;
export const ARROW_OPACITY = 0.85;

/**
 * THE TINT'S EDGE, and why it is not simply the tone.
 *
 * Measured on both boards (docs/PRO_TUTOR.md §8): a 45 % wash of a tone over a board
 * square is a large COLOUR difference and a small VALUE one, because this palette's
 * baize, ember and brass sit at almost the same luminance as the board's own walnut.
 * The worst pair — `--live` on a dark square in the light theme — is 1.00:1 against the
 * bare square (a colour difference of dE 29, but no contrast at all in grey).
 *
 * So the tint's EDGE carries the shape: the same tone pushed half-way away from the
 * square it sits on — lighter on a dark square, darker on a light one. Hue is kept, so
 * it still reads as that tone, and every tone on every square in both themes clears
 * 3:1 against the bare square (WCAG 1.4.11 for a meaningful graphic).
 */
export const SQUARE_EDGE_MIX = 0.5;
/**
 * The same edge on the 3D board's DARK squares. Walnut that is #7a4a22 as a token
 * renders around #a66534 under the room's key light — a mid value, not a dark one — so
 * a half-mix toward white measured only 2.1-2.4:1 there. Pushed further it clears 3:1
 * while keeping the hue. Light squares need no such correction; they are already the
 * bright end at both stages.
 */
export const SQUARE_EDGE_MIX_LIT = 0.7;
export const SQUARE_EDGE_WIDTH = 0.08;

/** CSS for the edge; `lightSquare` decides which way the tone is pushed. */
export function toneEdgeToken(tone: AnnotationTone, lightSquare: boolean): string {
  const keep = Math.round((1 - SQUARE_EDGE_MIX) * 100);
  return `color-mix(in srgb, ${ANNOTATION_TONE_TOKEN[tone]} ${keep}%, ${lightSquare ? "black" : "white"})`;
}

/**
 * The same mix, done in numbers, for a renderer that cannot evaluate `color-mix` —
 * i.e. three. `colour` is a resolved `#rrggbb`; anything else comes back untouched.
 */
export function toneEdgeColour(
  colour: string,
  lightSquare: boolean,
  mix: number = SQUARE_EDGE_MIX,
): string {
  const match = /^#([0-9a-f]{6})$/i.exec(colour.trim());
  if (!match) return colour;
  const target = lightSquare ? 0 : 255;
  const channels = [0, 2, 4].map((i) => {
    const value = parseInt(match[1].slice(i, i + 2), 16);
    return Math.round(value * (1 - mix) + target * mix);
  });
  return `#${channels.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
/**
 * The two casing rings of an arrow, as CSS. `outer` is pushed toward black (it reads
 * on a light square), `inner` toward white (it reads on a dark one) — the same mix
 * the tint's edge uses, applied both ways because a shaft crosses both colours.
 */
export function toneCasingTokens(tone: AnnotationTone): { outer: string; inner: string } {
  return { outer: toneEdgeToken(tone, true), inner: toneEdgeToken(tone, false) };
}

/** The same pair in numbers, for three. `colour` is a resolved `#rrggbb`. */
export function toneCasingColours(colour: string): { outer: string; inner: string } {
  return { outer: toneEdgeColour(colour, true), inner: toneEdgeColour(colour, false) };
}

/**
 * Perpendicular offset of a line step's numbered badge from its start square, and how
 * big the disc is. Both were tuned down after review: at 0.19 the badge was 38 % of a
 * square across and sat squarely on the piece whose move it was numbering (the black
 * king on e8, the knight on f6). §4 asks for "a small mono badge"; this is one.
 */
export const LINE_BADGE_OFFSET = 0.36;
export const LINE_BADGE_RADIUS = 0.14;

export interface ArrowGeometry {
  /** Shaft start (inset out of the piece it leaves). */
  x1: number;
  y1: number;
  /** Shaft end — where the head's BASE sits, so the tip lands on the square centre. */
  x2: number;
  y2: number;
  /** The head's point: the exact centre of the target square. */
  tipX: number;
  tipY: number;
  /** Unit vector along the arrow. */
  ux: number;
  uy: number;
  /** Centre-to-centre distance, in squares. 0 for a degenerate arrow (from === to). */
  length: number;
}

export interface ArrowOptions {
  stroke?: number;
  headLength?: number;
  startInset?: number;
}

/**
 * The shaft of an arrow between two square centres, shortened at BOTH ends: at the
 * start so the piece underneath stays visible, at the end so the head's tip — not its
 * base — lands on the target square's centre. Knight moves and neighbouring squares
 * are short, so the insets are clamped rather than allowed to invert the shaft.
 */
export function arrowBetween(
  from: AnnotationPoint,
  to: AnnotationPoint,
  options: ArrowOptions = {},
): ArrowGeometry {
  const headLength = options.headLength ?? ARROW_HEAD_LENGTH;
  const startInset = options.startInset ?? ARROW_START_INSET;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return { x1: from.x, y1: from.y, x2: from.x, y2: from.y, tipX: to.x, tipY: to.y, ux: 0, uy: 0, length: 0 };
  }
  const ux = dx / length;
  const uy = dy / length;
  // The head never eats more than half the arrow; whatever is left is the shaft, and
  // the start inset gives up first (the head is what carries the direction).
  const head = Math.min(headLength, length * 0.5);
  const inset = Math.max(0, Math.min(startInset, length - head - 0.04));
  return {
    x1: from.x + ux * inset,
    y1: from.y + uy * inset,
    x2: to.x - ux * head,
    y2: to.y - uy * head,
    tipX: to.x,
    tipY: to.y,
    ux,
    uy,
    length,
  };
}

/**
 * The same arrow as a closed polygon (shaft rectangle + head triangle), for the 3D
 * board's flat `ShapeGeometry`. Seven points, counter-clockwise from the shaft's left
 * corner at the start.
 */
export function arrowPolygon(
  arrow: ArrowGeometry,
  options: { stroke?: number; headWidth?: number } = {},
): AnnotationPoint[] {
  const half = (options.stroke ?? ARROW_STROKE) / 2;
  const headHalf = (options.headWidth ?? ARROW_HEAD_WIDTH) / 2;
  // Left-hand normal of the direction vector.
  const nx = -arrow.uy;
  const ny = arrow.ux;
  const point = (x: number, y: number, offset: number): AnnotationPoint => ({
    x: x + nx * offset,
    y: y + ny * offset,
  });
  return [
    point(arrow.x1, arrow.y1, half),
    point(arrow.x2, arrow.y2, half),
    point(arrow.x2, arrow.y2, headHalf),
    { x: arrow.tipX, y: arrow.tipY },
    point(arrow.x2, arrow.y2, -headHalf),
    point(arrow.x2, arrow.y2, -half),
    point(arrow.x1, arrow.y1, -half),
  ];
}

/**
 * The same arrow grown outward by `d` at both ends, for a casing ring: the tail
 * reaches `d` further back and the tip `d` further on, so the ring wraps the point
 * instead of stopping short of it and leaving a bare triangle.
 */
export function arrowCasing(arrow: ArrowGeometry, d: number): ArrowGeometry {
  if (arrow.length === 0) return arrow;
  return {
    ...arrow,
    x1: arrow.x1 - arrow.ux * d,
    y1: arrow.y1 - arrow.uy * d,
    tipX: arrow.tipX + arrow.ux * d,
    tipY: arrow.tipY + arrow.uy * d,
  };
}

/** Where a line step's number sits: beside the shaft's start, never on top of it. */
export function badgePoint(arrow: ArrowGeometry, offset: number = LINE_BADGE_OFFSET): AnnotationPoint {
  if (arrow.length === 0) return { x: arrow.x1, y: arrow.y1 };
  return { x: arrow.x1 - arrow.uy * offset, y: arrow.y1 + arrow.ux * offset };
}

/**
 * A candidate line reads first-move-first: step 1 at full strength, each later step
 * quieter, and never so faint that it disappears on a light square.
 */
export function lineStepOpacity(index: number): number {
  // The floor was 0.38, which measured 1.01-1.59:1 against a bare square on every
  // combination of theme and square colour — step 4 of a line was not visible at all.
  // A gentler decay to a 0.6 floor keeps "first move strongest" readable AND keeps the
  // last step of the line on the board.
  return Math.max(0.6, ARROW_OPACITY - index * 0.08);
}

/** Centre of `square` in the 2D layer's 8x8 viewBox, from `orientation`'s seat. */
export function squareCentre2d(square: SquareId, orientation: Colour): AnnotationPoint {
  const { row, col } = gridPosition(square, orientation);
  return { x: col + 0.5, y: row + 0.5 };
}

/** Centre of `square` in the 3D highlight group's local plane (world x, -z). */
export function squareCentre3d(square: SquareId): AnnotationPoint {
  const [x, , z] = squareToWorld(square);
  return { x, y: -z };
}

/** A cheap fingerprint: what changed on the board, for keys and memo dependencies. */
export function annotationsKey(annotations: BoardAnnotations | null | undefined): string {
  if (!annotations) return "-";
  return [
    annotations.squares.map((s) => `${s.square}${s.tone}`).join(","),
    annotations.arrows.map((a) => `${a.from}${a.to}${a.tone}`).join(","),
    annotations.line.map((s) => `${s.from}${s.to}`).join(","),
  ].join("|");
}
