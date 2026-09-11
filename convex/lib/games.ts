// convex/lib/games.ts
//
// Shared game helpers: participation, display names, and the single `finalizeGame`
// that every terminal path (checkmate, resign, draw agreement, abandonment) goes
// through. Ratings are written INSIDE the mutation that finalises the game (FR-49),
// so a client can never observe a finished game with stale ratings.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Colour, EndReason, Winner } from "./chess";
import {
  AI_DISPLAY_NAME,
  AI_RATING,
  DEFAULT_LOCAL_PLAYER_TWO_NAME,
  type Difficulty,
} from "./constants";
import { aiRatingDelta, applyDelta, onlineRatings, type Score } from "./elo";

export type ViewerRole = "white" | "black" | "local" | "spectator";
export type TerminalGameStatus =
  | "checkmate"
  | "stalemate"
  | "draw"
  | "resigned"
  | "abandoned";

/* ---------------------------------------------------------- participation */

/** The colour this player owns on the board, or null when they are not a player. */
export function colourOf(game: Doc<"games">, playerId: Id<"players">): Colour | null {
  if (game.whiteId !== null && game.whiteId === playerId) return "w";
  if (game.blackId !== null && game.blackId === playerId) return "b";
  return null;
}

/** Throws `"not-a-participant"`. In `local` mode the owner counts as white. */
export function requireParticipant(
  game: Doc<"games">,
  playerId: Id<"players">,
): Colour {
  const colour = colourOf(game, playerId);
  if (colour === null) throw new Error("not-a-participant");
  return colour;
}

/**
 * May this player act for `colour`? In `local` mode the owner (whiteId) drives
 * BOTH sides — that is the whole point of pass-and-play (FR-21a).
 */
export function canActAs(
  game: Doc<"games">,
  playerId: Id<"players">,
  colour: Colour,
): boolean {
  if (game.mode === "local") return game.whiteId === playerId;
  return colourOf(game, playerId) === colour;
}

/** Which colour a `local`-mode caller is currently acting for: the side to move. */
export function actingColour(game: Doc<"games">, playerId: Id<"players">): Colour {
  if (game.mode === "local" && game.whiteId === playerId) return game.turn;
  return requireParticipant(game, playerId);
}

export function viewerRole(
  game: Doc<"games">,
  playerId: Id<"players"> | null,
): ViewerRole {
  if (playerId === null) return "spectator";
  if (game.mode === "local") return game.whiteId === playerId ? "local" : "spectator";
  if (game.whiteId === playerId) return "white";
  if (game.blackId === playerId) return "black";
  return "spectator";
}

/** Display name for one side, resolving the AI persona and the local "Player 2". */
export function sideName(
  game: Doc<"games">,
  colour: Colour,
  player: Doc<"players"> | null,
): string {
  if (player !== null) return player.username;
  if (game.mode === "ai" && game.aiColor === colour) {
    return AI_DISPLAY_NAME[(game.difficulty ?? "casual") as Difficulty];
  }
  if (game.mode === "local") {
    return colour === "b"
      ? (game.localPlayerTwoName ?? DEFAULT_LOCAL_PLAYER_TWO_NAME)
      : DEFAULT_LOCAL_PLAYER_TWO_NAME;
  }
  return "Unknown";
}

/* ------------------------------------------------------------ active games */

/**
 * The player's most recent `active` game, or null. Backs both the post-pairing
 * redirect (FR-24) and the "you cannot queue while playing" guard (FR-26).
 *
 * Both (owner, status) indexes are read newest-first and only the head row of each
 * is needed, so the cost is independent of how many games the player has finished.
 */
export async function findActiveGame(
  ctx: QueryCtx | MutationCtx,
  playerId: Id<"players">,
): Promise<Doc<"games"> | null> {
  const asWhite = await ctx.db
    .query("games")
    .withIndex("by_whiteId_and_status", (q) =>
      q.eq("whiteId", playerId).eq("status", "active"),
    )
    .order("desc")
    .first();
  const asBlack = await ctx.db
    .query("games")
    .withIndex("by_blackId_and_status", (q) =>
      q.eq("blackId", playerId).eq("status", "active"),
    )
    .order("desc")
    .first();

  let best: Doc<"games"> | null = null;
  for (const game of [asWhite, asBlack]) {
    if (game === null) continue;
    if (best === null || game.createdAt > best.createdAt) best = game;
  }
  return best;
}

/**
 * FR-26 in both directions: a player may never start a second game, and starting
 * one always takes them out of the matchmaking queue. Every game creator (AI,
 * local) calls this; `queue.join` performs the mirror-image check.
 */
export async function requireFreeToStart(
  ctx: MutationCtx,
  playerId: Id<"players">,
): Promise<void> {
  const active = await findActiveGame(ctx, playerId);
  if (active !== null) throw new Error("already-in-game");

  const queued = await ctx.db
    .query("queue")
    .withIndex("by_playerId", (q) => q.eq("playerId", playerId))
    .unique();
  if (queued !== null) await ctx.db.delete("queue", queued._id);
}

/* -------------------------------------------------------------- finalising */

export interface FinalizeInput {
  status: TerminalGameStatus;
  winner: Winner;
  endReason: EndReason;
}

