// src/lib/errors.ts  [shared — integration]
/**
 * THE single Convex-error-code → user-copy map.
 *
 * Convex functions throw stable machine codes, never user copy (`throw new
 * Error("illegal-move")`). A rejected mutation reaches the browser wrapped in
 * transport noise, e.g.
 * `[CONVEX M(games:makeMove)] [Request ID: …] Server Error\nUncaught Error: illegal-move\n  at …`,
 * so codes are matched as **substrings** of the message, never compared for equality.
 *
 * Two layers used to keep their own copies of this table — `providers/convex-errors.ts`
 * for the lobby/settings toasts and `useGameController` for the move path — which drifted
 * (same code, two different sentences). They now both read this module:
 *
 * - `describeConvexError()` — the toast layer (lobby, matchmaking, settings, room picker).
 * - `describeGameError()`   — the in-game layer; identical except for the handful of codes
 *   in `GAME_OVERRIDES`, where the game board says something more specific.
 *
 * Every string that either layer showed before the merge is preserved verbatim, because
 * `src/lib/__tests__/errors.test.ts` asserts them — and that same test re-reads `convex/**`
 * and fails if a newly thrown code has no copy here.
 */

import { MAX_TUTOR_TURNS_PER_GAME } from "./constants";

/** Every machine code thrown by `convex/**` (excluding the test harness). */
export const CONVEX_ERROR_CODES = [
  "Not authenticated",
  "Player not provisioned",
  "already-in-game",
  "cannot-answer-own-offer",
  "corrupt-move-list",
  "draw-not-available",
  "game-not-active",
  "game-not-found",
  "hint-limit",
  "hints-unavailable",
  "illegal-move",
  "invalid-colour",
  "invalid-message-length",
  "invalid-ply",
  "invalid-room-image",
  "no-draw-offer",
  "not-a-participant",
  "not-ai-turn",
  "not-an-ai-game",
  "not-your-turn",
  "online-chat-only",
  "promotion-required",
  "stale-ai-move",
  "tutor-limit",
  "undo-not-allowed",
  "upload-not-found",
] as const;

export type ConvexErrorCode = (typeof CONVEX_ERROR_CODES)[number];

/** Which surface is asking. `"game"` = inside a game (board, controller, result dialog). */
export type ErrorLayer = "toast" | "game";

/** Shown when nothing matched and the caller gave no fallback. */
export const DEFAULT_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** Default copy for every code. */
const COPY: Record<ConvexErrorCode, string> = {
  "Not authenticated": "You have been signed out. Sign in again to continue.",
  "Player not provisioned": "Your profile is still being set up. Give it a second and try again.",
  "already-in-game": "You already have a game in progress. Finish or resign it first.",
  "cannot-answer-own-offer": "You cannot answer your own draw offer.",
  "corrupt-move-list": "This game's moves could not be replayed. Reload the page.",
  "draw-not-available": "Draws can only be agreed against another player.",
  "game-not-active": "That game has already finished.",
  "game-not-found": "That game no longer exists.",
  "hint-limit": "You have used all three hints in this game.",
  "hints-unavailable": "Hints are only available at Beginner and Casual.",
  "illegal-move": "That move is not legal.",
  "invalid-colour": "Those colours are not valid hex values.",
  "invalid-message-length": "Write a message between 1 and 1,000 characters.",
  "invalid-ply": "That position is no longer part of this game.",
  "invalid-room-image": "That image is not usable — pick a PNG or JPEG under 5 MB.",
  "no-draw-offer": "There is no draw offer to answer.",
  "not-a-participant": "You are watching this game, not playing it.",
  "not-ai-turn": "It is not the AI's turn.",
  "not-an-ai-game": "This is not a game against the AI.",
  "not-your-turn": "It is not your turn.",
  "online-chat-only": "Player chat is available in online games.",
  "promotion-required": "Choose a promotion piece first.",
  "stale-ai-move": "The position moved on — nothing was applied.",
  // docs/PRO_TUTOR.md §3.5, with the cap read from the constant so the sentence and
  // the mutation can never disagree about the number.
  "tutor-limit": `The tutor has answered ${MAX_TUTOR_TURNS_PER_GAME} questions in this game. Start a new game to keep going.`,
  "undo-not-allowed": "Take-backs are disabled in online matches.",
  "upload-not-found": "The upload did not finish. Try picking the file again.",
};

/**
 * In-game wording for the codes where the board can be more direct than a toast fired
 * from the lobby. Everything not listed here falls through to `COPY`.
 */
const GAME_OVERRIDES: Partial<Record<ConvexErrorCode, string>> = {
  "Not authenticated": "Please sign in again.",
  "Player not provisioned": "Your player profile is still being created.",
  "game-not-active": "This game has already finished.",
  "hint-limit": "No hints left in this game.",
  "not-a-participant": "You are not playing in this game.",
};

/**
 * Longest code first, so a code that contains another (none do today — the test keeps it
 * that way) could never be shadowed by its shorter neighbour.
 */
const MATCH_ORDER: readonly ConvexErrorCode[] = [...CONVEX_ERROR_CODES].sort(
  (a, b) => b.length - a.length,
);

/** Copy for a known code on a given surface. */
export function errorCopyFor(code: ConvexErrorCode, layer: ErrorLayer = "toast"): string {
  return (layer === "game" ? GAME_OVERRIDES[code] : undefined) ?? COPY[code];
}

/**
 * The machine code inside a rejected Convex call, or `null` when the message carries none.
 * Callers that need the code itself (retry policy, telemetry) use this; callers that need a
 * sentence use `describeConvexError` / `describeGameError`.
 */
export function convexErrorCode(error: unknown): ConvexErrorCode | null {
  const raw = error instanceof Error ? error.message : String(error);
  for (const code of MATCH_ORDER) {
    if (raw.includes(code)) return code;
  }
  return null;
}

/** Toast-layer copy: lobby, matchmaking, settings, room picker. */
export function describeConvexError(error: unknown, fallback = DEFAULT_ERROR_MESSAGE): string {
  const code = convexErrorCode(error);
  return code === null ? fallback : errorCopyFor(code, "toast");
}

/** In-game copy: the controller, the board and anything rendered beside them. */
export function describeGameError(error: unknown, fallback = DEFAULT_ERROR_MESSAGE): string {
  const code = convexErrorCode(error);
  return code === null ? fallback : errorCopyFor(code, "game");
}
