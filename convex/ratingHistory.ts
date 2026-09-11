// convex/ratingHistory.ts — FR-53 sparkline data
import { v } from "convex/values";
import { query } from "./_generated/server";
import { clampLimit, MAX_RATING_HISTORY } from "./lib/constants";
import { vRatingHistoryRow } from "./lib/returns";
import { vRatingPool } from "./lib/validators";

/**
 * The player's last `limit` rating changes, returned OLDEST FIRST so the sparkline
 * can render straight through. Convex appends `_creationTime` to every index, so
 * `by_playerId` already orders by insertion time within a player.
 */
export const forPlayer = query({
  args: {
    username: v.string(),
    pool: v.union(vRatingPool, v.literal("all")),
    limit: v.number(),
  },
  returns: v.array(vRatingHistoryRow),
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit, MAX_RATING_HISTORY);
    // `.first()` — a duplicate `usernameLower` must not 500 the profile page.
    const player = await ctx.db
      .query("players")
      .withIndex("by_usernameLower", (q) =>
        q.eq("usernameLower", args.username.toLowerCase()),
      )
      .first();
    if (player === null) return [];

    // The pool filter is applied after the index scan, so read a wider window
    // when it is set — otherwise a run of same-pool rows could hide every row of
    // the other pool behind the limit.
    const scan = args.pool === "all" ? limit : Math.min(limit * 2, MAX_RATING_HISTORY * 2);
    const rows = await ctx.db
      .query("ratingHistory")
      .withIndex("by_playerId", (q) => q.eq("playerId", player._id))
      .order("desc")
      .take(scan);

    const filtered =
      args.pool === "all" ? rows : rows.filter((row) => row.pool === args.pool);

    return filtered
      .slice(0, limit)
      .reverse()
      .map((row) => ({
        createdAt: row.createdAt,
        before: row.before,
        after: row.after,
        delta: row.delta,
        pool: row.pool,
        gameId: row.gameId,
      }));
  },
});
