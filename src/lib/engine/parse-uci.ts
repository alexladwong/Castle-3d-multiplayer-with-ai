// src/lib/engine/parse-uci.ts
//
// UCI output parser shared by BOTH shipped builds — stockfish@18.0.8 lite-single (the
// default) and stockfish@11.0.0 (the no-SIMD fallback). See docs/research/stockfish.md
// §5 (SF18) and §11.2 (SF11).
// Every line the worker emits is a plain string. Only two line shapes matter:
//
//   info depth 13 seldepth 23 multipv 1 score cp -22 nodes 560401 nps 890939 time 629 pv e7e6 d2d4 ...
//   bestmove e7e5 ponder g1f3          (or `bestmove (none)` in a mated/stalemated position)
//
// Deliberately a token walk rather than the regex sketched in the research doc: SF11
// omits `hashfull` and sometimes `seldepth`/`nps` and appends a `bmc <float>` token after
// the pv, while SF18 emits `hashfull` and no `bmc`. A strict regex silently drops one
// build's lines or the other's. Scores are ALWAYS from the side-to-move's point of view.
// Verified 2026-09-09 by parsing live `go depth 6` MultiPV-3 output from both engines.

/** One `info ... multipv N ... pv ...` line, normalised. */
export interface PvLine {
  /** 1-based MultiPV rank. Present even when MultiPV is 1. */
  multipv: number;
  depth: number;
  seldepth: number | null;
  /** Centipawns from the side-to-move's POV; null when the line reports a mate. */
  scoreCp: number | null;
  /** Positive = side to move mates in N; negative = side to move gets mated. */
  mateIn: number | null;
  /** Principal variation in UCI long algebraic (`e2e4`, `e7e8q`). */
  pv: string[];
}

export interface BestMoveLine {
  /** UCI long algebraic, or null for `bestmove (none)`. */
  bestmove: string | null;
  ponder: string | null;
}

const UCI_MOVE_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** True for a syntactically valid UCI long-algebraic move (does not check legality). */
export function isUciMove(token: string): boolean {
  return UCI_MOVE_RE.test(token);
}

export function isUciOk(line: string): boolean {
  return line === "uciok" || line.startsWith("uciok ");
}

export function isReadyOk(line: string): boolean {
  return line === "readyok" || line.startsWith("readyok ");
}

export function isBestMove(line: string): boolean {
  return line.startsWith("bestmove");
}

/**
 * Parse an `info` line into a {@link PvLine}.
 * Returns null for `info string …`, for fail-high/fail-low partials
 * (`lowerbound`/`upperbound`), and for anything without a `pv`.
 */
export function parseInfoLine(line: string): PvLine | null {
  if (!line.startsWith("info ")) return null;
  if (line.startsWith("info string")) return null;

  const tokens = line.split(/\s+/);
  let depth: number | null = null;
  let seldepth: number | null = null;
  let multipv = 1;
  let scoreCp: number | null = null;
  let mateIn: number | null = null;
  let pv: string[] | null = null;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    switch (token) {
      case "depth":
        depth = toInt(tokens[++i]);
        break;
      case "seldepth":
        seldepth = toInt(tokens[++i]);
        break;
      case "multipv": {
        const value = toInt(tokens[++i]);
        if (value !== null) multipv = value;
        break;
      }
      case "score": {
        const kind = tokens[++i];
        const value = toInt(tokens[++i]);
        if (kind === "cp") scoreCp = value;
        else if (kind === "mate") mateIn = value;
        break;
      }
      case "lowerbound":
      case "upperbound":
        // Partial result from an aborted window search — the ranking it implies
        // is not trustworthy, so the whole line is discarded (stockfish.md §5).
        return null;
      case "pv": {
        // Take moves until the first non-move token. This build (the ddugovic /
        // chess.com fork shipped as stockfish@11.0.0) appends `bmc <float>` AFTER
        // the pv — verified live: "… pv c7c5 b1c3 … f1c4 bmc 5.09171".
        const moves: string[] = [];
        for (let j = i + 1; j < tokens.length; j++) {
          if (!isUciMove(tokens[j])) break;
          moves.push(tokens[j]);
        }
        pv = moves;
        i = tokens.length;
        break;
      }
      default:
        break;
    }
  }

  if (depth === null || pv === null || pv.length === 0) return null;
  if (scoreCp === null && mateIn === null) return null;
  return { multipv, depth, seldepth, scoreCp, mateIn, pv };
}

/** Parse `bestmove <uci> [ponder <uci>]`. Returns null when the line is not a bestmove. */
export function parseBestMove(line: string): BestMoveLine | null {
  if (!isBestMove(line)) return null;
  const tokens = line.split(/\s+/);
  const raw = tokens[1] ?? "";
  const bestmove = isUciMove(raw) ? raw : null;
  const ponderIndex = tokens.indexOf("ponder");
  const ponderRaw = ponderIndex >= 0 ? (tokens[ponderIndex + 1] ?? "") : "";
  return { bestmove, ponder: isUciMove(ponderRaw) ? ponderRaw : null };
}

/**
 * Collects `info` lines during one search, keeping only the deepest line per
 * MultiPV rank (later lines at the same rank supersede earlier ones), and
 * returns them best-first.
 */
export class PvCollector {
  private readonly byRank = new Map<number, PvLine>();

  /** Feed one engine line. Returns true when it updated the table. */
  accept(line: string): boolean {
    const parsed = parseInfoLine(line);
    if (parsed === null) return false;
    const existing = this.byRank.get(parsed.multipv);
    // Guard against a late shallower line overwriting a deeper one after `stop`.
    if (existing !== undefined && existing.depth > parsed.depth) return false;
    this.byRank.set(parsed.multipv, parsed);
    return true;
  }

  lines(): PvLine[] {
    return [...this.byRank.values()].sort((a, b) => a.multipv - b.multipv);
  }

  clear(): void {
    this.byRank.clear();
  }
}

function toInt(token: string | undefined): number | null {
  if (token === undefined) return null;
  const value = Number.parseInt(token, 10);
  return Number.isFinite(value) ? value : null;
}
