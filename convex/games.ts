// convex/games.ts — the authoritative game surface (FR-7…FR-13, FR-28…FR-46)
//
// chess.js is imported directly here: it runs in the DEFAULT Convex runtime, no
// `"use node"` (chessjs.md §12). Every position change replays `game.moves` from
// the start position, because a `Chess` built from a stored FEN has no history and
// could never detect threefold repetition (chessjs.md §3). A client-supplied FEN is
// never trusted (NFR-4).
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { optionalPlayer, requireIdentity, requirePlayer } from "./lib/auth";
import {
  ABANDON_SWEEP_LIMIT,
  ABANDON_TIMEOUT_MS,
  clampLimit,
  DEFAULT_LOCAL_PLAYER_TWO_NAME,
  HINTS_ALLOWED,
  MAX_COMMENTARY_ROWS,
  MAX_HINTS_PER_GAME,
  MAX_LIVE_GAMES,
  MAX_LOCAL_NAME_LENGTH,
  MAX_RECENT_GAMES,
  MAX_TUTOR_TURNS_PER_GAME,
  PRESENCE_GC_LIMIT,
  PRESENCE_TTL_MS,
  SPECTATOR_REFRESH_LIMIT,
  SPECTATOR_SCAN_LIMIT,
  STALE_GAME_SWEEP_LIMIT,
  STALE_GAME_TTL_MS,
  type Difficulty,
} from "./lib/constants";
import {
  applyMove,
  applySan,
  gameStatus,
  needsPromotion,
  otherColour,
  replay,
  replayWithLast,
  snapshot,
  startingSnapshot,
  toStoredLastMove,
  type Colour,
  type Winner,
} from "./lib/chess";
import {
  colourOf,
  finalizeGame,
  findActiveGame,
  requireFreeToStart,
  requireParticipant,
  sideName,
  viewerRole,
} from "./lib/games";
import {
  vGameSummary,
  vGameView,
  vLiveGameSummary,
  vMoveResult,
} from "./lib/returns";
import { vColour, vDifficulty, vPromotionPiece } from "./lib/validators";

/* ------------------------------------------------------------------ helpers */

async function loadGame(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
): Promise<Doc<"games">> {
  const game = await ctx.db.get("games", gameId);
  if (game === null) throw new Error("game-not-found");
  return game;
}

/**
 * The colour this caller may act for right now. `"both"` is the local-mode owner,
 * who drives each side in turn (FR-21a). Throws `"not-a-participant"`.
 */
function seatOf(game: Doc<"games">, playerId: Id<"players">): Colour | "both" {
  if (game.mode === "local") {
    if (game.whiteId !== playerId) throw new Error("not-a-participant");
    return "both";
  }
  return requireParticipant(game, playerId);
}

function toSummary(player: Doc<"players"> | null) {
  if (player === null) return null;
  return {
    _id: player._id,
    username: player.username,
    avatarUrl: player.avatarUrl,
    rating: player.rating,
  };
}

/** Build the shared `{ san, status, turn, winner? }` result without `undefined`. */
function moveResult(
  san: string,
  status: Doc<"games">["status"],
  turn: Colour,
  winner: Winner | undefined,
) {
  const result: { san: string; status: Doc<"games">["status"]; turn: Colour; winner?: Winner } =
    { san, status, turn };
  if (winner !== undefined) result.winner = winner;
  return result;
}

