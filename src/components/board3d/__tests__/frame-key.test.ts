// src/components/board3d/__tests__/frame-key.test.ts
// `boardFrameKey` decides when the 3D root is asked for a frame. A field it forgets is a
// change the player never sees on a "demand" root, so the cases below are the contract:
// anything that alters what is drawn must move the key, and re-rendering with the same
// board must not.
import { describe, expect, it } from "vitest";
import type { BoardViewProps } from "@/lib/types";
import { boardFrameKey, type BoardViewSettings } from "../frame-key";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function board(overrides: Partial<BoardViewProps> = {}): BoardViewProps {
  return {
    fen: START_FEN,
    position: [],
    orientation: "w",
    turn: "w",
    interactive: true,
    animate: true,
    selectedSquare: null,
    legalTargets: [],
    lastMove: null,
    checkSquare: null,
    captured: { w: [], b: [] },
    promotion: null,
    reviewPly: null,
    onSquareSelect: () => {},
    onMove: () => {},
    onPromotionChoice: () => {},
    onDeselect: () => {},
    ...overrides,
  };
}

describe("boardFrameKey", () => {
  it("is stable for the same board", () => {
    expect(boardFrameKey(board())).toBe(boardFrameKey(board()));
  });

  it("ignores the callbacks and the piece identities the renderer animates with", () => {
    const withPieces = board({
      position: [{ id: "p1", square: "e2", type: "p", colour: "w" }],
      onMove: () => undefined,
    });
    expect(boardFrameKey(withPieces)).toBe(boardFrameKey(board()));
  });

  const changes: Array<[string, Partial<BoardViewProps>]> = [
    ["the position", { fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" }],
    ["the seat", { orientation: "b" }],
    ["the selected square", { selectedSquare: "e2" }],
    [
      "the legal-move markers",
      { legalTargets: [{ to: "e4", isCapture: false, isPromotion: false, isCastle: false, isEnPassant: false }] },
    ],
    ["the last move", { lastMove: { from: "e2", to: "e4", san: "e4", colour: "w" } }],
    ["the check square", { checkSquare: "e8" }],
    ["a capture reaching White's tray", { captured: { w: ["p"], b: [] } }],
    ["a capture reaching Black's tray", { captured: { w: [], b: ["n"] } }],
    ["the promotion prompt", { promotion: { from: "a7", to: "a8", colour: "w" } }],
    ["the board going read-only", { interactive: false }],
    ["animation being switched off", { animate: false }],
  ];

  it.each(changes)("moves when %s changes", (_label, overrides) => {
    expect(boardFrameKey(board(overrides))).not.toBe(boardFrameKey(board()));
  });

  it("distinguishes a promotion from the same move without one", () => {
    const plain = board({ lastMove: { from: "a7", to: "a8", san: "a8", colour: "w" } });
    const promoted = board({
      lastMove: { from: "a7", to: "a8", san: "a8=Q", colour: "w", promotion: "q" },
    });
    expect(boardFrameKey(plain)).not.toBe(boardFrameKey(promoted));
  });
});

function settings(overrides: Partial<BoardViewSettings> = {}): BoardViewSettings {
  return {
    roomPreset: "study",
    roomColors: null,
    tier: "high",
    postFx: true,
    cameraPreset: "white",
    cinematic: false,
    reducedMotion: false,
    ...overrides,
  };
}

describe("boardFrameKey with the viewer's settings", () => {
  it("is stable for the same board in the same room", () => {
    expect(boardFrameKey(board(), settings())).toBe(boardFrameKey(board(), settings()));
  });

  const changes: Array<[string, Partial<BoardViewSettings>]> = [
    ["the room", { roomPreset: "library" }],
    [
      "custom square colours",
      { roomColors: { background: "#101010", lightSquare: "#d9b98a", darkSquare: "#7a4a22" } },
    ],
    ["an uploaded backdrop", { roomImageUrl: "https://example.test/room.jpg" }],
    ["the quality tier", { tier: "low" }],
    ["post-processing", { postFx: false }],
    ["the camera preset", { cameraPreset: "black" }],
    ["the idle orbit", { cinematic: true }],
    ["reduced motion", { reducedMotion: true }],
  ];

  it.each(changes)("moves when %s changes", (_label, overrides) => {
    expect(boardFrameKey(board(), settings(overrides))).not.toBe(
      boardFrameKey(board(), settings()),
    );
  });

  it("still moves when the position changes underneath them", () => {
    const moved = board({ fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" });
    expect(boardFrameKey(moved, settings())).not.toBe(boardFrameKey(board(), settings()));
  });
});
