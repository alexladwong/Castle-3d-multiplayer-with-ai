// convex/leaderboard.ts — FR-50…FR-52
import { v } from "convex/values";
import { query } from "./_generated/server";
import { clampLimit, LEADERBOARD_SIZE } from "./lib/constants";
import { vLeaderboardRow } from "./lib/returns";

/**
 * Top players, live via subscription. Each filter has its own index so the read
 * is a bounded index scan, never a table scan + sort:
 *   all → by_rating · human → by_ratingHuman · ai → by_ratingAi
 * `rating` in the returned row is always the field the filter sorted on.
 */
export const top = query({
  args: {
    filter: v.union(v.literal("all"), v.literal("human"), v.literal("ai")),
    limit: v.number(),
  },
  returns: v.array(vLeaderboardRow),
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit, LEADERBOARD_SIZE);
    const index =
      args.filter === "human"
        ? "by_ratingHuman"
        : args.filter === "ai"
          ? "by_ratingAi"
          : "by_rating";

    const players = await ctx.db
      .query("players")
      .withIndex(index)
      .order("desc")
      .take(limit);

    return players.map((player, i) => ({
      rank: i + 1,
      playerId: player._id,
      username: player.username,
      avatarUrl: player.avatarUrl,
      rating:
        args.filter === "human"
          ? player.ratingHuman
          : args.filter === "ai"
            ? player.ratingAi
            : player.rating,
      wins: player.wins,
      losses: player.losses,
      draws: player.draws,
    }));
  },
});
