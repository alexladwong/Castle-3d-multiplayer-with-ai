// src/lib/engine/fallback-move.ts
//
// The RAW ENGINE FALLBACK (review AI-10, §E.4 step 4 + "Failure modes").
//
// Normal turn: candidates are generated at Skill Level 20 + MultiPV so the ranking is
// honest, and the handicap is applied in JS (`selectCandidate`) or by the agent.
// This module is the OTHER path: the agent route failed, so Stockfish itself plays
// the move — and there the difficulty's `skillLevel` (PRD §3.8) is exactly the right
// knob. At Skill Level < 20 the engine deliberately picks a randomised sub-optimal
// move at iteration depth `1 + level`, and its `bestmove` no longer matches
// `multipv 1` (stockfish.md §6) — which is fine here, because nobody is ranking
// anything: we play `bestmove` verbatim.
//
// MultiPV is pinned to 1: extra lines cost time we do not have on a path that has
// already burned the agent budget, and Stockfish forces its own internal MultiPV >= 4
// when Skill Level < 20 anyway.
import type { Candidate, Difficulty } from "../types";
import { DIFFICULTIES } from "../difficulty";
import { STOCKFISH_CANDIDATE_SKILL_LEVEL } from "../constants";
import { uciToSan } from "./candidates";
import type { SearchRequest, SearchResult } from "./stockfish-client";

/** Below this there is no point starting a search: `stop` alone costs ~180 ms. */
export const FALLBACK_MIN_BUDGET_MS = 300;

/**
 * How long the raw-engine fallback may search, or null when it must not run at all.
 *
 * Two ways it must not run:
 *
 *  * `skillLevel >= STOCKFISH_CANDIDATE_SKILL_LEVEL` (Grandmaster) — the engine has no
 *    handicap left to apply, and candidate generation ALREADY ran this exact search at
 *    the same depth and Skill Level 20. `bestmove` would be `candidates[0]` again, which
 *    is what `selectCandidate`'s "Always pick rank 1" returns for free, so a second
 *    search buys nothing for several seconds.
 *  * The turn's budget is spent — the agent route may have burned all of
 *    `AI_ROUTE_TIMEOUT_MS` before this path was reached, and `runSearch` waits
 *    `timeoutMs` plus a 4 s `bestmove` grace on top.
 *
 * Otherwise the search is capped at whatever is LEFT of the turn budget (FR-38), never
 * a fresh `searchTimeoutMs`.
 */
export function fallbackSearchBudgetMs(
  difficulty: Difficulty,
  remainingBudgetMs: number,
): number | null {
  const config = DIFFICULTIES[difficulty];
  if (config.skillLevel >= STOCKFISH_CANDIDATE_SKILL_LEVEL) return null;
  if (!Number.isFinite(remainingBudgetMs) || remainingBudgetMs < FALLBACK_MIN_BUDGET_MS) return null;
  return Math.min(config.searchTimeoutMs, remainingBudgetMs);
}

export interface FallbackMoveInput {
  fen: string;
  difficulty: Difficulty;
  /** `useStockfish().search` — injected so this is testable without a worker. */
  search(request: SearchRequest): Promise<SearchResult>;
  signal?: AbortSignal;
  /** Overrides the difficulty's `searchTimeoutMs` (the caller may have less budget left). */
  timeoutMs?: number;
}

/**
 * Ask the engine, weakened to the difficulty's Skill Level, for one move.
 *
 * @returns the move as a {@link Candidate} (so the caller can log its eval), or null
 * when the engine is unavailable, aborted, mated/stalemated (`bestmove (none)`) or
 * answered with something illegal in `fen`. A null answer means "fall through to the
 * JS selection policy" — this path must never throw a turn away.
 */
export async function fallbackEngineMove(input: FallbackMoveInput): Promise<Candidate | null> {
  const config = DIFFICULTIES[input.difficulty];
  let result: SearchResult;
  try {
    result = await input.search({
      fen: input.fen,
      depth: config.depth,
      multiPv: 1,
      skillLevel: config.skillLevel,
      timeoutMs: input.timeoutMs ?? config.searchTimeoutMs,
      signal: input.signal,
    });
  } catch {
    return null;
  }
  if (input.signal?.aborted === true) return null;

  const uci = result.bestmove;
  if (uci === null) return null;
  const san = uciToSan(input.fen, uci);
  if (san === null) return null;

  // The score is informational only. With Skill Level < 20 `bestmove` is usually NOT
  // the head of `multipv 1`, so only attach the eval when the two agree.
  const line = result.lines.find((candidate) => candidate.pv[0] === uci) ?? null;
  return {
    san,
    uci,
    scoreCp: line?.scoreCp ?? null,
    mateIn: line?.mateIn ?? null,
    depth: line?.depth ?? config.depth,
    pv: line?.pv ?? [uci],
  };
}
