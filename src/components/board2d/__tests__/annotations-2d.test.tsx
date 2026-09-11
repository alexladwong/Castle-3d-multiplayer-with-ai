// @vitest-environment node
// src/components/board2d/__tests__/annotations-2d.test.tsx
// The tutor's 2D drawing layer (docs/PRO_TUTOR.md §4). There is no jsdom in this repo,
// so the layer is asserted against its static SVG markup — which is all it is: no
// state that matters to the picture, no handlers, `pointer-events: none`.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Annotations2D } from "../annotations-2d";
import {
  ARROW_CASING_OUTER_STROKE,
  ARROW_HEAD_LENGTH,
  ARROW_HEAD_WIDTH,
  ARROW_START_INSET,
  ARROW_STROKE,
  SQUARE_EDGE_WIDTH,
  lineStepOpacity,
  type BoardAnnotations,
} from "@/lib/tutor/annotations";

const DRAWING: BoardAnnotations = {
  squares: [
    { square: "e4", tone: "threat" },
    { square: "f7", tone: "bad" },
  ],
  arrows: [{ from: "f6", to: "e4", tone: "threat" }],
  line: [
    { from: "e2", to: "e4", san: "e4" },
    { from: "e7", to: "e5", san: "e5" },
  ],
};

function render(annotations: BoardAnnotations, orientation: "w" | "b" = "w"): string {
  return renderToStaticMarkup(
    <Annotations2D annotations={annotations} orientation={orientation} animate={false} />,
  );
}

/** `<rect … data-square="e4" … x="4" y="4" …>` → { x, y } for that square's tint. */
function tintOrigin(markup: string, square: string): { x: number; y: number } | null {
  const tag = markup.match(new RegExp(`<rect[^>]*data-square="${square}"[^>]*>`))?.[0];
  if (!tag) return null;
  const x = tag.match(/ x="(-?[\d.]+)"/)?.[1];
  const y = tag.match(/ y="(-?[\d.]+)"/)?.[1];
  return x === undefined || y === undefined ? null : { x: Number(x), y: Number(y) };
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of tag.matchAll(/([a-zA-Z][a-zA-Z0-9-]*)="([^"]*)"/g)) out[match[1]] = match[2];
  return out;
}

function parsePoints(value: string): { x: number; y: number }[] {
  return value
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(",");
      return { x: Number(x), y: Number(y) };
    });
}

/** The `<polygon>`s of the `index`-th group carrying `data-annotation`. */
function polygonsOf(groupTag: string, markup: string): { fill: string; points: string }[] {
  const start = markup.indexOf(groupTag) + groupTag.length;
  const end = markup.indexOf("</g>", start);
  return [...markup.slice(start, end).matchAll(/<polygon[^>]*>/g)].map((match) => {
    const a = attributes(match[0]);
    return { fill: a.fill, points: a.points };
  });
}

/** The tone core of the `index`-th arrow: the last of its three rings. */
function corePolygon(markup: string, index: number): { x: number; y: number }[] {
  const rings = polygonsOf(tagsWith(markup, "arrow")[index], markup);
  return parsePoints(rings[rings.length - 1].points);
}

function tagsWith(markup: string, annotation: string): string[] {
  return [...markup.matchAll(new RegExp(`<[a-z]+[^>]*data-annotation="${annotation}"[^>]*>`, "g"))].map(
    (match) => match[0],
  );
}