async function toGameSummary(
  ctx: QueryCtx,
  game: Doc<"games">,
  viewerId: Id<"players">,
) {
  const myColour = colourOf(game, viewerId);
  const opponentColour: Colour =
    myColour === null ? "b" : otherColour(myColour);
  const opponentId = opponentColour === "w" ? game.whiteId : game.blackId;
  const opponent =
    opponentId === null ? null : await ctx.db.get("players", opponentId);

  const summary: {
    _id: Id<"games">;
    mode: Doc<"games">["mode"];
    difficulty?: Difficulty;
    status: Doc<"games">["status"];
    winner?: Winner;
    opponentName: string;
    opponentAvatarUrl: string | null;
    myColour: Colour | null;
    moveCount: number;
    undoCount: number;
    rated: boolean;
    createdAt: number;
    endedAt?: number;
  } = {
    _id: game._id,
    mode: game.mode,
    status: game.status,
    opponentName: sideName(game, opponentColour, opponent),
    opponentAvatarUrl: opponent === null ? null : opponent.avatarUrl,
    myColour,
    moveCount: game.moves.length,
    undoCount: game.undoCount,
    rated: game.rated,
    createdAt: game.createdAt,
  };
  if (game.difficulty !== undefined) summary.difficulty = game.difficulty;
  if (game.winner !== undefined) summary.winner = game.winner;
  if (game.endedAt !== undefined) summary.endedAt = game.endedAt;
  return summary;
}

/* ---------------------------------------------------------------- creation */

/** FR-7. Difficulty is immutable for the life of the game. */
export const createAiGame = mutation({
  args: { difficulty: vDifficulty, playerColor: vColour },
  returns: v.id("games"),
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx);
    // FR-26: one game at a time, and starting one leaves the queue — otherwise
    // `queue.pair` could pair this player into a second, rated game they never see.
    await requireFreeToStart(ctx, player._id);
    const now = Date.now();
    const snap = startingSnapshot();
    return await ctx.db.insert("games", {
      whiteId: args.playerColor === "w" ? player._id : null,
      blackId: args.playerColor === "b" ? player._id : null,
      mode: "ai",
      difficulty: args.difficulty,
      aiColor: otherColour(args.playerColor),
      fen: snap.fen,
      moves: [],
      pgn: snap.pgn,
      turn: snap.turn,
      status: "active",
      rated: true,
      undoCount: 0,
      hintsUsed: 0,
      spectatorCount: 0,
      createdAt: now,
      lastMoveAt: now,
    });
  },
});

/** FR-21a/b. Never rated; the owner plays both sides on one device. */
export const createLocalGame = mutation({
  args: { playerTwoName: v.optional(v.string()) },
  returns: v.id("games"),
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx);
    await requireFreeToStart(ctx, player._id); // FR-26, as in createAiGame
    const trimmed = (args.playerTwoName ?? "").trim().slice(0, MAX_LOCAL_NAME_LENGTH);
    const now = Date.now();
    const snap = startingSnapshot();
    return await ctx.db.insert("games", {
      whiteId: player._id,
      blackId: null,
      mode: "local",
      localPlayerTwoName: trimmed.length > 0 ? trimmed : DEFAULT_LOCAL_PLAYER_TWO_NAME,
      fen: snap.fen,
      moves: [],
      pgn: snap.pgn,
      turn: snap.turn,
      status: "active",
      rated: false,
      undoCount: 0,
      hintsUsed: 0,
      spectatorCount: 0,
      createdAt: now,
      lastMoveAt: now,
    });
  },
});

/* ----------------------------------------------------------------- reading */

/** The whole view the game page needs. Never returns another player's settings. */
export const get = query({
  args: { gameId: v.id("games") },
  returns: v.union(vGameView, v.null()),
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    const viewer = await optionalPlayer(ctx);
    const game = await ctx.db.get("games", args.gameId);
    if (game === null) return null;

    const white =
      game.whiteId === null ? null : await ctx.db.get("players", game.whiteId);
    const black =
      game.blackId === null ? null : await ctx.db.get("players", game.blackId);

    return {
      game,
      white: toSummary(white),
      black: toSummary(black),
      whiteName: sideName(game, "w", white),
      blackName: sideName(game, "b", black),
      viewerRole: viewerRole(game, viewer === null ? null : viewer._id),
    };
  },
});

