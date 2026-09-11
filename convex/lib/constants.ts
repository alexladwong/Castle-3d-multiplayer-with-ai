// convex/lib/constants.ts
//
// Server-side twins of the values in `src/lib/constants.ts` / `src/lib/difficulty.ts`.
// Convex functions cannot import from `src/` (separate TS project at the repo root),
// so the handful of numbers the backend needs are duplicated here. Keep them in sync
// with §D.2 / §D.4 of docs/ARCHITECTURE.md.

export type Difficulty =
  | "beginner"
  | "casual"
  | "intermediate"
  | "advanced"
  | "grandmaster";

/* ---------------------------------------------------------------- gameplay */
export const MAX_HINTS_PER_GAME = 3; // FR-40
/** docs/PRO_TUTOR.md §5.3. Twin of MAX_TUTOR_TURNS_PER_GAME in src/lib/constants.ts. */
export const MAX_TUTOR_TURNS_PER_GAME = 40;
export const MAX_LOCAL_NAME_LENGTH = 24;
export const MAX_COMMENTARY_LENGTH = 400;
export const MAX_ROOM_IMAGE_BYTES = 5 * 1024 * 1024; // FR-21k
export const LEADERBOARD_SIZE = 100; // FR-50
export const DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/* ------------------------------------------------------------- presence */
export const ABANDON_TIMEOUT_MS = 60_000; // FR-32
export const PRESENCE_TTL_MS = 10 * 60_000;
/**
 * `ai` / `local` games have no opponent to forfeit to, so they are never swept on
 * the 60 s clock. They are still finalised (unrated) once nobody has touched them
 * for a day, otherwise they stay `active` forever and block FR-26 for their owner.
 */
export const STALE_GAME_TTL_MS = 24 * 60 * 60_000;

/* ---------------------------------------------------------- matchmaking */
export const QUEUE_BASE_RANGE = 200; // FR-23
export const QUEUE_WIDEN_STEP = 100;
export const QUEUE_WIDEN_INTERVAL_MS = 10_000;
/** Queue rows older than this are dropped by the pairing sweep (§E.2 step 7). */
export const QUEUE_MAX_WAIT_MS = 15 * 60_000;
/** Rows scanned by one `queue.pair` tick — bounds the read set and the O(n²) scan. */
export const QUEUE_SCAN_LIMIT = 200;

/** Rating window for a queue entry that joined `joinedAt`, evaluated at `now`. */
export function queueRangeAt(joinedAt: number, now: number): number {
  const steps = Math.floor(Math.max(0, now - joinedAt) / QUEUE_WIDEN_INTERVAL_MS);
  return QUEUE_BASE_RANGE + QUEUE_WIDEN_STEP * steps;
}

/* ------------------------------------------------------------------- AI */
/** Fixed AI ratings per difficulty (FR-51). Mirrors `AI_RATING` in src/lib/difficulty.ts. */
export const AI_RATING: Record<Difficulty, number> = {
  beginner: 800,
  casual: 1100,
  intermediate: 1400,
  advanced: 1800,
  grandmaster: 2300,
};

/** Persona display names, mirrors `DIFFICULTIES[d].persona.name` in src/lib/difficulty.ts. */
export const AI_DISPLAY_NAME: Record<Difficulty, string> = {
  beginner: "Pip",
  casual: "Marco",
  intermediate: "Ada",
  advanced: "Viktor",
  grandmaster: "Kasparova",
};

/** Difficulties that may use hints (FR-40). */
export const HINTS_ALLOWED: Record<Difficulty, boolean> = {
  beginner: true,
  casual: true,
  intermediate: false,
  advanced: false,
  grandmaster: false,
};

export const DEFAULT_LOCAL_PLAYER_TWO_NAME = "Player 2";

/* ---------------------------------------------------------------- limits */
/** Hard caps applied to every client-supplied `limit` argument. */
export const MAX_LIVE_GAMES = 50; // games.listLive
export const MAX_RECENT_GAMES = 50; // games.myRecentGames / gamesForProfile
export const MAX_RATING_HISTORY = 100; // ratingHistory.forPlayer
export const MAX_COMMENTARY_ROWS = 400; // commentary.forGame
/** Games considered per abandon sweep tick. */
export const ABANDON_SWEEP_LIMIT = 50;
/** `ai`/`local` games finalised per sweep tick, per mode. */
export const STALE_GAME_SWEEP_LIMIT = 50;
/** Live online games whose `spectatorCount` is refreshed on each sweep tick. */
export const SPECTATOR_REFRESH_LIMIT = 100;
/** Presence rows read when tallying one game's spectators (the tally saturates). */
export const SPECTATOR_SCAN_LIMIT = 50;
/** Presence rows deleted per gc tick. */
export const PRESENCE_GC_LIMIT = 500;

/**
 * Clamp a client-supplied count to `[1, max]`, rejecting NaN / Infinity / negatives.
 * Every public query that takes a `limit` runs its argument through this.
 */
export function clampLimit(limit: number, max: number): number {
  if (!Number.isFinite(limit)) return max;
  return Math.max(1, Math.min(Math.floor(limit), max));
}
