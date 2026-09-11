// @vitest-environment node
// src/components/ui-kit/__tests__/mini-board.test.tsx  [U0]
//
// There is no @testing-library / jsdom in this repo (and U0 installs nothing), so
// the board is asserted against its static SVG markup — which is all a MiniBoard
// is: no state, no effects, no event handlers.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MiniBoard, piecesFromFenPlacement } from "../mini-board";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
/** After 1. e4 c5 — an asymmetric position, so orientation is observable. */
const SICILIAN_FEN = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2";

/** `<svg data-piece="wk" data-square="e1" …>` → { e1: "wk", … } */
function piecesInMarkup(markup: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of markup.matchAll(/data-piece="(\w+)" data-square="(\w+)"/g)) {
    out[match[2]!] = match[1]!;
  }
  return out;
}

/** The x/y of the nested viewport that carries `square`'s piece. */
function pieceOrigin(markup: string, square: string): { x: number; y: number } | null {
  const re = new RegExp(`data-piece="\\w+" data-square="${square}" x="(\\d+)" y="(\\d+)"`);
  const match = re.exec(markup);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

describe("piecesFromFenPlacement", () => {
  it("reads all 32 pieces out of the start position", () => {
    expect(piecesFromFenPlacement(START_FEN)).toHaveLength(32);
  });

  it("puts every piece on the right square", () => {
    const bySquare = new Map(piecesFromFenPlacement(START_FEN).map((p) => [p.square, p]));
    expect(bySquare.get("a1")).toMatchObject({ type: "r", colour: "w" });
    expect(bySquare.get("e1")).toMatchObject({ type: "k", colour: "w" });
    expect(bySquare.get("d8")).toMatchObject({ type: "q", colour: "b" });
    expect(bySquare.get("h7")).toMatchObject({ type: "p", colour: "b" });
    expect(bySquare.has("e4")).toBe(false);
  });

  it("returns an empty board rather than throwing on a malformed FEN", () => {
    expect(piecesFromFenPlacement("")).toEqual([]);
    expect(piecesFromFenPlacement("not/a/fen")).toEqual([]);
    expect(piecesFromFenPlacement("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNRX w - - 0 1")).toEqual(
      [],
    );
  });
});

describe("MiniBoard", () => {
  it("renders 32 pieces and 64 squares from the start position", () => {
    const markup = renderToStaticMarkup(<MiniBoard fen={START_FEN} />);
    const pieces = piecesInMarkup(markup);
    expect(Object.keys(pieces)).toHaveLength(32);
    expect(pieces.e1).toBe("wk");
    expect(pieces.e8).toBe("bk");
    // 64 square rects + 32 piece viewports, all carrying data-square
    expect(markup.match(/data-square="/g)).toHaveLength(96);
  });

  it("flips the coordinates with the orientation", () => {
    const white = renderToStaticMarkup(<MiniBoard fen={START_FEN} orientation="w" />);
    const black = renderToStaticMarkup(<MiniBoard fen={START_FEN} orientation="b" />);

    // a1 is bottom-left for White and top-right for Black (45px per square).
    expect(pieceOrigin(white, "a1")).toEqual({ x: 0, y: 315 });
    expect(pieceOrigin(black, "a1")).toEqual({ x: 315, y: 0 });
    expect(pieceOrigin(white, "h8")).toEqual({ x: 315, y: 0 });
    expect(pieceOrigin(black, "h8")).toEqual({ x: 0, y: 315 });

    // the piece set itself is unchanged by orientation
    expect(piecesInMarkup(white)).toEqual(piecesInMarkup(black));
  });

  it("marks the last move on both squares", () => {
    const markup = renderToStaticMarkup(
      <MiniBoard fen={SICILIAN_FEN} lastMove={{ from: "c7", to: "c5" }} />,
    );
    expect(markup).toContain('data-last-move="c7"');
    expect(markup).toContain('data-last-move="c5"');
    expect(markup.match(/data-last-move="/g)).toHaveLength(2);
  });

  it("is decorative unless it is given a label", () => {
    expect(renderToStaticMarkup(<MiniBoard fen={START_FEN} />)).toContain('aria-hidden="true"');

    const labelled = renderToStaticMarkup(<MiniBoard fen={START_FEN} label="Starting position" />);
    const openingTag = labelled.slice(0, labelled.indexOf(">"));
    expect(openingTag).toContain('role="img"');
    expect(openingTag).not.toContain("aria-hidden");
    expect(labelled).toContain("<title>Starting position</title>");
  });

  it("honours the requested pixel size while keeping the 360-unit viewBox", () => {
    const markup = renderToStaticMarkup(<MiniBoard fen={START_FEN} size={48} />);
    expect(markup).toContain('width="48"');
    expect(markup).toContain('viewBox="0 0 360 360"');
  });
});