/** FR-8 spectate list + the landing ticker. Online games only. */
export const listLive = query({
  args: { limit: v.number() },
  returns: v.array(vLiveGameSummary),
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit, MAX_LIVE_GAMES);
    // `mode` is part of the index, so a wall of active vs-AI games can never crowd
    // online games out of the window (they used to share one `status` index).
    const rows = await ctx.db
      .query("games")
      .withIndex("by_mode_and_status_and_lastMoveAt", (q) =>
        q.eq("mode", "online").eq("status", "active"),
      )
      .order("desc")
      .take(limit);

    const out: Array<{
      _id: Id<"games">;
      whiteName: string;
      blackName: string;
      whiteRating: number;
      blackRating: number;
      moveCount: number;
      spectatorCount: number;
      lastMoveAt: number;
    }> = [];

    for (const game of rows) {
      const white =
        game.whiteId === null ? null : await ctx.db.get("players", game.whiteId);
      const black =
        game.blackId === null ? null : await ctx.db.get("players", game.blackId);
      out.push({
        _id: game._id,
        whiteName: sideName(game, "w", white),
        blackName: sideName(game, "b", black),
        whiteRating: white === null ? 0 : white.rating,
        blackRating: black === null ? 0 : black.rating,
        moveCount: game.moves.length,
        spectatorCount: game.spectatorCount ?? 0,
        lastMoveAt: game.lastMoveAt,
      });
    }
    return out;
  },
});

/** FR-24 auto-redirect after pairing, FR-26 queue guard. */
export const myActiveGame = query({
  args: {},
  returns: v.union(v.id("games"), v.null()),
  handler: async (ctx) => {
    await requireIdentity(ctx);
    const player = await optionalPlayer(ctx);
    if (player === null) return null;
    const game = await findActiveGame(ctx, player._id);
    return game === null ? null : game._id;
  },
});

/** FR-53 — the caller's own history. */
export const myRecentGames = query({
  args: { limit: v.number() },
  returns: v.array(vGameSummary),
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    const player = await optionalPlayer(ctx);
    if (player === null) return [];
    return await recentGamesFor(ctx, player._id, args.limit);
  },
});

/** FR-53 — someone else's history, resolved by username. */
export const gamesForProfile = query({
  args: { username: v.string(), limit: v.number() },
  returns: v.array(vGameSummary),
  handler: async (ctx, args) => {
    // `.first()` — a duplicate `usernameLower` must not 500 the profile page.
    const player = await ctx.db
      .query("players")
      .withIndex("by_usernameLower", (q) =>
        q.eq("usernameLower", args.username.toLowerCase()),
      )
      .first();
    if (player === null) return [];
    return await recentGamesFor(ctx, player._id, args.limit);
  },
});

async function recentGamesFor(ctx: QueryCtx, playerId: Id<"players">, rawLimit: number) {
  const limit = clampLimit(rawLimit, MAX_RECENT_GAMES);
  const asWhite = await ctx.db
    .query("games")
    .withIndex("by_whiteId_and_createdAt", (q) => q.eq("whiteId", playerId))
    .order("desc")
    .take(limit);
  const asBlack = await ctx.db
    .query("games")
    .withIndex("by_blackId_and_createdAt", (q) => q.eq("blackId", playerId))
    .order("desc")
    .take(limit);

  const merged = [...asWhite, ...asBlack]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);

  const out = [];
  for (const game of merged) out.push(await toGameSummary(ctx, game, playerId));
  return out;
}

/* ------------------------------------------------------------------- moves */

/**
 * THE single authoritative move path (FR-10, FR-29, NFR-4). See §E.3 for the
 * step-by-step contract this implements.
 */