export interface FinalizeOptions {
  /**
   * Skip ratings AND the W/L/D record: the game did not really happen as far as
   * either player's record is concerned (abandoned by both sides, and the TTL
   * sweep of solo games nobody ever came back to — §C.7).
   */
  skipRatings?: boolean;
  /** Pinned wall clock; mutations get one consistent `Date.now()` per transaction. */
  now?: number;
  /** Extra fields to write in the same patch (e.g. the final `pgn`). */
  extra?: Partial<Omit<Doc<"games">, "_id" | "_creationTime">>;
}

function scoreFor(colour: Colour, winner: Winner): Score {
  if (winner === "draw") return 0.5;
  return winner === colour ? 1 : 0;
}

/**
 * The one place a game ends. Patches the terminal fields, then records the result
 * against the human player(s).
 *
 * Two independent switches, deliberately NOT one (FR-45/FR-48/FR-49, §C.7):
 *
 *  - `game.rated` gates ONLY the Elo change and its `ratingHistory` row. A game with
 *    a take-back "does not affect rating" — it is still a game that was won, lost or
 *    drawn, so `wins/losses/draws` still move. That is what makes the result dialog's
 *    "Won with 2 take-backs" (FR-45) consistent with the profile record;
 *  - `mode === "local"` and `opts.skipRatings` skip BOTH: pass-and-play never counts
 *    (FR-21b), and neither does a game both sides walked away from.
 */
export async function finalizeGame(
  ctx: MutationCtx,
  game: Doc<"games">,
  end: FinalizeInput,
  opts: FinalizeOptions = {},
): Promise<void> {
  const now = opts.now ?? Date.now();
  await ctx.db.patch("games", game._id, {
    ...opts.extra,
    status: end.status,
    winner: end.winner,
    endReason: end.endReason,
    endedAt: now,
    drawOffer: undefined,
  });

  if (opts.skipRatings === true) return;
  if (game.mode === "local") return;
  if (game.mode === "online") {
    await finalizeOnline(ctx, game, end.winner, now, game.rated);
  } else if (game.mode === "ai") {
    await finalizeAi(ctx, game, end.winner, now, game.rated);
  }
}

async function finalizeOnline(
  ctx: MutationCtx,
  game: Doc<"games">,
  winner: Winner,
  now: number,
  rated: boolean,
): Promise<void> {
  const { whiteId, blackId } = game;
  if (whiteId === null || blackId === null) return;
  const white = await ctx.db.get("players", whiteId);
  const black = await ctx.db.get("players", blackId);
  if (white === null || black === null) return;

  const { whiteDelta, blackDelta } = rated
    ? onlineRatings(white.ratingHuman, black.ratingHuman, winner)
    : { whiteDelta: 0, blackDelta: 0 };
  const args = { gameId: game._id, now, rated } as const;
  await applyResult(ctx, white, "human", whiteDelta, scoreFor("w", winner), args);
  await applyResult(ctx, black, "human", blackDelta, scoreFor("b", winner), args);
}

async function finalizeAi(
  ctx: MutationCtx,
  game: Doc<"games">,
  winner: Winner,
  now: number,
  rated: boolean,
): Promise<void> {
  const humanId = game.whiteId ?? game.blackId;
  if (humanId === null) return;
  const humanColour: Colour = game.whiteId !== null ? "w" : "b";
  const human = await ctx.db.get("players", humanId);
  if (human === null) return;

  const difficulty = (game.difficulty ?? "casual") as Difficulty;
  const score = scoreFor(humanColour, winner);
  const delta = rated
    ? aiRatingDelta(human.ratingAi, AI_RATING[difficulty], score)
    : 0;
  await applyResult(ctx, human, "ai", delta, score, {
    gameId: game._id,
    now,
    rated,
  });
}

interface ApplyResultArgs {
  gameId: Id<"games">;
  now: number;
  /** false → count the W/L/D only; leave every rating and `ratingHistory` alone. */
  rated: boolean;
}

async function applyResult(
  ctx: MutationCtx,
  player: Doc<"players">,
  pool: "human" | "ai",
  delta: number,
  score: Score,
  { gameId, now, rated }: ApplyResultArgs,
): Promise<void> {
  const record = {
    wins: player.wins + (score === 1 ? 1 : 0),
    losses: player.losses + (score === 0 ? 1 : 0),
    draws: player.draws + (score === 0.5 ? 1 : 0),
    updatedAt: now,
  };

  // FR-49: a take-back unrates the game, not the result. The record moves, the
  // three ratings do not, and no sparkline point is written.
  if (!rated) {
    await ctx.db.patch("players", player._id, record);
    return;
  }

  const before = pool === "human" ? player.ratingHuman : player.ratingAi;
  const after = applyDelta(before, delta);
  // Re-derive the delta from the floored rating so `before + delta === after` always
  // holds in ratingHistory, even when MIN_RATING clamped the result.
  const applied = after - before;
  const scored = { ...record, rating: applyDelta(player.rating, applied) };

  if (pool === "human") {
    await ctx.db.patch("players", player._id, { ...scored, ratingHuman: after });
  } else {
    await ctx.db.patch("players", player._id, { ...scored, ratingAi: after });
  }

  await ctx.db.insert("ratingHistory", {
    playerId: player._id,
    gameId,
    pool,
    before,
    after,
    delta: applied,
    createdAt: now,
  });
}
