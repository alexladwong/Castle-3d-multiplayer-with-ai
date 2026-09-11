// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";

import {
  buildPgn,
  capturedFromMoves,
  checkSquareOf,
  fenAtPly,
  isLegalMove,
  lastMoveAtPly,
  legalTargetsFor,
  materialBalance,
  needsPromotion,
  piecesFromFen,
  replay,
  toHistoryRows,
} from "../chess";
import {
  EMPTY_PIECE_TRACKER_STATE,
  PieceTracker,
  derivePieces,
  type PieceTrackerState,
} from "../piece-tracker";
import {
  DEFAULT_FEN,
  gridPosition,
  isLightSquare,
  queueRangeAt,
  squareIndices,
  squareToWorld,
  worldToSquare,
} from "../constants";
import {
  CAMERA_LIMITS,
  CAMERA_PRESETS,
  autoQualityTier,
  dropTier,
  fitPoseToAspect,
  minFitDistance,
  nearCornerAdvance,
  poseForPreset,
  seatPresetFor,
} from "../camera";
import type { LastMove, SquareId } from "../types";

/* --------------------------------------------------------------- fixtures */

/** Scholar's mate — 7 plies, ends in checkmate with a capture on f7. */
const SCHOLARS_MATE = ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7"];
/** 1.e4 a6 2.e5 d5 3.exd6 — the last move is an en-passant capture. */
const EN_PASSANT = ["e4", "a6", "e5", "d5", "exd6"];
/** Both sides retain full castling rights. */
const CASTLING_FEN = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
/** White pawn one step from promoting on a8. */
const PROMOTION_FEN = "7k/P7/8/8/8/8/8/7K w - - 0 1";

/* ------------------------------------------------------------------ replay */

describe("replay / fenAtPly", () => {
  it("replays a SAN list into the expected position", () => {
    const chess = replay(SCHOLARS_MATE);
    expect(chess.isCheckmate()).toBe(true);
    expect(chess.turn()).toBe("b");
    expect(chess.history()).toEqual(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]);
  });

  it("returns the start position for an empty list", () => {
    expect(replay([]).fen()).toBe(DEFAULT_FEN);
  });

  it("throws on an illegal SAN (callers treat that as a bug)", () => {
    expect(() => replay(["e4", "e5", "Qxf7"])).toThrow();
  });

  it("fenAtPly(0) is the start position without replaying anything", () => {
    expect(fenAtPly(SCHOLARS_MATE, 0)).toBe(DEFAULT_FEN);
    expect(fenAtPly(SCHOLARS_MATE, -3)).toBe(DEFAULT_FEN);
  });

  it("fenAtPly(n) matches replaying the first n moves", () => {
    for (let ply = 0; ply <= SCHOLARS_MATE.length; ply++) {
      expect(fenAtPly(SCHOLARS_MATE, ply)).toBe(replay(SCHOLARS_MATE.slice(0, ply)).fen());
    }
  });

  it("fenAtPly past the end returns the final position", () => {
    expect(fenAtPly(SCHOLARS_MATE, 99)).toBe(replay(SCHOLARS_MATE).fen());
  });

  it("detects threefold repetition only after a replay from the start", () => {
    const shuffle = ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"];
    expect(replay(shuffle).isThreefoldRepetition()).toBe(true);
    // A Chess built from the stored FEN alone has no history and cannot see it.
    expect(new Chess(replay(shuffle).fen()).isThreefoldRepetition()).toBe(false);
  });
});

/* ----------------------------------------------------------- legal targets */

describe("legalTargetsFor", () => {
  it("gives a knight its two opening squares", () => {
    const targets = legalTargetsFor(DEFAULT_FEN, "b1");
    expect(targets.map((t) => t.to).sort()).toEqual(["a3", "c3"]);
    expect(targets.every((t) => !t.isCapture && !t.isPromotion && !t.isCastle)).toBe(true);
  });

  it("gives a pawn its single and double step", () => {
    expect(legalTargetsFor(DEFAULT_FEN, "e2").map((t) => t.to).sort()).toEqual(["e3", "e4"]);
  });

  it("returns nothing for an empty square", () => {
    expect(legalTargetsFor(DEFAULT_FEN, "e4")).toEqual([]);
  });

  it("collapses the four promotion moves into ONE target", () => {
    const targets = legalTargetsFor(PROMOTION_FEN, "a7");
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ to: "a8", isPromotion: true, isCapture: false });
  });

  it("flags both castles", () => {
    const targets = legalTargetsFor(CASTLING_FEN, "e1");
    const kingside = targets.find((t) => t.to === "g1");
    const queenside = targets.find((t) => t.to === "c1");
    expect(kingside?.isCastle).toBe(true);
    expect(queenside?.isCastle).toBe(true);
    // A normal king step is not a castle.
    expect(targets.find((t) => t.to === "d1")?.isCastle).toBe(false);
  });

  it("marks en passant as a capture even though isCapture() is false", () => {
    const fen = fenAtPly(EN_PASSANT, 4); // after 2...d5, before exd6
    const target = legalTargetsFor(fen, "e5").find((t) => t.to === "d6");
    expect(target).toBeDefined();
    expect(target?.isEnPassant).toBe(true);
    expect(target?.isCapture).toBe(true);
  });

  it("marks an ordinary capture", () => {
    const fen = fenAtPly(["e4", "d5"], 2);
    const target = legalTargetsFor(fen, "e4").find((t) => t.to === "d5");
    expect(target?.isCapture).toBe(true);
    expect(target?.isEnPassant).toBe(false);
  });

  it("only offers moves that answer a check", () => {
    // 1.e4 d5 2.Bb5+ — black is in check (not mate) and must block or interpose.
    const fen = fenAtPly(["e4", "d5", "Bb5"], 3);
    expect(checkSquareOf(fen)).toBe("e8");
    // the c7 pawn can block on c6 …
    expect(legalTargetsFor(fen, "c7").map((t) => t.to)).toEqual(["c6"]);
    // … while pieces that cannot answer the check have nothing to offer
    expect(legalTargetsFor(fen, "h7")).toEqual([]);
    expect(legalTargetsFor(fen, "e8")).toEqual([]);
  });
});