describe("Annotations2D", () => {
  it("draws one tinted rect per square, tagged with its tone", () => {
    const markup = render(DRAWING);
    const rects = tagsWith(markup, "square");
    expect(rects).toHaveLength(2);
    expect(attributes(rects[0])["data-tone"]).toBe("threat");
    expect(attributes(rects[0])["data-square"]).toBe("e4");
    expect(attributes(rects[1])["data-tone"]).toBe("bad");
    // A 45 % wash: the piece underneath still has to read (§4).
    expect(attributes(rects[0])["fill-opacity"]).toBe("0.45");
  });

  it("puts a square where the seat puts it", () => {
    // The rect is inset by half its stroke so the whole edge stays inside the square.
    const cell = (x: number, y: number) => ({
      x: x + SQUARE_EDGE_WIDTH / 2,
      y: y + SQUARE_EDGE_WIDTH / 2,
    });
    // White at the bottom: e4 is the fifth file, four ranks up from the bottom row.
    expect(tintOrigin(render(DRAWING, "w"), "e4")).toEqual(cell(4, 4));
    // Black at the bottom: the board is rotated a half turn, so e4 mirrors both ways.
    expect(tintOrigin(render(DRAWING, "b"), "e4")).toEqual(cell(3, 3));
    expect(tintOrigin(render(DRAWING, "w"), "f7")).toEqual(cell(5, 1));
    expect(tintOrigin(render(DRAWING, "b"), "f7")).toEqual(cell(2, 6));
  });

  it("pushes a tint's edge away from the square it sits on, hue kept", () => {
    const markup = render({
      squares: [
        { square: "e4", tone: "good" },
        { square: "e5", tone: "good" },
      ],
      arrows: [],
      line: [],
    });
    const [light, dark] = tagsWith(markup, "square").map(attributes);
    // e4 is a light square, e5 a dark one — same tone, opposite push.
    expect(light.stroke).toBe("color-mix(in srgb, var(--live) 50%, black)");
    expect(dark.stroke).toBe("color-mix(in srgb, var(--live) 50%, white)");
  });

  it("shortens an arrow at both ends so its head lands on the square centre", () => {
    const markup = render(DRAWING);
    const group = attributes(tagsWith(markup, "arrow")[0]);
    expect(group["data-from"]).toBe("f6");
    expect(group["data-to"]).toBe("e4");
    // f6 -> e4 is a knight move: centres (5.5, 2.5) and (4.5, 4.5), length sqrt(5).
    const length = Math.sqrt(5);
    const ux = -1 / length;
    const uy = 2 / length;
    // The CORE polygon is the last of the three rings, and it is `arrowPolygon` of
    // exactly the geometry the 3D board extrudes — that is the point of the shape.
    const core = corePolygon(markup, 0);
    expect(core[0].x).toBeCloseTo(5.5 + ux * ARROW_START_INSET + -uy * (ARROW_STROKE / 2), 3);
    expect(core[3]).toEqual({ x: 4.5, y: 4.5 });
    // The head is ARROW_HEAD_WIDTH across, not the 0.34 an `xMidYMid` marker gave it.
    expect(Math.hypot(core[2].x - core[4].x, core[2].y - core[4].y)).toBeCloseTo(
      ARROW_HEAD_WIDTH,
      3,
    );
    // And the base of the head sits ARROW_HEAD_LENGTH back from the tip.
    const base = { x: (core[2].x + core[4].x) / 2, y: (core[2].y + core[4].y) / 2 };
    expect(Math.hypot(4.5 - base.x, 4.5 - base.y)).toBeCloseTo(ARROW_HEAD_LENGTH, 3);
  });

  it("gives every arrow two casing rings, so it reads on either square colour", () => {
    const markup = render(DRAWING);
    const rings = polygonsOf(tagsWith(markup, "arrow")[0], markup);
    expect(rings).toHaveLength(3);
    // Outermost first, black-ward then white-ward, then the tone at full strength.
    expect(rings[0].fill).toBe("color-mix(in srgb, var(--board-capture) 50%, black)");
    expect(rings[1].fill).toBe("color-mix(in srgb, var(--board-capture) 50%, white)");
    expect(rings[2].fill).toBe("var(--board-capture)");
    // Each ring is wider than the one it sits inside.
    const width = (points: { x: number; y: number }[]) =>
      Math.hypot(points[0].x - points[6].x, points[0].y - points[6].y);
    expect(width(parsePoints(rings[0].points))).toBeCloseTo(ARROW_CASING_OUTER_STROKE, 3);
    expect(width(parsePoints(rings[2].points))).toBeCloseTo(ARROW_STROKE, 3);
  });

  it("mirrors an arrow with the seat", () => {
    const white = corePolygon(render(DRAWING, "w"), 0);
    const black = corePolygon(render(DRAWING, "b"), 0);
    expect(black[3].x).toBeCloseTo(8 - white[3].x, 6);
    expect(black[3].y).toBeCloseTo(8 - white[3].y, 6);
  });

  it("numbers a candidate line and fades each step behind the one before it", () => {
    const markup = render(DRAWING);
    const steps = tagsWith(markup, "line-step").map(attributes);
    expect(steps).toHaveLength(2);
    expect(steps[0]["data-step"]).toBe("1");
    expect(steps[0]["data-san"]).toBe("e4");
    expect(steps[1]["data-step"]).toBe("2");
    expect(steps[1]["data-from"]).toBe("e7");
    // A line step is never counted as a plain arrow (the Playwright check counts those).
    expect(tagsWith(markup, "arrow")).toHaveLength(1);
    const first = markup.indexOf('data-annotation="line-step"');
    expect(markup.slice(first)).toMatch(new RegExp(`opacity="${lineStepOpacity(0)}"`));
    expect(markup.slice(first)).toMatch(new RegExp(`opacity="${lineStepOpacity(1)}"`));
    // §8: no step ever fades to where it stops being a mark on the board.
    expect(lineStepOpacity(11)).toBeGreaterThanOrEqual(0.6);
  });

  it("draws no `<marker>` at all — the head is part of the shared polygon", () => {
    const markup = render(DRAWING);
    expect(markup).not.toContain("<marker");
    expect(markup).not.toContain("marker-end");
  });

  it("draws nothing but still renders cleanly for an empty drawing", () => {
    const markup = render({ squares: [], arrows: [], line: [] });
    expect(tagsWith(markup, "square")).toHaveLength(0);
    expect(tagsWith(markup, "arrow")).toHaveLength(0);
    expect(markup).toContain('data-annotations="2d"');
  });

  it("skips an arrow that goes nowhere rather than drawing a spike", () => {
    const markup = render({
      squares: [],
      arrows: [{ from: "e4", to: "e4", tone: "idea" }],
      line: [],
    });
    expect(tagsWith(markup, "arrow")).toHaveLength(0);
  });
});
