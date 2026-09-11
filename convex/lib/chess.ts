// convex/lib/chess.ts
//
// Server-authoritative chess helpers (NFR-4). chess.js runs in the DEFAULT Convex
// runtime — no `"use node"` (chessjs.md §12.1, proven on this deployment).
//
// Two rules that everything here exists to enforce:
//  1. `games.moves` (SAN) is the source of truth. Every position change replays it
//     from the start, because a `Chess` built from a stored FEN has no history and
//     therefore can never detect threefold repetition (chessjs.md §3).
//  2. A `Move` is a CLASS instance and is NOT a Convex value — it throws at the
//     function boundary. Always flatten it (chessjs.md §12.5a).
import { Chess } from "chess.js";
import type { Move } from "chess.js";

export type Colour = "w" | "b";
export type Winner = "w" | "b" | "draw";
export type PromotionPiece = "q" | "r" | "b" | "n";

export type TerminalStatus = "checkmate" | "stalemate" | "draw";
export type EndReason =
  | "checkmate"
  | "stalemate"
  | "threefold"
  | "fifty-move"
  | "insufficient"
  | "agreement"
  | "resignation"
  | "abandonment";

export type GameOutcome =
  | { status: "active" }
  | { status: TerminalStatus; winner: Winner; endReason: EndReason };

/** Denormalised `games.lastMove` — a plain object, never a `Move` instance. */
export interface StoredLastMove {
  from: string;
  to: string;
  san: string;
  colour: Colour;
  captured?: string;
  /** Only set when the captured piece did NOT stand on `to` — i.e. en passant. */
  capturedSquare?: string;
  promotion?: string;
}

/**
 * Rebuild the authoritative position by replaying the stored SAN list.
 * Throws `"corrupt-move-list"` if a stored SAN no longer parses (should be
 * impossible — chess.js generated every entry itself).
 */
export function replay(sans: readonly string[]): Chess {
  const chess = new Chess();
  for (const san of sans) {
    try {
      chess.move(san);
    } catch {
      throw new Error("corrupt-move-list");
    }
  }
  return chess;
}

/**
 * Replay, keeping the final `Move` so `games.lastMove` can be rebuilt without
 * paying for `history({ verbose: true })` (~5 ms on a 60-move game).
 */
export function replayWithLast(sans: readonly string[]): {
  chess: Chess;
  last: Move | null;
} {
  const chess = new Chess();
  let last: Move | null = null;
  for (const san of sans) {
    try {
      last = chess.move(san);
    } catch {
      throw new Error("corrupt-move-list");
    }
  }
  return { chess, last };
}

/** Apply a from/to(/promotion) move. Throws `"illegal-move"` on anything invalid. */
export function applyMove(
  chess: Chess,
  input: { from: string; to: string; promotion?: PromotionPiece },
): Move {
  try {
    return chess.move({ from: input.from, to: input.to, promotion: input.promotion });
  } catch {
    throw new Error("illegal-move");
  }
}

/**
 * Apply SAN (or LAN — the default parser is permissive, which is what the model
 * needs; chessjs.md §4). Throws `"illegal-move"`.
 */
export function applySan(chess: Chess, san: string): Move {
  try {
    return chess.move(san);
  } catch {
    throw new Error("illegal-move");
  }
}

/**
 * True when from→to requires a promotion choice (FR-11 — chess.js has no
 * implicit auto-queen; the object form rejects a promotion move without it).
 */
export function needsPromotion(chess: Chess, from: string, to: string): boolean {
  return chess
    .moves({ verbose: true })
    .some((m) => m.from === from && m.to === to && m.promotion !== undefined);
}

/**
 * FR-13 status detection, in this exact order. `isDraw()` includes stalemate in
 * chess.js 1.4.0, so it must never be checked first (chessjs.md §8).
 */
export function gameStatus(chess: Chess): GameOutcome {
  if (chess.isCheckmate()) {
    return {
      status: "checkmate",
      winner: chess.turn() === "w" ? "b" : "w",
      endReason: "checkmate",
    };
  }
  if (chess.isStalemate()) {
    return { status: "stalemate", winner: "draw", endReason: "stalemate" };
  }
  if (chess.isThreefoldRepetition()) {
    return { status: "draw", winner: "draw", endReason: "threefold" };
  }
  if (chess.isInsufficientMaterial()) {
    return { status: "draw", winner: "draw", endReason: "insufficient" };
  }
  if (chess.isDrawByFiftyMoves()) {
    return { status: "draw", winner: "draw", endReason: "fifty-move" };
  }
  return { status: "active" };
}

/** Flatten a `Move` for storage. Optional fields are omitted, never `undefined`. */
export function toStoredLastMove(move: Move): StoredLastMove {
  const stored: StoredLastMove = {
    from: move.from,
    to: move.to,
    san: move.san,
    colour: move.color,
  };
  if (move.captured !== undefined) stored.captured = move.captured;
  // The board animates the captured piece flying off `capturedSquare`; for en passant
  // that is one rank behind the destination, never `to` itself.
  if (move.isEnPassant()) stored.capturedSquare = `${move.to[0]}${move.from[1]}`;
  if (move.promotion !== undefined) stored.promotion = move.promotion;
  return stored;
}

/** PGN `Result` tag for a finished game (chess.js never infers it — §12.3). */
export function pgnResult(winner: Winner | undefined): "1-0" | "0-1" | "1/2-1/2" | null {
  if (winner === "w") return "1-0";
  if (winner === "b") return "0-1";
  if (winner === "draw") return "1/2-1/2";
  return null;
}

/**
 * The derived fields written on every position change. `pgn()` costs ~5 ms on a
 * 60-move game, so this is called exactly once per mutation (chessjs.md §12.6).
 */
export function snapshot(
  chess: Chess,
  winner?: Winner,
): { fen: string; pgn: string; turn: Colour } {
  const result = pgnResult(winner);
  if (result !== null) chess.setHeader("Result", result);
  return { fen: chess.fen(), pgn: chess.pgn(), turn: chess.turn() };
}

/** The opening snapshot for a freshly created game. */
export function startingSnapshot(): { fen: string; pgn: string; turn: Colour } {
  return snapshot(new Chess());
}

export function otherColour(colour: Colour): Colour {
  return colour === "w" ? "b" : "w";
}