/* -------------------------------------------------------------- promotion */

describe("needsPromotion / isLegalMove", () => {
  it("needsPromotion is true only for a pawn reaching the last rank", () => {
    expect(needsPromotion(PROMOTION_FEN, "a7", "a8")).toBe(true);
    expect(needsPromotion(PROMOTION_FEN, "h1", "g1")).toBe(false);
    expect(needsPromotion(DEFAULT_FEN, "e2", "e4")).toBe(false);
  });

  it("needsPromotion is false for an illegal from/to pair", () => {
    expect(needsPromotion(DEFAULT_FEN, "e2", "e5")).toBe(false);
  });

  it("isLegalMove rejects a promotion submitted without a piece", () => {
    expect(isLegalMove(PROMOTION_FEN, "a7", "a8")).toBe(false);
    expect(isLegalMove(PROMOTION_FEN, "a7", "a8", "q")).toBe(true);
    expect(isLegalMove(PROMOTION_FEN, "a7", "a8", "n")).toBe(true);
  });

  it("isLegalMove returns false instead of throwing on nonsense", () => {
    expect(isLegalMove(DEFAULT_FEN, "e2", "e5")).toBe(false);
    expect(isLegalMove(DEFAULT_FEN, "e7", "e5")).toBe(false); // black is not to move
  });

  it("isLegalMove accepts a normal move", () => {
    expect(isLegalMove(DEFAULT_FEN, "e2", "e4")).toBe(true);
  });
});

/* ------------------------------------------------------------------ check */

describe("checkSquareOf", () => {
  it("is null in the start position", () => {
    expect(checkSquareOf(DEFAULT_FEN)).toBeNull();
  });

  it("returns the checkmated king's square", () => {
    expect(checkSquareOf(replay(SCHOLARS_MATE).fen())).toBe("e8");
  });

  it("returns the white king's square when white is in check", () => {
    expect(checkSquareOf(fenAtPly(["f3", "e5", "g4", "Qh4"], 4))).toBe("e1");
  });
});

/* ---------------------------------------------------------------- pieces */

describe("piecesFromFen", () => {
  it("returns all 32 pieces from the start position", () => {
    const pieces = piecesFromFen(DEFAULT_FEN);
    expect(pieces).toHaveLength(32);
    expect(pieces.filter((p) => p.colour === "w")).toHaveLength(16);
    expect(pieces.filter((p) => p.type === "p")).toHaveLength(16);
    expect(pieces.find((p) => p.square === "e1")).toEqual({ square: "e1", type: "k", colour: "w" });
    expect(pieces.find((p) => p.square === "d8")).toEqual({ square: "d8", type: "q", colour: "b" });
  });

  it("shrinks after a capture", () => {
    expect(piecesFromFen(fenAtPly(["e4", "d5", "exd5"], 3))).toHaveLength(31);
  });
});

/* ------------------------------------------------------- captured / value */

describe("capturedFromMoves / materialBalance", () => {
  it("is empty with no captures", () => {
    expect(capturedFromMoves(["e4", "e5", "Nf3"])).toEqual({ w: [], b: [] });
  });

  it("keys captures by the CAPTURING colour", () => {
    expect(capturedFromMoves(["e4", "d5", "exd5"])).toEqual({ w: ["p"], b: [] });
    expect(capturedFromMoves(["e4", "d5", "exd5", "Qxd5"])).toEqual({ w: ["p"], b: ["p"] });
  });

  it("records the captured pawn for an en-passant capture", () => {
    expect(capturedFromMoves(EN_PASSANT)).toEqual({ w: ["p"], b: [] });
  });

  it("records the queen taken in Scholar's mate", () => {
    expect(capturedFromMoves(SCHOLARS_MATE)).toEqual({ w: ["p"], b: [] });
  });

  it("materialBalance is positive when white is ahead", () => {
    expect(materialBalance({ w: ["q"], b: [] })).toBe(9);
    expect(materialBalance({ w: [], b: ["r"] })).toBe(-5);
    expect(materialBalance({ w: ["n", "p"], b: ["b", "p"] })).toBe(0);
    expect(materialBalance({ w: [], b: [] })).toBe(0);
  });
});

/* -------------------------------------------------------------- last move */