export const makeMove = mutation({
  args: {
    gameId: v.id("games"),
    from: v.string(),
    to: v.string(),
    promotion: v.optional(vPromotionPiece),
  },
  returns: vMoveResult,
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx);
    const game = await loadGame(ctx, args.gameId);
    if (game.status !== "active") throw new Error("game-not-active");

    const seat = seatOf(game, player._id);
    if (seat !== "both" && seat !== game.turn) throw new Error("not-your-turn");

    const chess = replay(game.moves);
    // FR-11: chess.js has no implicit auto-queen; the object form rejects a
    // promotion move that arrives without a promotion piece.
    if (args.promotion === undefined && needsPromotion(chess, args.from, args.to)) {
      throw new Error("promotion-required");
    }
    const move = applyMove(chess, {
      from: args.from,
      to: args.to,
      promotion: args.promotion,
    });

    return await commitMove(ctx, game, chess, move.san, toStoredLastMove(move));
  },
});

/**
 * FR-36. The AI move is submitted by the client and verified here (§I-6):
 * mode, turn, ply (idempotency) and legality are all re-checked server-side. The
 * SAN goes through the permissive parser because the model may emit LAN.
 */
export const makeAiMove = mutation({
  args: { gameId: v.id("games"), san: v.string(), expectedPly: v.number() },
  returns: vMoveResult,
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx);
    const game = await loadGame(ctx, args.gameId);
    if (game.status !== "active") throw new Error("game-not-active");
    if (game.mode !== "ai") throw new Error("not-an-ai-game");
    requireParticipant(game, player._id);
    if (game.aiColor === undefined || game.turn !== game.aiColor) {
      throw new Error("not-ai-turn");
    }
    if (
      !Number.isInteger(args.expectedPly) ||
      game.moves.length !== args.expectedPly
    ) {
      throw new Error("stale-ai-move");
    }

    const chess = replay(game.moves);
    const move = applySan(chess, args.san);
    return await commitMove(ctx, game, chess, move.san, toStoredLastMove(move));
  },
});

/** Shared tail of `makeMove` / `makeAiMove`: derive status, write, finalise. */
async function commitMove(
  ctx: MutationCtx,
  game: Doc<"games">,
  chess: ReturnType<typeof replay>,
  san: string,
  lastMove: ReturnType<typeof toStoredLastMove>,
) {
  const outcome = gameStatus(chess);
  const winner = outcome.status === "active" ? undefined : outcome.winner;
  const snap = snapshot(chess, winner);
  const now = Date.now();

  await ctx.db.patch("games", game._id, {
    fen: snap.fen,
    pgn: snap.pgn,
    turn: snap.turn,
    moves: [...game.moves, san],
    lastMove,
    lastMoveAt: now,
    drawOffer: undefined,
  });

  if (outcome.status !== "active") {
    // Same transaction as the move (FR-49) — ratings can never be observed stale.
    await finalizeGame(
      ctx,
      game,
      {
        status: outcome.status,
        winner: outcome.winner,
        endReason: outcome.endReason,
      },
      { now },
    );
    return moveResult(san, outcome.status, snap.turn, outcome.winner);
  }
  return moveResult(san, "active", snap.turn, undefined);
}

/* --------------------------------------------------------------- outcomes */

/** FR-30. In `local` mode the caller resigns for the side to move. */
export const resign = mutation({
  args: { gameId: v.id("games") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx);
    const game = await loadGame(ctx, args.gameId);
    if (game.status !== "active") throw new Error("game-not-active");

    const seat = seatOf(game, player._id);
    const resigning: Colour = seat === "both" ? game.turn : seat;
    const winner = otherColour(resigning);
    const snap = snapshot(replay(game.moves), winner);

    await finalizeGame(
      ctx,
      game,
      { status: "resigned", winner, endReason: "resignation" },
      { extra: { pgn: snap.pgn } },
    );
    return null;
  },
});

/**
 * FR-31. Offering into a standing offer from the other side accepts it. Rejected
 * for `ai` games: the AI has no seat, so it can never answer, and the human cannot
 * answer their own offer — the offer would just sit on the document unanswerable.
 */
