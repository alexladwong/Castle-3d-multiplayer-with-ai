// src/lib/engine/candidates.ts
//
// PvLine[] -> Candidate[] (the payload handed to the Eve agent) plus the local
// difficulty selection policy used whenever the agent does not choose for us.
//
// Candidate generation always runs at Skill Level 20 (constants.STOCKFISH_CANDIDATE_SKILL_LEVEL):
// below 20 Stockfish randomises `bestmove` AND forces internal MultiPV >= 4, so the
// reported ranking would not match the move it plays (stockfish.md §6). The handicap
// therefore lives here, in JS, where it is deterministic and inspectable.
import { Chess } from "chess.js";
import type { Candidate, Difficulty, PromotionPiece, SquareId } from "@/lib/types";
import type { PvLine } from "./parse-uci";
import { isUciMove } from "./parse-uci";

/** Injectable RNG so the selection policy is testable. */
export type Random = () => number;

/**
 * Convert one UCI long-algebraic move to SAN in `fen`.
 * Returns null when the move is illegal in that position.
 */
export function uciToSan(fen: string, uci: string): string | null {
  if (!isUciMove(uci)) return null;
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2) as SquareId,
      to: uci.slice(2, 4) as SquareId,
      promotion: (uci.length > 4 ? uci.slice(4, 5) : undefined) as PromotionPiece | undefined,
    });
    return move.san;
  } catch {
    return null;
  }
}

/**
 * Accepts SAN *or* UCI/LAN (the model may emit either — chessjs.md §5 documents the
 * permissive parser) and returns the canonical SAN, or null when illegal in `fen`.
 */
export function normaliseMove(fen: string, move: string): string | null {
  const trimmed = move.trim();
  if (trimmed.length === 0) return null;
  try {
    return new Chess(fen).move(trimmed).san;
  } catch {
    return null;
  }
}

/** MultiPV lines -> candidates, best first, illegal/duplicate heads dropped. */
export function linesToCandidates(fen: string, lines: PvLine[]): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const line of [...lines].sort((a, b) => a.multipv - b.multipv)) {
    const uci = line.pv[0];
    if (uci === undefined) continue;
    const san = uciToSan(fen, uci);
    if (san === null || seen.has(san)) continue;
    seen.add(san);
    out.push({
      san,
      uci,
      scoreCp: line.scoreCp,
      mateIn: line.mateIn,
      depth: line.depth,
      pv: line.pv,
    });
  }
  return out;
}

/**
 * Engine-less last resort: build candidates straight from the legal move list so a
 * broken/blocked worker can never stall the game (§E.4 "Failure modes"). Scores are
 * null — the agent's instructions treat a scoreless list as "no engine opinion".
 */
export function candidatesFromLegalMoves(fen: string, limit = 5): Candidate[] {
  let verbose: ReturnType<Chess["moves"]> = [];
  try {
    verbose = new Chess(fen).moves({ verbose: true });
  } catch {
    return [];
  }
  return verbose.slice(0, Math.max(1, limit)).map((move) => ({
    san: move.san,
    uci: move.lan,
    scoreCp: null,
    mateIn: null,
    depth: 0,
    pv: [move.lan],
  }));
}

/** SAN captures always contain an `x` (chessjs.md §4 `san` field). */
export function isCaptureSan(san: string): boolean {
  return san.includes("x");
}

/** A forced mate FOR the side to move. */
function isWinningMate(candidate: Candidate): boolean {
  return candidate.mateIn !== null && candidate.mateIn > 0;
}

/** A line that walks into being mated. */
function isLosingMate(candidate: Candidate): boolean {
  return candidate.mateIn !== null && candidate.mateIn < 0;
}

function pick<T>(pool: readonly T[], random: Random): T {
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[Math.max(0, index)];
}

/**
 * The local difficulty policy, applied when the agent could not pick for us
 * (engine-only fallback, agent timeout, illegal agent move, /api/ai/move 5xx).
 *
 * | difficulty            | choose                                                  |
 * |-----------------------|---------------------------------------------------------|
 * | beginner              | random from the top 5; 50 % of the time prefer quiet moves |
 * | casual                | random from the top 3                                   |
 * | intermediate          | rank 1 (70 %) or rank 2 (30 %)                          |
 * | advanced/grandmaster  | rank 1, always                                          |
 *
 * Two overrides apply to every level so the AI never throws a game away on a coin
 * flip: a rank-1 forced mate is always taken, and lines that get mated are removed
 * from the random pool whenever a non-losing option exists.
 */
export function selectCandidate(
  difficulty: Difficulty,
  candidates: readonly Candidate[],
  random: Random = Math.random,
): Candidate | null {
  if (candidates.length === 0) return null;
  const best = candidates[0];
  if (isWinningMate(best)) return best;

  switch (difficulty) {
    case "advanced":
    case "grandmaster":
      return best;
    case "intermediate":
      return random() < 0.7 ? best : (candidates[1] ?? best);
    case "casual":
      return pick(safePool(candidates.slice(0, 3)), random);
    case "beginner": {
      const pool = safePool(candidates.slice(0, 5));
      if (random() < 0.5) {
        const quiet = pool.filter((c) => !isCaptureSan(c.san));
        if (quiet.length > 0) return pick(quiet, random);
      }
      return pick(pool, random);
    }
    default:
      return best;
  }
}

function safePool(pool: readonly Candidate[]): readonly Candidate[] {
  const safe = pool.filter((c) => !isLosingMate(c));
  return safe.length > 0 ? safe : pool;
}