describe("lastMoveAtPly", () => {
  it("is null at ply 0", () => {
    expect(lastMoveAtPly(SCHOLARS_MATE, 0)).toBeNull();
    expect(lastMoveAtPly([], 5)).toBeNull();
  });

  it("clamps a ply past the end instead of throwing (stale reviewPly after an undo)", () => {
    expect(lastMoveAtPly(SCHOLARS_MATE, 99)).toEqual(
      lastMoveAtPly(SCHOLARS_MATE, SCHOLARS_MATE.length),
    );
  });

  it("describes a quiet move", () => {
    expect(lastMoveAtPly(SCHOLARS_MATE, 1)).toEqual({
      from: "e2",
      to: "e4",
      san: "e4",
      colour: "w",
      captured: undefined,
      promotion: undefined,
    });
  });

  it("describes the capture that ends the game", () => {
    const last = lastMoveAtPly(SCHOLARS_MATE, SCHOLARS_MATE.length);
    expect(last).toMatchObject({ from: "h5", to: "f7", colour: "w", captured: "p" });
    expect(last?.san).toBe("Qxf7#");
  });

  it("points an en-passant capture at the square the pawn actually stood on", () => {
    // 1. e4 a6 2. e5 d5 3. exd6 e.p. — the pawn taken is on d5, not on the d6 landing
    // square, so the FR-17 capture flight must start one rank back.
    const last = lastMoveAtPly(["e4", "a6", "e5", "d5", "exd6"], 5);
    expect(last).toMatchObject({ from: "e5", to: "d6", captured: "p", capturedSquare: "d5" });
  });

  it("leaves capturedSquare unset for an ordinary capture", () => {
    const last = lastMoveAtPly(SCHOLARS_MATE, SCHOLARS_MATE.length);
    expect(last?.captured).toBe("p");
    expect(last?.capturedSquare).toBeUndefined();
  });

  it("carries the promotion piece", () => {
    const last = lastMoveAtPly(["a4", "h5", "a5", "h4", "a6", "h3", "axb7", "hxg2", "bxa8=Q"], 9);
    expect(last).toMatchObject({ to: "a8", promotion: "q", captured: "r" });
  });
});

/* ---------------------------------------------------------------- history */

describe("toHistoryRows", () => {
  it("is empty for no moves", () => {
    expect(toHistoryRows([])).toEqual([]);
  });

  it("pairs SAN by full-move number with 1-based plies", () => {
    expect(toHistoryRows(["e4", "e5", "Nf3"])).toEqual([
      { number: 1, white: { ply: 1, san: "e4" }, black: { ply: 2, san: "e5" } },
      { number: 2, white: { ply: 3, san: "Nf3" } },
    ]);
  });

  it("produces ceil(n/2) rows", () => {
    expect(toHistoryRows(SCHOLARS_MATE)).toHaveLength(4);
    expect(toHistoryRows(SCHOLARS_MATE).at(-1)).toEqual({
      number: 4,
      white: { ply: 7, san: "Qxf7" },
    });
  });
});

/* -------------------------------------------------------------------- PGN */

describe("buildPgn", () => {
  const pgn = buildPgn(SCHOLARS_MATE, {
    white: "Marco",
    black: "Ada",
    result: "1-0",
    date: new Date(Date.UTC(2026, 8, 9, 12, 0, 0)),
  });

  it("writes the seven-tag roster with a zero-padded UTC date", () => {
    expect(pgn).toContain('[Event "Castle"]');
    expect(pgn).toContain('[Site "Castle"]');
    expect(pgn).toContain('[Date "2026.09.09"]');
    expect(pgn).toContain('[White "Marco"]');
    expect(pgn).toContain('[Black "Ada"]');
    expect(pgn).toContain('[Result "1-0"]');
  });

  it("includes the move text", () => {
    expect(pgn).toContain("1. e4 e5");
    expect(pgn).toContain("Qxf7#");
  });

  it("round-trips back through chess.js", () => {
    const reloaded = new Chess();
    reloaded.loadPgn(pgn);
    expect(reloaded.history()).toEqual(replay(SCHOLARS_MATE).history());
  });

  it("accepts a custom event name and an unfinished result", () => {
    const draftPgn = buildPgn(["e4"], { white: "a", black: "b", result: "*", event: "Casual" });
    expect(draftPgn).toContain('[Event "Casual"]');
    expect(draftPgn).toContain('[Result "*"]');
  });
});

/* ----------------------------------------------------------- PieceTracker */

