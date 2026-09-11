// Shared test harness. The double-dotted filename keeps this file out of BOTH the
// Convex push (the CLI skips entry points containing more than one dot) and
// vitest's default test discovery.
//
// The Agent component's official test helper supplies Vite's ImportMeta types.
// Do not redeclare `glob`: it conflicts with that helper's `vite/client` reference.

import { Chess } from "chess.js";
import { convexTest } from "convex-test";
import type { TestConvex } from "convex-test";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";

/** convex-test needs the function module map; `_generated` must be included. */
export const modules = import.meta.glob("../**/*.*s");

export function makeTest(): TestConvex<typeof schema> {
  return convexTest(schema, modules);
}

export interface TestPlayer {
  id: Id<"players">;
  identity: { subject: string; nickname: string; pictureUrl: string };
}

/** Sign a user in and provision their `players` row through the real mutation. */
export async function signUp(
  t: TestConvex<typeof schema>,
  username: string,
): Promise<TestPlayer> {
  const identity = {
    subject: `user_${username}`,
    nickname: username,
    pictureUrl: `https://img.clerk.com/${username}.png`,
  };
  const id = await t.withIdentity(identity).mutation(api.players.ensurePlayer, {});
  return { id, identity };
}

export function as(t: TestConvex<typeof schema>, player: TestPlayer) {
  return t.withIdentity(player.identity);
}

export async function setRatings(
  t: TestConvex<typeof schema>,
  playerId: Id<"players">,
  ratings: { rating?: number; ratingHuman?: number; ratingAi?: number },
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.patch("players", playerId, ratings);
  });
}

export interface SeedGameOptions {
  mode?: "online" | "ai" | "local";
  whiteId?: Id<"players"> | null;
  blackId?: Id<"players"> | null;
  sans?: string[];
  rated?: boolean;
  difficulty?: Doc<"games">["difficulty"];
  aiColor?: "w" | "b";
  localPlayerTwoName?: string;
}

/**
 * Insert a game already at the position reached by `sans`. `moves` stays the source
 * of truth; fen/pgn/turn are derived exactly the way the mutations derive them.
 */
export async function seedGame(
  t: TestConvex<typeof schema>,
  opts: SeedGameOptions,
): Promise<Id<"games">> {
  const chess = new Chess();
  for (const san of opts.sans ?? []) chess.move(san);
  const now = Date.now();
  return await t.run(async (ctx) =>
    ctx.db.insert("games", {
      whiteId: opts.whiteId ?? null,
      blackId: opts.blackId ?? null,
      mode: opts.mode ?? "online",
      difficulty: opts.difficulty,
      aiColor: opts.aiColor,
      localPlayerTwoName: opts.localPlayerTwoName,
      fen: chess.fen(),
      moves: chess.history(),
      pgn: chess.pgn(),
      turn: chess.turn(),
      status: "active",
      rated: opts.rated ?? (opts.mode ?? "online") !== "local",
      undoCount: 0,
      hintsUsed: 0,
      spectatorCount: 0,
      createdAt: now,
      lastMoveAt: now,
    }),
  );
}

export async function readGame(
  t: TestConvex<typeof schema>,
  gameId: Id<"games">,
): Promise<Doc<"games">> {
  const game = await t.run(async (ctx) => ctx.db.get("games", gameId));
  if (game === null) throw new Error("missing game in test");
  return game;
}

export async function readPlayer(
  t: TestConvex<typeof schema>,
  playerId: Id<"players">,
): Promise<Doc<"players">> {
  const player = await t.run(async (ctx) => ctx.db.get("players", playerId));
  if (player === null) throw new Error("missing player in test");
  return player;
}

/* Rewind stored timestamps so time-based logic runs without fake timers. */

export async function backdateGame(
  t: TestConvex<typeof schema>,
  gameId: Id<"games">,
  ms: number,
): Promise<void> {
  await t.run(async (ctx) => {
    const game = await ctx.db.get("games", gameId);
    if (game === null) return;
    await ctx.db.patch("games", gameId, { lastMoveAt: game.lastMoveAt - ms });
  });
}

export async function backdateQueue(
  t: TestConvex<typeof schema>,
  playerId: Id<"players">,
  ms: number,
): Promise<void> {
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("queue")
      .withIndex("by_playerId", (q) => q.eq("playerId", playerId))
      .unique();
    if (row === null) return;
    await ctx.db.patch("queue", row._id, { joinedAt: row.joinedAt - ms });
  });
}

export async function backdatePresence(
  t: TestConvex<typeof schema>,
  gameId: Id<"games">,
  playerId: Id<"players">,
  ms: number,
): Promise<void> {
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("presence")
      .withIndex("by_gameId_and_playerId", (q) =>
        q.eq("gameId", gameId).eq("playerId", playerId),
      )
      .unique();
    if (row === null) return;
    await ctx.db.patch("presence", row._id, { lastSeen: row.lastSeen - ms });
  });
}

/** Scholar's mate as from/to pairs — white mates on move 4. */
export const SCHOLARS_MATE: Array<{ from: string; to: string }> = [
  { from: "e2", to: "e4" },
  { from: "e7", to: "e5" },
  { from: "d1", to: "h5" },
  { from: "b8", to: "c6" },
  { from: "f1", to: "c4" },
  { from: "g8", to: "f6" },
  { from: "h5", to: "f7" },
];

/** Sam Loyd's 10-move stalemate; the 19th ply (Qe6, c8→e6) is the stalemating move. */
export const STALEMATE_PREFIX = [
  "e3",
  "a5",
  "Qh5",
  "Ra6",
  "Qxa5",
  "h5",
  "Qxc7",
  "Rah6",
  "h4",
  "f6",
  "Qxd7+",
  "Kf7",
  "Qxb7",
  "Qd3",
  "Qxb8",
  "Qh7",
  "Qxc8",
  "Kg6",
];

/** After these 8 plies white can play bxa8=Q — a real promotion from the start pos. */
export const PROMOTION_PREFIX = [
  "a4",
  "h5",
  "a5",
  "h4",
  "a6",
  "h3",
  "axb7",
  "hxg2",
];
