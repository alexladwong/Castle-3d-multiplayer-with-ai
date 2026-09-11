// convex/lib/returns.ts
//
// `returns` validators shared by more than one module. They are the runtime
// guarantee behind the TypeScript shapes in `src/lib/types.ts` (§D.1) — keep the
// two in step: PlayerSummary, PlayerProfile, GameView, GameSummary,
// LiveGameSummary, LeaderboardRow.
import { v } from "convex/values";
import schema from "../schema";
import {
  vColour,
  vDifficulty,
  vGameMode,
  vGameStatus,
  vRatingPool,
  vWinner,
} from "./validators";

/* ------------------------------------------------------------ whole documents */

export const vPlayerDoc = schema.doc("players");
export const vGameDoc = schema.doc("games");
export const vCommentaryDoc = schema.doc("commentary");

/** `players.me` — the caller's own row plus the resolved room-image URL. */
export const vMe = vPlayerDoc.extend({
  roomImageUrl: v.union(v.string(), v.null()),
});

/* ------------------------------------------------------------- projections */

/** Everything another player is allowed to see. Never widen this to the doc. */
export const vPlayerSummary = v.object({
  _id: v.id("players"),
  username: v.string(),
  avatarUrl: v.string(),
  rating: v.number(),
});

export const vPlayerProfile = v.object({
  _id: v.id("players"),
  username: v.string(),
  avatarUrl: v.string(),
  rating: v.number(),
  ratingHuman: v.number(),
  ratingAi: v.number(),
  wins: v.number(),
  losses: v.number(),
  draws: v.number(),
  createdAt: v.number(),
});

export const vViewerRole = v.union(
  v.literal("white"),
  v.literal("black"),
  v.literal("local"),
  v.literal("spectator"),
);

export const vGameView = v.object({
  game: vGameDoc,
  white: v.union(vPlayerSummary, v.null()),
  black: v.union(vPlayerSummary, v.null()),
  whiteName: v.string(),
  blackName: v.string(),
  viewerRole: vViewerRole,
});

export const vGameSummary = v.object({
  _id: v.id("games"),
  mode: vGameMode,
  difficulty: v.optional(vDifficulty),
  status: vGameStatus,
  winner: v.optional(vWinner),
  opponentName: v.string(),
  opponentAvatarUrl: v.union(v.string(), v.null()),
  myColour: v.union(vColour, v.null()),
  moveCount: v.number(),
  undoCount: v.number(),
  rated: v.boolean(),
  createdAt: v.number(),
  endedAt: v.optional(v.number()),
});

export const vLiveGameSummary = v.object({
  _id: v.id("games"),
  whiteName: v.string(),
  blackName: v.string(),
  whiteRating: v.number(),
  blackRating: v.number(),
  moveCount: v.number(),
  spectatorCount: v.number(),
  lastMoveAt: v.number(),
});

export const vLeaderboardRow = v.object({
  rank: v.number(),
  playerId: v.id("players"),
  username: v.string(),
  avatarUrl: v.string(),
  rating: v.number(),
  wins: v.number(),
  losses: v.number(),
  draws: v.number(),
});

export const vRatingHistoryRow = v.object({
  createdAt: v.number(),
  before: v.number(),
  after: v.number(),
  delta: v.number(),
  pool: vRatingPool,
  gameId: v.id("games"),
});

/** Shared return shape of `games.makeMove` and `games.makeAiMove`. */
export const vMoveResult = v.object({
  san: v.string(),
  status: vGameStatus,
  turn: vColour,
  winner: v.optional(vWinner),
});