describe("PieceTracker", () => {
  /** The controller hands `sync` a resolver for "the move that ends at ply N". */
  const moveAt = (moves: string[]) => (ply: number) => lastMoveAtPly(moves, ply);
  const constant = (move: LastMove | null) => () => move;
  const none = constant(null);

  it("assigns 32 unique ids in the start position", () => {
    const tracker = new PieceTracker();
    const pieces = tracker.sync(DEFAULT_FEN, 0, none);
    expect(pieces).toHaveLength(32);
    expect(new Set(pieces.map((p) => p.id)).size).toBe(32);
  });

  it("carries a moving piece's id to its new square", () => {
    const tracker = new PieceTracker();
    const before = tracker.sync(DEFAULT_FEN, 0, none);
    const pawnId = before.find((p) => p.square === "e2")!.id;

    const after = tracker.sync(fenAtPly(["e4"], 1), 1, moveAt(["e4"]));

    expect(after.find((p) => p.square === "e4")!.id).toBe(pawnId);
    expect(after.find((p) => p.square === "e2")).toBeUndefined();
    expect(new Set(after.map((p) => p.id)).size).toBe(32);
  });

  it("keeps every other piece's id stable across a move", () => {
    const tracker = new PieceTracker();
    const before = tracker.sync(DEFAULT_FEN, 0, none);
    const after = tracker.sync(fenAtPly(["e4"], 1), 1, moveAt(["e4"]));
    const idBySquare = new Map(before.map((p) => [p.square, p.id]));
    for (const piece of after) {
      if (piece.square === "e4") continue;
      expect(piece.id).toBe(idBySquare.get(piece.square));
    }
  });

  // FR-17 / FR-54: "Previous move" un-plays a move, so the transition is explained by
  // the move that ends at the ply we came FROM, reversed. Feeding it the move that
  // ends at the ply we are going TO gave the piece a new id, and it popped.
  it("carries the piece BACK when stepping to the previous ply", () => {
    const moves = ["e4", "e5", "Nf3", "Nc6", "Bb5"];
    const tracker = new PieceTracker();
    tracker.sync(DEFAULT_FEN, 0, moveAt(moves));
    let forward = tracker.sync(fenAtPly(moves, 4), 4, moveAt(moves));
    const bishopId = forward.find((p) => p.square === "f1")!.id;
    forward = tracker.sync(fenAtPly(moves, 5), 5, moveAt(moves));
    expect(forward.find((p) => p.square === "b5")!.id).toBe(bishopId);

    const back = tracker.sync(fenAtPly(moves, 4), 4, moveAt(moves));
    expect(back.find((p) => p.square === "f1")!.id).toBe(bishopId);
    expect(new Set(back.map((p) => p.id)).size).toBe(back.length);
  });

  it("un-plays a capture without disturbing the capturer's id", () => {
    const moves = ["e4", "d5", "exd5"];
    const tracker = new PieceTracker();
    tracker.sync(DEFAULT_FEN, 0, moveAt(moves));
    tracker.sync(fenAtPly(moves, 1), 1, moveAt(moves));
    tracker.sync(fenAtPly(moves, 2), 2, moveAt(moves));
    const afterCapture = tracker.sync(fenAtPly(moves, 3), 3, moveAt(moves));
    const capturerId = afterCapture.find((p) => p.square === "d5")!.id;

    const back = tracker.sync(fenAtPly(moves, 2), 2, moveAt(moves));
    expect(back.find((p) => p.square === "e4")!.id).toBe(capturerId);
    expect(back).toHaveLength(32);
    expect(new Set(back.map((p) => p.id)).size).toBe(32);
  });

  it("moves BOTH the king and the rook on a castle", () => {
    const tracker = new PieceTracker();
    const before = tracker.sync(CASTLING_FEN, 0, none);
    const kingId = before.find((p) => p.square === "e1")!.id;
    const rookId = before.find((p) => p.square === "h1")!.id;

    const chess = new Chess(CASTLING_FEN);
    const castle = chess.move("O-O");
    const move: LastMove = {
      from: castle.from as SquareId,
      to: castle.to as SquareId,
      san: castle.san,
      colour: castle.color,
    };
    const after = tracker.sync(chess.fen(), 1, constant(move));

    expect(after.find((p) => p.square === "g1")!.id).toBe(kingId);
    expect(after.find((p) => p.square === "f1")!.id).toBe(rookId);

    // ...and both come back when the castle is un-played.
    const back = tracker.sync(CASTLING_FEN, 0, constant(move));
    expect(back.find((p) => p.square === "e1")!.id).toBe(kingId);
    expect(back.find((p) => p.square === "h1")!.id).toBe(rookId);
  });

  it("drops the captured piece's id and keeps the capturer's", () => {
    const moves = ["e4", "d5", "exd5"];
    const tracker = new PieceTracker();
    tracker.sync(DEFAULT_FEN, 0, moveAt(moves));
    tracker.sync(fenAtPly(moves, 1), 1, moveAt(moves));
    const afterD5 = tracker.sync(fenAtPly(moves, 2), 2, moveAt(moves));
    const capturerId = afterD5.find((p) => p.square === "e4")!.id;
    const victimId = afterD5.find((p) => p.square === "d5")!.id;

    const afterCapture = tracker.sync(fenAtPly(moves, 3), 3, moveAt(moves));

    expect(afterCapture).toHaveLength(31);
    expect(afterCapture.find((p) => p.square === "d5")!.id).toBe(capturerId);
    expect(afterCapture.some((p) => p.id === victimId)).toBe(false);
  });

  it("gives a promoted pawn a stable id and the new type", () => {
    const tracker = new PieceTracker();
    tracker.sync(PROMOTION_FEN, 0, none);
    const chess = new Chess(PROMOTION_FEN);
    const promo = chess.move({ from: "a7", to: "a8", promotion: "q" });
    const after = tracker.sync(
      chess.fen(),
      1,
      constant({ from: "a7", to: "a8", san: promo.san, colour: "w", promotion: "q" }),
    );
    const queen = after.find((p) => p.square === "a8")!;
    expect(queen.type).toBe("q");
    expect(new Set(after.map((p) => p.id)).size).toBe(after.length);
  });

  it("still produces a complete, unique set when jumping to an arbitrary review ply", () => {
    const tracker = new PieceTracker();
    tracker.sync(DEFAULT_FEN, 0, moveAt(SCHOLARS_MATE));
    const jumped = tracker.sync(fenAtPly(SCHOLARS_MATE, 6), 6, moveAt(SCHOLARS_MATE));
    expect(jumped).toHaveLength(piecesFromFen(fenAtPly(SCHOLARS_MATE, 6)).length);
    expect(new Set(jumped.map((p) => p.id)).size).toBe(jumped.length);
  });

  it("reset() starts the id sequence over", () => {
    const tracker = new PieceTracker();
    const first = tracker.sync(DEFAULT_FEN, 0, none);
    tracker.reset();
    const second = tracker.sync(DEFAULT_FEN, 0, none);
    expect(second.map((p) => p.id)).toEqual(first.map((p) => p.id));
  });

  it("is idempotent — re-syncing the same ply keeps every id", () => {
    const tracker = new PieceTracker();
    tracker.sync(DEFAULT_FEN, 0, moveAt(SCHOLARS_MATE));
    const once = tracker.sync(fenAtPly(SCHOLARS_MATE, 1), 1, moveAt(SCHOLARS_MATE));
    const twice = tracker.sync(fenAtPly(SCHOLARS_MATE, 1), 1, moveAt(SCHOLARS_MATE));
    expect(twice.map((p) => p.id)).toEqual(once.map((p) => p.id));
  });

  it("stays consistent across a whole game replayed move by move, forwards and back", () => {
    const tracker = new PieceTracker();
    tracker.sync(DEFAULT_FEN, 0, moveAt(SCHOLARS_MATE));
    for (let ply = 1; ply <= SCHOLARS_MATE.length; ply++) {
      const pieces = tracker.sync(fenAtPly(SCHOLARS_MATE, ply), ply, moveAt(SCHOLARS_MATE));
      expect(new Set(pieces.map((p) => p.id)).size).toBe(pieces.length);
    }
    for (let ply = SCHOLARS_MATE.length - 1; ply >= 0; ply--) {
      const pieces = tracker.sync(fenAtPly(SCHOLARS_MATE, ply), ply, moveAt(SCHOLARS_MATE));
      expect(new Set(pieces.map((p) => p.id)).size).toBe(pieces.length);
    }
  });
});