export const offerDraw = mutation({
  args: { gameId: v.id("games") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx);
    const game = await loadGame(ctx, args.gameId);
    if (game.status !== "active") throw new Error("game-not-active");
    if (game.mode === "ai") throw new Error("draw-not-available");

    const seat = seatOf(game, player._id);
    const colour: Colour = seat === "both" ? game.turn : seat;

    if (game.drawOffer === colour) return null; // repeat offer: no-op
    if (game.drawOffer !== undefined) {
      await agreeDraw(ctx, game);
      return null;
    }
    await ctx.db.patch("games", game._id, { drawOffer: colour });
    return null;
  },
});

export const respondDraw = mutation({
  args: { gameId: v.id("games"), accept: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx);
    const game = await loadGame(ctx, args.gameId);
    if (game.status !== "active") throw new Error("game-not-active");
    if (game.mode === "ai") throw new Error("draw-not-available");
    if (game.drawOffer === undefined) throw new Error("no-draw-offer");

    const seat = seatOf(game, player._id);
    const colour: Colour = seat === "both" ? otherColour(game.drawOffer) : seat;
    if (colour === game.drawOffer) throw new Error("cannot-answer-own-offer");

    if (!args.accept) {
      await ctx.db.patch("games", game._id, { drawOffer: undefined });
      return null;
    }
    await agreeDraw(ctx, game);
    return null;
  },
});

async function agreeDraw(ctx: MutationCtx, game: Doc<"games">): Promise<void> {
  const snap = snapshot(replay(game.moves), "draw");
  await finalizeGame(
    ctx,
    game,
    { status: "draw", winner: "draw", endReason: "agreement" },
    { extra: { pgn: snap.pgn } },
  );
}

/**
 * FR-43/44/46. Rejected outright for online games, and — like every other
 * mutation — for a game that has already ended: `finalizeGame` has committed Elo,
 * the W/L/D record and a `ratingHistory` row by then, and reopening the game would
 * leave all three describing a game that is live again (FR-49). Rebuilds the
 * position by replaying the truncated SAN list, permanently unrates the game,
 * drops commentary past the new head and clears the Eve session so the agent
 * cannot diverge from the board.
 */
export const undo = mutation({
  args: { gameId: v.id("games"), toPly: v.number() },
  returns: v.object({
    fen: v.string(),
    turn: vColour,
    undoCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx);
    const game = await loadGame(ctx, args.gameId);
    if (game.status !== "active") throw new Error("game-not-active");
    seatOf(game, player._id);
    if (game.mode === "online") throw new Error("undo-not-allowed");
    if (
      !Number.isInteger(args.toPly) ||
      args.toPly < 0 ||
      args.toPly >= game.moves.length
    ) {
      throw new Error("invalid-ply");
    }

    let toPly = args.toPly;
    if (game.mode === "ai" && game.aiColor !== undefined) {
      // Snap down so it is the human's turn again (rewinds a whole turn).
      const humanColour = otherColour(game.aiColor);
      while (toPly > 0 && (toPly % 2 === 0 ? "w" : "b") !== humanColour) toPly--;
    }

    const truncated = game.moves.slice(0, toPly);
    const { chess, last } = replayWithLast(truncated);
    const snap = snapshot(chess);
    const now = Date.now();
    const undoCount = game.undoCount + (game.moves.length - toPly);

    await ctx.db.patch("games", game._id, {
      moves: truncated,
      fen: snap.fen,
      pgn: snap.pgn,
      turn: snap.turn,
      lastMove: last === null ? undefined : toStoredLastMove(last),
      // No `status`/`winner`/`endReason`/`endedAt` here: the guard above means the
      // game is still `active`, so there is no terminal state to unwind.
      drawOffer: undefined,
      undoCount,
      rated: false,
      eveSessionId: undefined,
      lastMoveAt: now,
    });

    const stale = await ctx.db
      .query("commentary")
      .withIndex("by_gameId_and_ply", (q) =>
        q.eq("gameId", game._id).gt("ply", toPly),
      )
      .take(MAX_COMMENTARY_ROWS);
    for (const row of stale) await ctx.db.delete("commentary", row._id);

    return { fen: snap.fen, turn: snap.turn, undoCount };
  },
});

