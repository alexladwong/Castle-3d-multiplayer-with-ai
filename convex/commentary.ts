// convex/commentary.ts — FR-37
//
// AI commentary lives in its own table, NOT in an array on the game document
// (§I-3): appending to a document array rewrites the whole doc and wakes every
// subscriber, and unbounded arrays eventually hit the 1 MB document limit.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireIdentity, requirePlayer } from "./lib/auth";
import { MAX_COMMENTARY_LENGTH, MAX_COMMENTARY_ROWS } from "./lib/constants";
import { requireParticipant } from "./lib/games";
import { vCommentaryDoc } from "./lib/returns";
import { vCommentarySource } from "./lib/validators";

/**
 * Idempotent under retry: a second append for the same `(gameId, ply, source)`
 * overwrites rather than duplicating, so a client re-submitting after a dropped
 * response cannot double-post an AI turn's commentary.
 */
export const append = mutation({
  args: {
    gameId: v.id("games"),
    ply: v.number(),
    text: v.string(),
    source: vCommentarySource,
    persona: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx);
    const game = await ctx.db.get("games", args.gameId);
    if (game === null) throw new Error("game-not-found");
    if (game.mode === "local") {
      if (game.whiteId !== player._id) throw new Error("not-a-participant");
    } else {
      requireParticipant(game, player._id);
    }

    if (!Number.isInteger(args.ply) || args.ply < 0) throw new Error("invalid-ply");
    const text = args.text.trim().slice(0, MAX_COMMENTARY_LENGTH);
    if (text.length === 0) return null;

    const existing = await ctx.db
      .query("commentary")
      .withIndex("by_gameId_and_ply", (q) =>
        q.eq("gameId", args.gameId).eq("ply", args.ply),
      )
      .take(16);
    const duplicate = existing.find((row) => row.source === args.source);

    if (duplicate !== undefined) {
      await ctx.db.patch("commentary", duplicate._id, {
        text,
        persona: args.persona,
        createdAt: Date.now(),
      });
      return null;
    }

    await ctx.db.insert("commentary", {
      gameId: args.gameId,
      ply: args.ply,
      text,
      source: args.source,
      persona: args.persona,
      createdAt: Date.now(),
    });
    return null;
  },
});

/** Oldest-first. Spectators may read it. */
export const forGame = query({
  args: { gameId: v.id("games") },
  returns: v.array(vCommentaryDoc),
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    return await ctx.db
      .query("commentary")
      .withIndex("by_gameId_and_ply", (q) => q.eq("gameId", args.gameId))
      .order("asc")
      .take(MAX_COMMENTARY_ROWS);
  },
});