/* ------------------------------------------- derivePieces (render purity) */

// Review GF-5: `useGameController` calls `derivePieces` in its RENDER body and adjusts
// state from the result, so the function has to behave like a pure reducer under the
// React Compiler: no hidden mutation of its input, identical output for identical input,
// and a fixed point after one step (otherwise the render-phase setState loops forever).
describe("derivePieces (the render-safe core of PieceTracker)", () => {
  const moveAt = (moves: string[]) => (ply: number) => lastMoveAtPly(moves, ply);

  /** What the controller does: derive, adopt the new state, derive again until settled. */
  function renderUntilSettled(
    state: PieceTrackerState,
    fen: string,
    ply: number,
    moveEndingAt: (ply: number) => LastMove | null,
  ): { state: PieceTrackerState; renders: number } {
    let current = state;
    for (let renders = 1; renders <= 5; renders++) {
      const derived = derivePieces(current, fen, ply, moveEndingAt);
      if (derived === current) return { state: current, renders };
      current = derived;
    }
    throw new Error("derivePieces never reached a fixed point");
  }

  it("is a pure function: deriving twice from the same state yields the same ids", () => {
    const start = derivePieces(EMPTY_PIECE_TRACKER_STATE, DEFAULT_FEN, 0, moveAt(SCHOLARS_MATE));
    const fen1 = fenAtPly(SCHOLARS_MATE, 1);

    const first = derivePieces(start, fen1, 1, moveAt(SCHOLARS_MATE));
    const second = derivePieces(start, fen1, 1, moveAt(SCHOLARS_MATE));

    expect(second.pieces).toEqual(first.pieces);
    expect(second.seq).toBe(first.seq);
    // ...and the shared input state was not mutated by either call.
    expect(start.ply).toBe(0);
    expect(start.pieces.find((p) => p.square === "e2")!.id).toBe(
      first.pieces.find((p) => p.square === "e4")!.id,
    );
  });

  it("re-deriving its own fen/ply returns the SAME state object (the fixed point)", () => {
    const start = derivePieces(EMPTY_PIECE_TRACKER_STATE, DEFAULT_FEN, 0, moveAt(SCHOLARS_MATE));
    expect(derivePieces(start, DEFAULT_FEN, 0, moveAt(SCHOLARS_MATE))).toBe(start);

    // So the controller's render -> setState -> render cycle settles in one extra pass,
    // and `position` keeps a stable array identity between unrelated re-renders.
    const settled = renderUntilSettled(start, fenAtPly(SCHOLARS_MATE, 1), 1, moveAt(SCHOLARS_MATE));
    expect(settled.renders).toBe(2);
    expect(settled.state.pieces).toBe(
      renderUntilSettled(settled.state, fenAtPly(SCHOLARS_MATE, 1), 1, moveAt(SCHOLARS_MATE)).state
        .pieces,
    );
  });

  it("asks for the explaining move at most once per transition, even across re-renders", () => {
    let calls = 0;
    const counted = (ply: number) => {
      calls++;
      return lastMoveAtPly(SCHOLARS_MATE, ply);
    };
    const start = derivePieces(EMPTY_PIECE_TRACKER_STATE, DEFAULT_FEN, 0, counted);
    calls = 0;
    renderUntilSettled(start, fenAtPly(SCHOLARS_MATE, 1), 1, counted);
    expect(calls).toBe(1);
  });

  it("keeps ids stable across a whole game driven the way the controller drives it", () => {
    let state = renderUntilSettled(
      EMPTY_PIECE_TRACKER_STATE,
      DEFAULT_FEN,
      0,
      moveAt(SCHOLARS_MATE),
    ).state;
    const pawnId = state.pieces.find((p) => p.square === "e2")!.id;

    for (let ply = 1; ply <= SCHOLARS_MATE.length; ply++) {
      state = renderUntilSettled(state, fenAtPly(SCHOLARS_MATE, ply), ply, moveAt(SCHOLARS_MATE))
        .state;
      expect(new Set(state.pieces.map((p) => p.id)).size).toBe(state.pieces.length);
    }
    // 1.e4 ... the same pawn is still on e4 seven plies later, with the same id.
    expect(state.pieces.find((p) => p.square === "e4")!.id).toBe(pawnId);

    for (let ply = SCHOLARS_MATE.length - 1; ply >= 0; ply--) {
      state = renderUntilSettled(state, fenAtPly(SCHOLARS_MATE, ply), ply, moveAt(SCHOLARS_MATE))
        .state;
      expect(new Set(state.pieces.map((p) => p.id)).size).toBe(state.pieces.length);
    }
    expect(state.pieces.find((p) => p.square === "e2")!.id).toBe(pawnId);
  });

  it("re-derives from scratch after the controller resets on a take-back", () => {
    const state = renderUntilSettled(
      EMPTY_PIECE_TRACKER_STATE,
      fenAtPly(SCHOLARS_MATE, 3),
      3,
      moveAt(SCHOLARS_MATE),
    ).state;
    // §E.5.7: `undo` throws the state away rather than mutating a tracker instance.
    const afterReset = renderUntilSettled(
      EMPTY_PIECE_TRACKER_STATE,
      fenAtPly(SCHOLARS_MATE, 1),
      1,
      moveAt(SCHOLARS_MATE),
    ).state;
    expect(new Set(afterReset.pieces.map((p) => p.id)).size).toBe(afterReset.pieces.length);
    expect(afterReset.pieces[0].id).toBe("p1");
    expect(state.ply).toBe(3);
  });
});