/* ---------------------------------------------------------------- presence */

/** One participant's last heartbeat, read by exact key (never by scanning). */
async function lastSeenOf(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
  playerId: Id<"players"> | null,
): Promise<number | null> {
  if (playerId === null) return null;
  const row = await ctx.db
    .query("presence")
    .withIndex("by_gameId_and_playerId", (q) =>
      q.eq("gameId", gameId).eq("playerId", playerId),
    )
    .unique();
  return row === null ? null : row.lastSeen;
}

/**
 * FR-32. Both participants' last heartbeat, so the game page can say "your
 * opponent may have disconnected" from real presence instead of inferring it from
 * `lastMoveAt` (a player who is present but thinking is not disconnected).
 *
 * Deliberately NO wall-clock read: a query is not re-run as time passes (§I-14),
 * so the client compares these stamps against `Date.now()` on its own interval.
 */
export const presenceFor = query({
  args: { gameId: v.id("games") },
  returns: v.object({
    w: v.union(v.number(), v.null()),
    b: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    const game = await ctx.db.get("games", args.gameId);
    if (game === null) return { w: null, b: null };
    return {
      w: await lastSeenOf(ctx, game._id, game.whiteId),
      b: await lastSeenOf(ctx, game._id, game.blackId),
    };
  },
});

/**
 * FR-32. Writes to the `presence` table, NEVER to the game document — patching
 * `games` every 15 s would push a new doc to every subscriber (§I-2).
 *
 * Scoped, not "any signed-in player may write a row on any game" (CONVEX-AUTHZ-07):
 *
 *  - participants always count, in every mode;
 *  - a non-participant is only ever the audience of an ONLINE game — that is what
 *    keeps `spectatorCount` (FR-8) working. `ai` and `local` games have no audience,
 *    so a stranger cannot plant presence rows on someone else's private board;
 *  - a finished game takes no heartbeats, but that is a silent no-op rather than a
 *    throw: a stale tab that has not yet seen the result would otherwise raise an
 *    error every 15 s forever.
 */
export const heartbeat = mutation({
  args: { gameId: v.id("games") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx);
    const game = await loadGame(ctx, args.gameId);

    const colour = colourOf(game, player._id);
    if (colour === null && game.mode !== "online") {
      throw new Error("not-a-participant");
    }
    if (game.status !== "active") return null;

    const role = colour ?? "spectator";
    const now = Date.now();

    const existing = await ctx.db
      .query("presence")
      .withIndex("by_gameId_and_playerId", (q) =>
        q.eq("gameId", game._id).eq("playerId", player._id),
      )
      .unique();

    if (existing === null) {
      await ctx.db.insert("presence", {
        gameId: game._id,
        playerId: player._id,
        role,
        lastSeen: now,
      });
    } else {
      await ctx.db.patch("presence", existing._id, { role, lastSeen: now });
    }
    return null;
  },
});

/* ------------------------------------------------------------------- misc */

/** FR-40. Beginner/Casual only, three per game. */
export const useHint = mutation({
  args: { gameId: v.id("games") },
  returns: v.object({ hintsUsed: v.number(), remaining: v.number() }),
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx);
    const game = await loadGame(ctx, args.gameId);
    if (game.status !== "active") throw new Error("game-not-active");
    seatOf(game, player._id);
    if (game.mode !== "ai" || game.difficulty === undefined) {
      throw new Error("hints-unavailable");
    }
    if (!HINTS_ALLOWED[game.difficulty]) throw new Error("hints-unavailable");
    if (game.hintsUsed >= MAX_HINTS_PER_GAME) throw new Error("hint-limit");

    const hintsUsed = game.hintsUsed + 1;
    await ctx.db.patch("games", game._id, { hintsUsed });
    return { hintsUsed, remaining: MAX_HINTS_PER_GAME - hintsUsed };
  },
});

