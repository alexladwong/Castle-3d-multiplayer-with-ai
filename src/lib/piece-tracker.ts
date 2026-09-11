// src/lib/piece-tracker.ts
// FR-17: pieces must SLIDE, not pop. A FEN carries no identity, so one tracker state
// per game re-uses ids across positions. Both boards receive the same `BoardPiece[]`,
// so 2D and 3D animate identically.
//
// The algorithm is exposed twice:
//   * `derivePieces(state, ...)` — a PURE state transition, safe to call during render
//     (React Compiler / `react-hooks/purity`). `useGameController` uses this one.
//   * `PieceTracker` — a thin mutable wrapper for callers that own the loop themselves
//     (the /dev/board3d preview, tests).
import type { BoardPiece, Colour, LastMove, PieceSymbol, SquareId } from "./types";
import { piecesFromFen } from "./chess";

type Slot = { id: string; type: PieceSymbol; colour: Colour };

const CASTLE_ROOK: Record<string, { from: SquareId; to: SquareId }> = {
  "e1g1": { from: "h1", to: "f1" },
  "e1c1": { from: "a1", to: "d1" },
  "e8g8": { from: "h8", to: "f8" },
  "e8c8": { from: "a8", to: "d8" },
};

/**
 * Everything the next derivation needs, plus the list it produced. Treat it as opaque
 * and immutable: `derivePieces` never mutates its input, so the same state can be fed
 * to it any number of times — that is what makes it legal in a render body.
 */
export interface PieceTrackerState {
  /** Occupied squares → the identity currently standing on them. */
  readonly slots: ReadonlyMap<SquareId, Slot>;
  /** Last id handed out; ids are `p${seq}`. */
  readonly seq: number;
  /** Ply this state renders, or null when nothing has been rendered yet. */
  readonly ply: number | null;
  /** FEN this state renders, or null when nothing has been rendered yet. */
  readonly fen: string | null;
  /** The board list for (`fen`, `ply`). Cached so re-deriving the same pair is free. */
  readonly pieces: BoardPiece[];
}

export const EMPTY_PIECE_TRACKER_STATE: PieceTrackerState = {
  slots: new Map(),
  seq: 0,
  ply: null,
  fen: null,
  pieces: [],
};

/**
 * Produce the state for `fen`, which is the position after `ply` half-moves.
 *
 * Only an ADJACENT step has one move that explains the transition, and the direction
 * decides which move that is: stepping FORWARD to `ply` it is the move ending at `ply`;
 * stepping BACKWARD to `ply` it is the move ending at `ply + 1`, replayed in reverse.
 * Every other transition (first render, a review jump, a take-back) re-derives ids —
 * those are not animated (§E.8.6).
 *
 * `moveEndingAt` is called at most once, and only for an adjacent step, so the caller
 * may replay the game inside it.
 *
 * Contract relied on by `useGameController`: re-deriving a state's own (`fen`, `ply`)
 * returns that state **by reference**, so `derivePieces` reaches a fixed point after one
 * step and a render-phase state adjustment cannot loop.
 */
export function derivePieces(
  state: PieceTrackerState,
  fen: string,
  ply: number,
  moveEndingAt: (ply: number) => LastMove | null,
): PieceTrackerState {
  if (state.fen === fen && state.ply === ply) return state;

  const previousPly = state.ply;
  const pieces = piecesFromFen(fen);
  const prev = state.slots;
  const next = new Map<SquareId, Slot>();
  const used = new Set<string>();
  const bySquare = new Map<SquareId, (typeof pieces)[number]>();
  for (const p of pieces) bySquare.set(p.square, p);

  const carry = (from: SquareId, to: SquareId) => {
    const slot = prev.get(from);
    const piece = bySquare.get(to);
    if (!slot || !piece || used.has(slot.id)) return;
    used.add(slot.id);
    next.set(to, { id: slot.id, type: piece.type, colour: piece.colour });
  };

  // `reverse` is true when the move is being un-played, i.e. it is carrying the
  // pieces from their destination squares back to their origins.
  const applyMove = (move: LastMove | null, reverse: boolean) => {
    if (!move) return;
    const rook = CASTLE_ROOK[`${move.from}${move.to}`];
    const castled = rook !== undefined && move.san.startsWith("O-O");
    if (reverse) {
      carry(move.to, move.from);
      if (castled) carry(rook.to, rook.from);
      return;
    }
    carry(move.from, move.to);
    if (castled) carry(rook.from, rook.to);
  };

  if (previousPly !== null && ply === previousPly + 1) {
    applyMove(moveEndingAt(ply), false);
  } else if (previousPly !== null && ply === previousPly - 1) {
    applyMove(moveEndingAt(previousPly), true);
  }

  // Pieces that did not move keep their id.
  for (const piece of pieces) {
    if (next.has(piece.square)) continue;
    const slot = prev.get(piece.square);
    if (slot && !used.has(slot.id) && slot.type === piece.type && slot.colour === piece.colour) {
      used.add(slot.id);
      next.set(piece.square, slot);
    }
  }
  // Anything left (first render, review jump, promotion into a new square) gets a fresh id.
  let seq = state.seq;
  for (const piece of pieces) {
    if (next.has(piece.square)) continue;
    next.set(piece.square, { id: `p${++seq}`, type: piece.type, colour: piece.colour });
  }

  return {
    slots: next,
    seq,
    ply,
    fen,
    pieces: pieces.map((p) => {
      const slot = next.get(p.square)!;
      return { id: slot.id, square: p.square, type: p.type, colour: p.colour };
    }),
  };
}

/** Mutable convenience wrapper around {@link derivePieces}. Never use it during render. */
export class PieceTracker {
  private state: PieceTrackerState = EMPTY_PIECE_TRACKER_STATE;

  reset(): void {
    this.state = EMPTY_PIECE_TRACKER_STATE;
  }

  /** See {@link derivePieces} — same semantics, with the state carried internally. */
  sync(
    fen: string,
    ply: number,
    moveEndingAt: (ply: number) => LastMove | null,
  ): BoardPiece[] {
    this.state = derivePieces(this.state, fen, ply, moveEndingAt);
    return this.state.pieces;
  }
}