/* ------------------------------------------------- coordinates (constants) */

describe("board coordinate helpers", () => {
  it("maps the board corners to the documented world positions", () => {
    expect(squareToWorld("a1")).toEqual([-3.5, 0, 3.5]);
    expect(squareToWorld("h8")).toEqual([3.5, 0, -3.5]);
    expect(squareToWorld("a8")).toEqual([-3.5, 0, -3.5]);
    expect(squareToWorld("h1")).toEqual([3.5, 0, 3.5]);
    expect(squareToWorld("e4")).toEqual([0.5, 0, 0.5]);
  });

  it("round-trips through worldToSquare for all 64 squares", () => {
    for (const file of "abcdefgh") {
      for (const rank of "12345678") {
        const square = `${file}${rank}` as SquareId;
        const [x, , z] = squareToWorld(square);
        expect(worldToSquare(x, z)).toBe(square);
        // a raycast hit anywhere inside the square still resolves to it
        expect(worldToSquare(x + 0.4, z - 0.4)).toBe(square);
      }
    }
  });

  it("worldToSquare returns null off the board", () => {
    expect(worldToSquare(9, 0)).toBeNull();
    expect(worldToSquare(0, -9)).toBeNull();
    expect(worldToSquare(-4.6, 0)).toBeNull();
  });

  it("squareIndices is 0-based from a1", () => {
    expect(squareIndices("a1")).toEqual({ file: 0, rank: 0 });
    expect(squareIndices("h8")).toEqual({ file: 7, rank: 7 });
  });

  it("isLightSquare treats a1 as dark and h1 as light", () => {
    expect(isLightSquare("a1")).toBe(false);
    expect(isLightSquare("h1")).toBe(true);
    expect(isLightSquare("a8")).toBe(true);
    expect(isLightSquare("h8")).toBe(false);
    // exactly 32 of each
    const squares = [...piecesFromFen(DEFAULT_FEN)].length; // sanity: fixture still 32 pieces
    expect(squares).toBe(32);
  });

  it("gridPosition flips with the orientation", () => {
    expect(gridPosition("a8", "w")).toEqual({ row: 0, col: 0 });
    expect(gridPosition("a1", "w")).toEqual({ row: 7, col: 0 });
    expect(gridPosition("a1", "b")).toEqual({ row: 0, col: 7 });
    expect(gridPosition("h8", "b")).toEqual({ row: 7, col: 0 });
  });

  it("gridPosition covers each of the 64 cells exactly once per orientation", () => {
    for (const orientation of ["w", "b"] as const) {
      const cells = new Set<string>();
      for (const file of "abcdefgh") {
        for (const rank of "12345678") {
          const { row, col } = gridPosition(`${file}${rank}` as SquareId, orientation);
          expect(row).toBeGreaterThanOrEqual(0);
          expect(row).toBeLessThanOrEqual(7);
          cells.add(`${row},${col}`);
        }
      }
      expect(cells.size).toBe(64);
    }
  });
});

/* ------------------------------------------------------------ matchmaking */

describe("queueRangeAt", () => {
  it("starts at the base range", () => {
    expect(queueRangeAt(1000, 1000)).toBe(200);
    expect(queueRangeAt(1000, 900)).toBe(200); // clock skew cannot narrow the window
  });

  it("widens by one step every 10 s", () => {
    expect(queueRangeAt(0, 9_999)).toBe(200);
    expect(queueRangeAt(0, 10_000)).toBe(300);
    expect(queueRangeAt(0, 25_000)).toBe(400);
    expect(queueRangeAt(0, 60_000)).toBe(800);
  });

  it("is monotonically non-decreasing in time", () => {
    let previous = 0;
    for (let t = 0; t <= 120_000; t += 1_000) {
      const range = queueRangeAt(0, t);
      expect(range).toBeGreaterThanOrEqual(previous);
      previous = range;
    }
  });
});