/**
 * docs/PRO_TUTOR.md §5.3. The tutor's per-game spend guard — NOT the Pro gate.
 *
 * Clerk cannot put `pla`/`fea` in a custom JWT template, so Convex never sees the
 * caller's plan (docs/research/clerk-billing.md). Pro is enforced in the Next.js
 * route with `has({ feature: "tutor" })`; this counter only caps what one game can
 * cost, and is charged with the caller's own token before the model call.
 *
 * Unlike `useHint` there is no seat check and no `status` check: §5.2 says a member
 * may ask the tutor about a game they are SPECTATING, and about one that is already
 * over. But "no seat check" is not "no check". A `mutation` is public API, game ids
 * are published by `listLive` to the spectate list and the landing ticker, and the
 * counter never resets — so without this, any signed-in member could call it 40 times
 * on a stranger's game and permanently switch a PAID feature off for the two people
 * actually playing it. The rule is §5.2's, and the same one `heartbeat` already
 * applies (CONVEX-AUTHZ-07):
 *
 *  - participants always, in every mode;
 *  - anyone else only on an ONLINE game — `ai` and `local` games have no audience at
 *    all, so a stranger can never touch someone's private board;
 *  - and while that online game is still ACTIVE, only if they are really in the room:
 *    a `presence` row, which is what §5.2's "spectator with access" means. That is the
 *    case the attack needs — a game in progress whose players would be left with the
 *    quota copy for the rest of it. Once the game is over there is no live feature
 *    left to break, and §1 sells the tutor for "replay" as well as for spectating, so
 *    a member reviewing a finished game they did not play is not asked for presence
 *    (`heartbeat` stops writing rows the moment a game ends).
 */
export const useTutorTurn = mutation({
  args: { gameId: v.id("games") },
  returns: v.object({ tutorTurnsUsed: v.number(), remaining: v.number() }),
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx);
    const game = await loadGame(ctx, args.gameId);

    if (colourOf(game, player._id) === null) {
      if (game.mode !== "online") throw new Error("not-a-participant");
      if (game.status === "active") {
        const watching = await ctx.db
          .query("presence")
          .withIndex("by_gameId_and_playerId", (q) =>
            q.eq("gameId", game._id).eq("playerId", player._id),
          )
          .unique();
        if (watching === null) throw new Error("not-a-participant");
      }
    }

    const used = game.tutorTurnsUsed ?? 0;
    if (used >= MAX_TUTOR_TURNS_PER_GAME) throw new Error("tutor-limit");

    const tutorTurnsUsed = used + 1;
    await ctx.db.patch("games", game._id, { tutorTurnsUsed });
    return { tutorTurnsUsed, remaining: MAX_TUTOR_TURNS_PER_GAME - tutorTurnsUsed };
  },
});

/** Persists the durable Eve session id after the first AI turn. */
export const setEveSession = mutation({
  args: { gameId: v.id("games"), eveSessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx);
    const game = await loadGame(ctx, args.gameId);
    seatOf(game, player._id);
    if (game.eveSessionId === args.eveSessionId) return null;
    await ctx.db.patch("games", game._id, { eveSessionId: args.eveSessionId });
    return null;
  },
});

/* ------------------------------------------------------------------ crons */

/**
 * FR-8. Every 20 s: recompute the denormalised `spectatorCount` of the most
 * recently active online games and patch the ones that changed.
 *
 * It is deliberately NOT part of `sweepAbandoned`: this pass reads the hot end of
 * the index (every game currently being played), so it conflicts with the moves
 * landing there and gets retried. Keeping it separate means those retries can
 * never delay the abandonment pass, which reads only the idle tail.
 */
