// src/lib/format.ts
// Presentation helpers shared by P2 (profile, leaderboard, play) and P3 (game header,
// result dialog, history panel). Pure functions only — no React, no Convex, no wall clock.
//
// Anything time-dependent takes `now` as an explicit argument: a helper that read
// `Date.now()` internally would render differently on the server and on the client and
// produce a hydration mismatch.
import type {
  CapturedPieces, Colour, EndReason, GameMode, GameStatus, PieceSymbol, Winner,
} from "./types";
import { PIECE_VALUES } from "./constants";

/* --------------------------------------------------------------------- ratings */

export function formatRating(rating: number): string {
  return String(Math.round(rating));
}

/** "+12" / "-8" / "±0" — the leading sign is always shown. */
export function formatRatingDelta(delta: number): string {
  const d = Math.round(delta);
  if (d === 0) return "±0";
  return d > 0 ? `+${d}` : String(d);
}

export interface PlayerRecord {
  wins: number;
  losses: number;
  draws: number;
}

/** "12W · 3L · 2D" */
export function formatRecord(record: PlayerRecord): string {
  return `${record.wins}W · ${record.losses}L · ${record.draws}D`;
}

export function totalGames(record: PlayerRecord): number {
  return record.wins + record.losses + record.draws;
}

/** Win rate as a whole percentage; draws count as half a win. Returns "—" with no games. */
export function formatWinRate(record: PlayerRecord): string {
  const played = totalGames(record);
  if (played === 0) return "—";
  return `${Math.round(((record.wins + record.draws / 2) / played) * 100)}%`;
}

/* ---------------------------------------------------------------------- results */

/** PGN result tag for the seven-tag roster (FR-47). `undefined` winner = unfinished. */
export function pgnResult(status: GameStatus, winner?: Winner): string {
  if (status === "waiting" || status === "active") return "*";
  if (winner === "w") return "1-0";
  if (winner === "b") return "0-1";
  if (winner === "draw") return "1/2-1/2";
  return "*";
}

export type ResultOutcome = "win" | "loss" | "draw" | "ongoing";

/** The outcome from `colour`'s point of view. `null` colour (spectator) never wins. */
export function outcomeFor(
  status: GameStatus,
  winner: Winner | undefined,
  colour: Colour | null,
): ResultOutcome {
  if (status === "waiting" || status === "active") return "ongoing";
  if (winner === "draw" || winner === undefined) return "draw";
  if (colour === null) return "draw";
  return winner === colour ? "win" : "loss";
}

/** Short badge text: "Win" / "Loss" / "Draw" / "In progress". */
export function formatOutcome(outcome: ResultOutcome): string {
  switch (outcome) {
    case "win": return "Win";
    case "loss": return "Loss";
    case "draw": return "Draw";
    case "ongoing": return "In progress";
  }
}

const END_REASON_TEXT: Record<EndReason, string> = {
  checkmate: "by checkmate",
  stalemate: "by stalemate",
  threefold: "by threefold repetition",
  "fifty-move": "by the fifty-move rule",
  insufficient: "by insufficient material",
  agreement: "by agreement",
  resignation: "by resignation",
  abandonment: "by abandonment",
};

export function formatEndReason(reason: EndReason | undefined): string {
  return reason ? END_REASON_TEXT[reason] : "";
}

/** Headline for the result dialog: "White wins by checkmate", "Draw by agreement", … */
export function formatGameResult(
  status: GameStatus,
  winner: Winner | undefined,
  reason: EndReason | undefined,
  names: { whiteName: string; blackName: string },
): string {
  if (status === "waiting") return "Waiting for an opponent";
  if (status === "active") return "Game in progress";
  const suffix = reason ? ` ${formatEndReason(reason)}` : "";
  if (winner === "w") return `${names.whiteName} wins${suffix}`;
  if (winner === "b") return `${names.blackName} wins${suffix}`;
  return `Draw${suffix}`;
}

const MODE_LABEL: Record<GameMode, string> = {
  online: "Online",
  ai: "vs AI",
  local: "Local",
};

export function formatMode(mode: GameMode): string {
  return MODE_LABEL[mode];
}

export function formatColour(colour: Colour): string {
  return colour === "w" ? "White" : "Black";
}

/* --------------------------------------------------------------------- material */

/** Positive = white is ahead. Duplicated from `chess.ts` on purpose: this module must not
 *  pull chess.js into every page that only wants to format a rating. */
function balanceOf(captured: CapturedPieces): number {
  const sum = (list: PieceSymbol[]) => list.reduce((n, p) => n + PIECE_VALUES[p], 0);
  return sum(captured.w) - sum(captured.b);
}

/** "+3" when the side is ahead by 3 points, "" when level or behind (FR-16). */
export function formatMaterialAdvantage(captured: CapturedPieces, forColour: Colour): string {
  const balance = balanceOf(captured);
  const value = forColour === "w" ? balance : -balance;
  return value > 0 ? `+${value}` : "";
}

/* ------------------------------------------------------------------------ time */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * "9 Sep 2026" — deterministic (UTC, fixed English month names) so a server render and a
 * client render always agree. Intl/local-timezone formatting would not.
 */
export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "9 Sep 2026, 14:05" (UTC, for the same reason as `formatDate`). */
export function formatDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${formatDate(timestamp)}, ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** "just now" / "4m ago" / "3h ago" / "2d ago" / a date past a week. `now` is explicit. */
export function formatRelative(timestamp: number, now: number): string {
  const seconds = Math.floor((now - timestamp) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(timestamp);
}

/** "0:07" / "1:23" / "12:04" — queue elapsed time and AI think time. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${pad2(total % 60)}`;
}

/** "0.8s" / "3.2s" — AI latency readout (FR-38). */
export function formatSeconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

/* ----------------------------------------------------------------------- text */

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Trim a display name to `max` graphemes-ish with an ellipsis. */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** A filesystem-safe PGN filename: "3d-chess-marco-vs-ada-2026-09-09.pgn" (FR-47). */
export function pgnFilename(whiteName: string, blackName: string, timestamp: number): string {
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "player";
  const d = new Date(timestamp);
  const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return `3d-chess-${slug(whiteName)}-vs-${slug(blackName)}-${date}.pgn`;
}
