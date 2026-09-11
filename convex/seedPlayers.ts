import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const PREFIX = "castle-demo-player-v1-";
const ADJECTIVES = ["amber", "cosmic", "velvet", "silver", "quiet", "crimson", "lunar", "cobalt", "golden", "frost"];
const PIECES = ["rook", "knight", "bishop", "queen", "pawn"];

/** Fictional leaderboard records only; never provisions Clerk accounts. */
export const seed = internalMutation({
  args: {},
  returns: v.object({ added: v.number(), existing: v.number(), avatarsUpdated: v.number(), totalFixtures: v.number() }),
  handler: async (ctx) => {
    if (process.env.CONVEX_CLOUD_URL !== "https://tangible-dogfish-529.convex.cloud") {
      throw new Error("This fixture is restricted to the Castle development deployment.");
    }
    let added = 0;
    let existing = 0;
    let avatarsUpdated = 0;
    const now = Date.now();
    for (let i = 0; i < 50; i++) {
      const clerkId = `${PREFIX}${String(i + 1).padStart(2, "0")}`;
      // The provider's men/15 and men/17 images are identical; use a distinct replacement.
      const avatarUrl = i === 14
        ? "https://randomuser.me/api/portraits/women/50.jpg"
        : `https://randomuser.me/api/portraits/${i % 2 === 0 ? "men" : "women"}/${10 + Math.floor(i / 2)}.jpg`;
      const fixture = await ctx.db.query("players")
        .withIndex("by_clerkId", q => q.eq("clerkId", clerkId)).unique();
      if (fixture) {
        if (fixture.avatarUrl !== avatarUrl) {
          await ctx.db.patch("players", fixture._id, { avatarUrl });
          avatarsUpdated++;
        }
        existing++;
        continue;
      }
      const username = `${ADJECTIVES[i % ADJECTIVES.length]}${PIECES[Math.floor(i / ADJECTIVES.length)]}`;
      const collision = await ctx.db.query("players")
        .withIndex("by_usernameLower", q => q.eq("usernameLower", username)).first();
      if (collision) throw new Error(`Username already belongs to another player: ${username}`);

      const rating = 800 + ((i * 17) % 50) * 27;
      const ratingHuman = 1200 + Math.round((rating - 1200) * 0.65);
      const totalGames = 30 + ((i * 43) % 270);
      const draws = 2 + (i % 13);
      const wins = Math.round((totalGames - draws) * (0.3 + ((rating - 800) / 1323) * 0.48));
      await ctx.db.insert("players", {
        clerkId,
        tokenIdentifier: `https://castle-demo.invalid|${clerkId}`,
        username,
        usernameLower: username,
        avatarUrl,
        rating,
        ratingHuman,
        ratingAi: rating - ratingHuman + 1200,
        wins,
        losses: totalGames - wins - draws,
        draws,
        roomPreset: (["study", "space", "park", "arcade", "minimal"] as const)[i % 5],
        boardFlipEnabled: true,
        boardView: "3d",
        qualityTier: "auto",
        postFxEnabled: true,
        createdAt: now - (30 + ((i * 7) % 150)) * 86400000,
        updatedAt: now,
      });
      added++;
    }
    return { added, existing, avatarsUpdated, totalFixtures: added + existing };
  },
});