/* ----------------------------------------------------------------- camera */

describe("camera presets and quality tiers", () => {
  it("seats white at +Z and black at -Z, both looking at the origin", () => {
    expect(CAMERA_PRESETS.white.position[2]).toBeGreaterThan(0);
    expect(CAMERA_PRESETS.black.position[2]).toBeLessThan(0);
    expect(CAMERA_PRESETS.white.target).toEqual([0, 0, 0]);
    expect(CAMERA_PRESETS.black.target).toEqual([0, 0, 0]);
    expect(CAMERA_PRESETS.white.position[1]).toBe(CAMERA_PRESETS.black.position[1]);
  });

  // camera-controls clamps the polar angle in rotateTo()/the pointer handlers but NOT in
  // setLookAt(), so a preset outside the FR-20 range stays there until the first orbit
  // drag and then snaps. Every preset must already be inside the clamp.
  it("keeps every preset inside the FR-20 polar clamp", () => {
    for (const pose of Object.values(CAMERA_PRESETS)) {
      const [x, y, z] = [
        pose.position[0] - pose.target[0],
        pose.position[1] - pose.target[1],
        pose.position[2] - pose.target[2],
      ];
      const polar = Math.acos(y / Math.hypot(x, y, z));
      expect(polar).toBeGreaterThanOrEqual(CAMERA_LIMITS.minPolarAngle);
      expect(polar).toBeLessThanOrEqual(CAMERA_LIMITS.maxPolarAngle);
    }
  });

  it("keeps the top-down preset overhead but off the singularity", () => {
    expect(CAMERA_PRESETS.top.position[2]).not.toBe(0);
    // Well above the seats, and looking almost straight down.
    expect(CAMERA_PRESETS.top.position[1]).toBeGreaterThan(CAMERA_PRESETS.white.position[1]);
    expect(Math.abs(CAMERA_PRESETS.top.position[2])).toBeLessThan(
      Math.abs(CAMERA_PRESETS.white.position[2]),
    );
  });

  it("keeps every preset inside the dolly limits", () => {
    for (const pose of Object.values(CAMERA_PRESETS)) {
      const distance = Math.hypot(
        pose.position[0] - pose.target[0],
        pose.position[1] - pose.target[1],
        pose.position[2] - pose.target[2],
      );
      expect(distance).toBeGreaterThanOrEqual(CAMERA_LIMITS.minDistance);
      expect(distance).toBeLessThanOrEqual(CAMERA_LIMITS.maxDistance);
    }
  });

  it("has a sane clamp range", () => {
    expect(CAMERA_LIMITS.minPolarAngle).toBeLessThan(CAMERA_LIMITS.maxPolarAngle);
    expect(CAMERA_LIMITS.maxPolarAngle).toBeLessThan(Math.PI / 2);
    expect(CAMERA_LIMITS.minDistance).toBeLessThan(CAMERA_LIMITS.maxDistance);
    for (let i = 0; i < 3; i++) {
      expect(CAMERA_LIMITS.boundaryMin[i]).toBeLessThan(CAMERA_LIMITS.boundaryMax[i]);
    }
  });

  it("maps a colour to its seat and cinematic to the white pose", () => {
    expect(seatPresetFor("w")).toBe("white");
    expect(seatPresetFor("b")).toBe("black");
    expect(poseForPreset("cinematic")).toBe(CAMERA_PRESETS.white);
    expect(poseForPreset("black")).toBe(CAMERA_PRESETS.black);
    expect(poseForPreset("top")).toBe(CAMERA_PRESETS.top);
  });

  it("minFitDistance needs more distance the narrower the canvas gets", () => {
    const wide = minFitDistance(4.7, 16 / 9);
    const square = minFitDistance(4.7, 1);
    const tall = minFitDistance(4.7, 0.75);
    expect(square).toBeGreaterThan(wide);
    expect(tall).toBeGreaterThan(square);
    // The horizontal half-angle is the vertical fov widened by the aspect, so the
    // distance is exactly inversely proportional to it.
    expect(square / wide).toBeCloseTo(16 / 9, 5);
    // The automatic fit may pass FR-22's player-dolly ceiling (the rig raises
    // `controls.maxDistance` to match) but never the fit ceiling, however narrow the
    // box: a portrait fullscreen canvas needs ~28 units, and 22 cropped a fifth of it.
    expect(tall).toBeLessThanOrEqual(CAMERA_LIMITS.maxFitDistance);
    expect(minFitDistance(4.7, 0.01)).toBe(CAMERA_LIMITS.maxFitDistance);
    expect(CAMERA_LIMITS.maxFitDistance).toBeGreaterThan(CAMERA_LIMITS.maxDistance);
  });

  it("minFitDistance survives a canvas that has not been measured yet", () => {
    // A zero-height canvas (the frame before layout) must not produce Infinity.
    expect(minFitDistance(4.7, 0)).toBe(minFitDistance(4.7, 1));
    expect(minFitDistance(4.7, Number.NaN)).toBe(minFitDistance(4.7, 1));
  });

  it("nearCornerAdvance measures the ground run of the pose, not its length", () => {
    // The white seat is [0, 7.5, 9] from the target: 9 of its 11.71 units of distance
    // are horizontal, so a corner half a plinth toward the camera is that fraction
    // nearer along the view axis.
    const seat = CAMERA_PRESETS.white;
    const distance = Math.hypot(...seat.position);
    expect(nearCornerAdvance(seat, 4.55)).toBeCloseTo((9 / distance) * 4.55, 6);
    // Straight overhead there is no ground run at all, so nothing is nearer.
    expect(nearCornerAdvance({ position: [0, 10, 0], target: [0, 0, 0] }, 4.55)).toBeCloseTo(0, 6);
    // A degenerate pose cannot divide by zero.
    expect(nearCornerAdvance({ position: [0, 0, 0], target: [0, 0, 0] }, 4.55)).toBe(0);
  });

  it("minFitDistance adds the near corner's depth advantage on top of the plane fit", () => {
    const plane = minFitDistance(4.7, 1);
    expect(minFitDistance(4.7, 1, CAMERA_LIMITS.fov, 3.5)).toBeCloseTo(plane + 3.5, 5);
    // Negative advances (a corner BEHIND the target) never pull the camera in.
    expect(minFitDistance(4.7, 1, CAMERA_LIMITS.fov, -3.5)).toBe(plane);
  });

  it("fitPoseToAspect keeps the near corners of a square board inside a square canvas", () => {
    const pose = CAMERA_PRESETS.white;
    const half = 4.7;
    const flat = fitPoseToAspect(pose, half, 1);
    const solid = fitPoseToAspect(pose, half, 1, half);
    // Ignoring the depth of the board is exactly what used to crop it.
    expect(Math.hypot(...solid.position)).toBeGreaterThan(Math.hypot(...flat.position));

    // The corner nearest the camera is now inside the horizontal frustum. In camera
    // space: |x| must not exceed depth * tan(fov/2) * aspect.
    const halfAngle = Math.tan(((CAMERA_LIMITS.fov / 2) * Math.PI) / 180);
    /** Is the board corner nearest the camera inside this pose's horizontal frustum? */
    const cornerFits = (candidate: typeof pose) => {
      const d = Math.hypot(...candidate.position);
      const forward = candidate.position.map((v) => -v / d);
      const toCorner = [
        half - candidate.position[0],
        -candidate.position[1],
        half - candidate.position[2],
      ];
      const depth = toCorner.reduce((sum, v, i) => sum + v * forward[i]!, 0);
      // The camera sits on the world YZ plane, so its right vector is world +X and
      // the corner's horizontal offset from the view axis is simply its x.
      return Math.abs(toCorner[0]!) <= depth * halfAngle + 1e-9;
    };
    expect(cornerFits(flat)).toBe(false);
    expect(cornerFits(solid)).toBe(true);
  });

  it("fitPoseToAspect only ever pushes the camera back, never pulls it in", () => {
    const pose = CAMERA_PRESETS.white;
    const distance = Math.hypot(...pose.position);

    // A wide canvas already frames the board: the pose is returned untouched, so the
    // framing the presets were tuned for is bit-for-bit the same.
    expect(fitPoseToAspect(pose, 4.7, 16 / 9)).toBe(pose);

    // A square one does not.
    const fitted = fitPoseToAspect(pose, 4.7, 1);
    expect(fitted).not.toBe(pose);
    const fittedDistance = Math.hypot(...fitted.position);
    expect(fittedDistance).toBeGreaterThan(distance);
    expect(fittedDistance).toBeCloseTo(minFitDistance(4.7, 1), 5);
    // Same seat: only the distance moves, so the view direction is unchanged.
    expect(fitted.target).toEqual(pose.target);
    for (let i = 0; i < 3; i++) {
      expect(fitted.position[i] / fittedDistance).toBeCloseTo(pose.position[i] / distance, 5);
    }
  });

  it("fitPoseToAspect leaves the black seat on its own side of the board", () => {
    const fitted = fitPoseToAspect(CAMERA_PRESETS.black, 4.7, 1);
    expect(fitted.position[2]).toBeLessThan(0);
    expect(fitted.position[1]).toBeGreaterThan(0);
  });

  it("autoQualityTier picks Low for weak hardware", () => {
    expect(autoQualityTier({ hardwareConcurrency: 16, devicePixelRatio: 2, gpuTier: 1, isMobile: false })).toBe("low");
    expect(autoQualityTier({ hardwareConcurrency: 4, devicePixelRatio: 2, gpuTier: 3, isMobile: false })).toBe("low");
    expect(autoQualityTier({ hardwareConcurrency: 2, devicePixelRatio: 1, gpuTier: 0, isMobile: true })).toBe("low");
  });

  it("autoQualityTier never picks High on mobile", () => {
    expect(autoQualityTier({ hardwareConcurrency: 8, devicePixelRatio: 3, gpuTier: 3, isMobile: true })).toBe("medium");
  });

  it("autoQualityTier picks High only for a strong desktop", () => {
    expect(autoQualityTier({ hardwareConcurrency: 8, devicePixelRatio: 2, gpuTier: 3, isMobile: false })).toBe("high");
    expect(autoQualityTier({ hardwareConcurrency: 8, devicePixelRatio: 1, gpuTier: 3, isMobile: false })).toBe("medium");
    expect(autoQualityTier({ hardwareConcurrency: 6, devicePixelRatio: 2, gpuTier: 2, isMobile: false })).toBe("medium");
  });

  it("dropTier steps down once and stops at Low", () => {
    expect(dropTier("high")).toBe("medium");
    expect(dropTier("medium")).toBe("low");
    expect(dropTier("low")).toBe("low");
  });
});