export const refreshSpectatorCounts = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - ABANDON_TIMEOUT_MS;
    const live = await ctx.db
      .query("games")
      .withIndex("by_mode_and_status_and_lastMoveAt", (q) =>
        q.eq("mode", "online").eq("status", "active"),
      )
      .order("desc")
      .take(SPECTATOR_REFRESH_LIMIT);

    for (const game of live) {
      // A live game never enters the abandon window, so this is the only place its
      // "N watching" badge can be kept honest.
      const spectators = await ctx.db
        .query("presence")
        .withIndex("by_gameId_and_role", (q) =>
          q.eq("gameId", game._id).eq("role", "spectator"),
        )
        .take(SPECTATOR_SCAN_LIMIT);
      const spectatorCount = spectators.filter((row) => row.lastSeen >= cutoff).length;
      if ((game.spectatorCount ?? 0) !== spectatorCount) {
        await ctx.db.patch("games", game._id, { spectatorCount });
      }
    }
    return null;
  },
});

/**
 * FR-32. Every 20 s, in two bounded passes over the (mode, status, lastMoveAt)
 * index:
 *
 *  1. the abandon sweep proper: for each `active` ONLINE game whose last move is
 *     older than 60 s, compare the two participants' presence. One stale → the
 *     present side wins (rated normally); both stale → a draw with NO rating
 *     change. Restricting the index range to `mode === "online"` is what keeps
 *     never-ending ai/local games from filling the window forever;
 *  2. finalise `ai`/`local` games nobody has touched in a day (unrated), so they
 *     do not accumulate as permanently `active` rows and block FR-26.
 */
export const sweepAbandoned = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - ABANDON_TIMEOUT_MS;

    /* 1 — abandonment */
    const stale = await ctx.db
      .query("games")
      .withIndex("by_mode_and_status_and_lastMoveAt", (q) =>
        q.eq("mode", "online").eq("status", "active").lt("lastMoveAt", cutoff),
      )
      .take(ABANDON_SWEEP_LIMIT);

    for (const game of stale) {
      const { whiteId, blackId } = game;
      if (whiteId === null || blackId === null) continue;

      // Read both rows by exact key: a bounded scan of this game's presence could
      // be filled by spectators and hide the players, forfeiting a live game.
      const whiteSeen = (await lastSeenOf(ctx, game._id, whiteId)) ?? game.createdAt;
      const blackSeen = (await lastSeenOf(ctx, game._id, blackId)) ?? game.createdAt;
      const whiteGone = whiteSeen < cutoff;
      const blackGone = blackSeen < cutoff;
      if (!whiteGone && !blackGone) continue;

      const winner: Winner = whiteGone && blackGone ? "draw" : whiteGone ? "b" : "w";
      const snap = snapshot(replay(game.moves), winner);
      await finalizeGame(
        ctx,
        game,
        { status: "abandoned", winner, endReason: "abandonment" },
        {
          now,
          skipRatings: whiteGone && blackGone,
          extra: { pgn: snap.pgn },
        },
      );
    }

    /* 2 — TTL for solo games */
    const ttlCutoff = now - STALE_GAME_TTL_MS;
    for (const mode of ["ai", "local"] as const) {
      const forgotten = await ctx.db
        .query("games")
        .withIndex("by_mode_and_status_and_lastMoveAt", (q) =>
          q.eq("mode", mode).eq("status", "active").lt("lastMoveAt", ttlCutoff),
        )
        .take(STALE_GAME_SWEEP_LIMIT);

      for (const game of forgotten) {
        const snap = snapshot(replay(game.moves), "draw");
        await finalizeGame(
          ctx,
          game,
          { status: "abandoned", winner: "draw", endReason: "abandonment" },
          { now, skipRatings: true, extra: { pgn: snap.pgn } },
        );
      }
    }
    return null;
  },
});

/** Every 5 min: drop presence rows nobody has refreshed in 10 minutes. */
export const gcPresence = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_lastSeen", (q) => q.lt("lastSeen", cutoff))
      .take(PRESENCE_GC_LIMIT);
    for (const row of rows) await ctx.db.delete("presence", row._id);
    // A full batch means there is probably more; continue in a fresh transaction.
    if (rows.length === PRESENCE_GC_LIMIT) {
      await ctx.scheduler.runAfter(0, internal.games.gcPresence, {});
    }
    return null;
  },
});
