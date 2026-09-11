// src/lib/chess.ts
import { Chess } from "chess.js";
import type {
  CapturedPieces, Colour, LastMove, LegalTarget, MoveHistoryRow,
  PieceSymbol, PromotionPiece, SquareId,
} from "./types";
import { DEFAULT_FEN, PIECE_VALUES } from "./constants";

/** Replay a SAN list. Throws on the first illegal SAN — callers treat that as a bug. */
export function replay(moves: string[]): Chess {
  const chess = new Chess();
  for (const san of moves) chess.move(san);
  return chess;
}

/** FEN after `ply` half-moves (ply 0 = start position). O(ply) — memoise per game. */
export function fenAtPly(moves: string[], ply: number): string {
  if (ply <= 0) return DEFAULT_FEN;
  return replay(moves.slice(0, ply)).fen();
}

export function legalTargetsFor(fen: string, from: SquareId): LegalTarget[] {
  const chess = new Chess(fen);
  const seen = new Map<SquareId, LegalTarget>();
  for (const m of chess.moves({ square: from, verbose: true })) {
    const to = m.to as SquareId;
    const existing = seen.get(to);
    const target: LegalTarget = {
      to,
      // NOTE: isCapture() is false for en passant (chessjs.md §5) — use `captured`.
      isCapture: Boolean(m.captured),
      isPromotion: m.isPromotion(),
      isCastle: m.isKingsideCastle() || m.isQueensideCastle(),
      isEnPassant: m.isEnPassant(),
    };
    seen.set(to, existing ? { ...existing, isPromotion: existing.isPromotion || target.isPromotion } : target);
  }
  return [...seen.values()];
}

/** FR-11: a promotion picker must be shown before the move is submitted —
 *  chess.js has no implicit auto-queen and rejects the move without it. */
export function needsPromotion(fen: string, from: SquareId, to: SquareId): boolean {
  return new Chess(fen)
    .moves({ square: from, verbose: true })
    .some((m) => m.to === to && m.isPromotion());
}

export function isLegalMove(fen: string, from: SquareId, to: SquareId, promotion?: PromotionPiece): boolean {
  try {
    new Chess(fen).move({ from, to, promotion });
    return true;
  } catch {
    return false;
  }
}

/** Square of the king that is currently in check, or null. */
export function checkSquareOf(fen: string): SquareId | null {
  const chess = new Chess(fen);
  if (!chess.inCheck()) return null;
  return (chess.findPiece({ type: "k", color: chess.turn() })[0] as SquareId) ?? null;
}

export function piecesFromFen(fen: string): { square: SquareId; type: PieceSymbol; colour: Colour }[] {
  const out: { square: SquareId; type: PieceSymbol; colour: Colour }[] = [];
  for (const row of new Chess(fen).board()) {
    for (const cell of row) {
      if (cell) out.push({ square: cell.square as SquareId, type: cell.type, colour: cell.color });
    }
  }
  return out;
}

/** FR-16 captured tray, keyed by the CAPTURING colour. */
export function capturedFromMoves(moves: string[]): CapturedPieces {
  const out: CapturedPieces = { w: [], b: [] };
  const chess = new Chess();
  for (const san of moves) {
    const m = chess.move(san);
    if (m.captured) out[m.color].push(m.captured);
  }
  return out;
}

/** Positive = white is ahead. */
export function materialBalance(captured: CapturedPieces): number {
  const sum = (list: PieceSymbol[]) => list.reduce((n, p) => n + PIECE_VALUES[p], 0);
  return sum(captured.w) - sum(captured.b);
}

export function lastMoveAtPly(moves: string[], ply: number): LastMove | null {
  if (ply <= 0) return null;
  // Clamp: a review ply can outlive the move list it points into (a take-back shortens
  // `moves` while the board is still showing a later ply). chess.move(undefined) throws.
  const end = Math.min(ply, moves.length);
  const chess = new Chess();
  let last: LastMove | null = null;
  for (let i = 0; i < end; i++) {
    const m = chess.move(moves[i]);
    last = {
      from: m.from as SquareId,
      to: m.to as SquareId,
      san: m.san,
      colour: m.color,
      captured: m.captured,
      // En passant is the one capture whose victim is not on the destination square.
      capturedSquare: m.isEnPassant()
        ? (`${m.to[0]}${m.from[1]}` as SquareId)
        : undefined,
      promotion: m.promotion as PromotionPiece | undefined,
    };
  }
  return last;
}

/** FR-41: SAN paired by full-move number. */
export function toHistoryRows(moves: string[]): MoveHistoryRow[] {
  const rows: MoveHistoryRow[] = [];
  for (let i = 0; i < moves.length; i++) {
    const number = Math.floor(i / 2) + 1;
    const row = rows[number - 1] ?? { number };
    if (i % 2 === 0) row.white = { ply: i + 1, san: moves[i] };
    else row.black = { ply: i + 1, san: moves[i] };
    rows[number - 1] = row;
  }
  return rows;
}

/** FR-47 export. `result` is '1-0' | '0-1' | '1/2-1/2' | '*'. chess.js does not infer it. */
export function buildPgn(
  moves: string[],
  headers: { white: string; black: string; result: string; date?: Date; event?: string },
): string {
  const chess = replay(moves);
  const d = headers.date ?? new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  chess.setHeader("Event", headers.event ?? "Castle");
  chess.setHeader("Site", "Castle");
  chess.setHeader("Date", `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`);
  chess.setHeader("White", headers.white);
  chess.setHeader("Black", headers.black);
  chess.setHeader("Result", headers.result);
  return chess.pgn();
}
