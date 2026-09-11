// convex/stats.ts — the two numbers the landing hero prints under its CTAs
// (UI_REDESIGN §3: "● 14 playing now · 1,204 games").
//
// Public, like `games.listLive` and `leaderboard.top`: a signed-out visitor is the
// whole audience for this query, so it never touches the identity.
//
// Both counts are bounded reads, not aggregates. Convex has no `count()`, and the
// spec forbids a counter table, so each number is the length of a capped page:
//   * playingNow  — the `by_mode_and_status_and_lastMoveAt` index scoped to
//     (online, active), the same window `games.listLive` reads, capped at 200.
//   * gamesPlayed — the first 1,000 games by creation time. At the cap the UI
//     prints "1,000+" rather than a wrong exact number (see `landing-stats.tsx`).
import { v } from "convex/values";
import { query } from "./_generated/server";

/** Live games are a headline number, not a list: 200 is far past "a lot". */
const LIVE_SCAN_LIMIT = 200;
/** Above this the hero shows "1,000+"; keeps the read bounded on a busy deployment. */
export const GAMES_PLAYED_CAP = 1000;

export const landing = query({
  args: {},
  returns: v.object({
    /** Online games currently in progress, capped at 200. */
    playingNow: v.number(),
    /** Games ever started, capped at `GAMES_PLAYED_CAP` (display "1,000+" at the cap). */
    gamesPlayed: v.number(),
  }),
  handler: async (ctx) => {
    const live = await ctx.db
      .query("games")
      .withIndex("by_mode_and_status_and_lastMoveAt", (q) =>
        q.eq("mode", "online").eq("status", "active"),
      )
      .take(LIVE_SCAN_LIMIT);

    const played = await ctx.db.query("games").take(GAMES_PLAYED_CAP);

    return { playingNow: live.length, gamesPlayed: played.length };
  },
});
