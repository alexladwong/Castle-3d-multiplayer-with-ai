import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  as,
  backdateGame,
  backdatePresence,
  makeTest,
  readGame,
  readPlayer,
  seedGame,
  signUp,
} from "./harness.setup";

type T = ReturnType<typeof makeTest>;

async function presenceFor(t: T, gameId: Id<"games">): Promise<Array<Doc<"presence">>> {
  return await t.run(async (ctx) =>
    ctx.db
      .query("presence")
      .withIndex("by_gameId_and_playerId", (q) => q.eq("gameId", gameId))
      .take(20),
  );
}

describe("games.heartbeat", () => {
  test("upserts one presence row per viewer with the right role", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const mallory = await signUp(t, "mallory");
    const gameId = await seedGame(t, {
      mode: "online",
      whiteId: alice.id,
      blackId: bob.id,
    });

    await as(t, alice).mutation(api.games.heartbeat, { gameId });
    await as(t, alice).mutation(api.games.heartbeat, { gameId });
    await as(t, bob).mutation(api.games.heartbeat, { gameId });
    await as(t, mallory).mutation(api.games.heartbeat, { gameId });

    const rows = await presenceFor(t, gameId);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.role).sort()).toEqual(["b", "spectator", "w"]);

    // It must never touch the game document (§I-2).
    const game = await readGame(t, gameId);
    expect(game.moves).toEqual([]);
    expect(game.status).toBe("active");
  });

  test("both participants of a solo game may beat (CONVEX-AUTHZ-07)", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const ai = await seedGame(t, {
      mode: "ai",
      whiteId: alice.id,
      blackId: null,
      aiColor: "b",
      difficulty: "casual",
    });
    const local = await seedGame(t, { mode: "local", whiteId: alice.id, blackId: null });

    await as(t, alice).mutation(api.games.heartbeat, { gameId: ai });
    await as(t, alice).mutation(api.games.heartbeat, { gameId: local });

    expect((await presenceFor(t, ai)).map((row) => row.role)).toEqual(["w"]);
    expect((await presenceFor(t, local)).map((row) => row.role)).toEqual(["w"]);
  });

  test("rejects a stranger on ai and local games — they have no audience", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const mallory = await signUp(t, "mallory");
    const ai = await seedGame(t, {
      mode: "ai",
      whiteId: alice.id,
      blackId: null,
      aiColor: "b",
      difficulty: "casual",
    });
    const local = await seedGame(t, { mode: "local", whiteId: alice.id, blackId: null });

    await expect(
      as(t, mallory).mutation(api.games.heartbeat, { gameId: ai }),
    ).rejects.toThrow(/not-a-participant/);
    await expect(
      as(t, mallory).mutation(api.games.heartbeat, { gameId: local }),
    ).rejects.toThrow(/not-a-participant/);

    expect(await presenceFor(t, ai)).toHaveLength(0);
    expect(await presenceFor(t, local)).toHaveLength(0);
  });

  test("is a silent no-op once the game is over, for players and spectators alike", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const mallory = await signUp(t, "mallory");
    const gameId = await seedGame(t, {
      mode: "online",
      whiteId: alice.id,
      blackId: bob.id,
    });
    await as(t, alice).mutation(api.games.heartbeat, { gameId });
    const before = (await presenceFor(t, gameId))[0].lastSeen;

    await t.run(async (ctx) => {
      await ctx.db.patch("games", gameId, {
        status: "resigned",
        winner: "b",
        endReason: "resignation",
        endedAt: Date.now(),
      });
    });

    // A tab that has not yet noticed the result keeps beating: no throw, no write.
    await as(t, alice).mutation(api.games.heartbeat, { gameId });
    await as(t, mallory).mutation(api.games.heartbeat, { gameId });

    const rows = await presenceFor(t, gameId);
    expect(rows).toHaveLength(1);
    expect(rows[0].lastSeen).toBe(before);
  });

  test("requires an identity and a game that exists", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await seedGame(t, {
      mode: "online",
      whiteId: alice.id,
      blackId: bob.id,
    });
    await expect(t.mutation(api.games.heartbeat, { gameId })).rejects.toThrow(
      /Not authenticated/,
    );

    await t.run(async (ctx) => {
      await ctx.db.delete("games", gameId);
    });
    await expect(
      as(t, alice).mutation(api.games.heartbeat, { gameId }),
    ).rejects.toThrow(/game-not-found/);
  });
});

describe("games.sweepAbandoned", () => {
  async function stalledGame(t: T, white: { id: Id<"players"> }, black: { id: Id<"players"> }) {
    const gameId = await seedGame(t, {
      mode: "online",
      whiteId: white.id,
      blackId: black.id,
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("presence", {
        gameId,
        playerId: white.id,
        role: "w",
        lastSeen: now,
      });
      await ctx.db.insert("presence", {
        gameId,
        playerId: black.id,
        role: "b",
        lastSeen: now,
      });
    });
    await backdateGame(t, gameId, 120_000);
    return gameId;
  }

  test("leaves a game alone while both players are still present", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await stalledGame(t, alice, bob);

    await t.mutation(internal.games.sweepAbandoned, {});
    expect((await readGame(t, gameId)).status).toBe("active");
  });

  test("awards the win to the present side after 60 s of silence (FR-32)", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await stalledGame(t, alice, bob);
    await backdatePresence(t, gameId, bob.id, 120_000);

    await t.mutation(internal.games.sweepAbandoned, {});
    const game = await readGame(t, gameId);
    expect(game.status).toBe("abandoned");
    expect(game.winner).toBe("w");
    expect(game.endReason).toBe("abandonment");
    expect((await readPlayer(t, alice.id)).ratingHuman).toBe(1216);
    expect((await readPlayer(t, bob.id)).ratingHuman).toBe(1184);
  });

  test("both sides gone is a draw with NO rating change", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await stalledGame(t, alice, bob);
    await backdatePresence(t, gameId, alice.id, 120_000);
    await backdatePresence(t, gameId, bob.id, 120_000);

    await t.mutation(internal.games.sweepAbandoned, {});
    const game = await readGame(t, gameId);
    expect(game.status).toBe("abandoned");
    expect(game.winner).toBe("draw");

    const white = await readPlayer(t, alice.id);
    const black = await readPlayer(t, bob.id);
    expect(white.ratingHuman).toBe(1200);
    expect(black.ratingHuman).toBe(1200);
    expect(white.draws).toBe(0);
    expect(black.draws).toBe(0);
    const history = await t.run(async (ctx) => ctx.db.query("ratingHistory").take(10));
    expect(history).toHaveLength(0);
  });

  test("never forfeits AI or local games on the 60 s clock", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const ai = await seedGame(t, {
      mode: "ai",
      whiteId: alice.id,
      blackId: null,
      aiColor: "b",
      difficulty: "casual",
    });
    const local = await seedGame(t, {
      mode: "local",
      whiteId: alice.id,
      blackId: null,
    });
    await backdateGame(t, ai, 600_000);
    await backdateGame(t, local, 600_000);

    await t.mutation(internal.games.sweepAbandoned, {});
    expect((await readGame(t, ai)).status).toBe("active");
    expect((await readGame(t, local)).status).toBe("active");
  });

  test("finalises AI and local games nobody has touched for a day, unrated", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const ai = await seedGame(t, {
      mode: "ai",
      whiteId: alice.id,
      blackId: null,
      aiColor: "b",
      difficulty: "casual",
      sans: ["e4", "e5"],
    });
    const local = await seedGame(t, {
      mode: "local",
      whiteId: alice.id,
      blackId: null,
    });
    await backdateGame(t, ai, 25 * 60 * 60_000);
    await backdateGame(t, local, 25 * 60 * 60_000);

    await t.mutation(internal.games.sweepAbandoned, {});
    expect((await readGame(t, ai)).status).toBe("abandoned");
    expect((await readGame(t, local)).status).toBe("abandoned");

    // Unrated: a forgotten solo game must never move Elo or the W/L/D record.
    const player = await readPlayer(t, alice.id);
    expect(player.ratingAi).toBe(1200);
    expect(player.draws).toBe(0);
    expect(await t.run(async (ctx) => ctx.db.query("ratingHistory").take(5))).toHaveLength(0);

    // …and the owner can start a new game again (FR-26).
    await as(t, alice).mutation(api.games.createLocalGame, {});
  });

  test("stale AI games cannot block the online sweep window (head-of-line)", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    // More permanently-active AI games than the sweep's per-tick budget, all with
    // an older `lastMoveAt` than the online game that actually needs sweeping.
    for (let i = 0; i < 60; i++) {
      const filler = await seedGame(t, {
        mode: "ai",
        whiteId: alice.id,
        blackId: null,
        aiColor: "b",
        difficulty: "casual",
      });
      await backdateGame(t, filler, 10 * 60_000);
    }

    const gameId = await stalledGame(t, alice, bob);
    await backdatePresence(t, gameId, bob.id, 120_000);

    await t.mutation(internal.games.sweepAbandoned, {});
    expect((await readGame(t, gameId)).status).toBe("abandoned");
  });

  test("many spectators cannot hide the players and force a spurious abandon", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await stalledGame(t, alice, bob);

    // Far more spectator rows than any bounded per-game presence scan reads.
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i < 80; i++) {
        const watcher = await ctx.db.insert("players", {
          clerkId: `user_watch_${i}`,
          tokenIdentifier: `watch|${i}`,
          username: `watcher${i}`,
          usernameLower: `watcher${i}`,
          avatarUrl: "",
          rating: 1200,
          ratingHuman: 1200,
          ratingAi: 1200,
          wins: 0,
          losses: 0,
          draws: 0,
          roomPreset: "study",
          boardFlipEnabled: true,
          boardView: "3d",
          qualityTier: "auto",
          postFxEnabled: true,
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("presence", {
          gameId,
          playerId: watcher,
          role: "spectator",
          lastSeen: now,
        });
      }
    });

    await t.mutation(internal.games.sweepAbandoned, {});
    expect((await readGame(t, gameId)).status).toBe("active");
  });

  test("is idempotent — a second sweep does not double-apply ratings", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await stalledGame(t, alice, bob);
    await backdatePresence(t, gameId, bob.id, 120_000);

    await t.mutation(internal.games.sweepAbandoned, {});
    await t.mutation(internal.games.sweepAbandoned, {});
    expect((await readPlayer(t, alice.id)).ratingHuman).toBe(1216);
    expect((await readGame(t, gameId)).status).toBe("abandoned");
  });
});

describe("games.refreshSpectatorCounts", () => {
  test("refreshes the spectator count of a game that is being played right now", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const mallory = await signUp(t, "mallory");
    const gameId = await seedGame(t, {
      mode: "online",
      whiteId: alice.id,
      blackId: bob.id,
    });
    await as(t, mallory).mutation(api.games.heartbeat, { gameId });

    // The game is live, NOT idle: it never enters the abandon window, so this is
    // the only pass that can keep the "N watching" badge honest.
    await t.mutation(internal.games.refreshSpectatorCounts, {});
    expect((await readGame(t, gameId)).spectatorCount).toBe(1);
    expect((await readGame(t, gameId)).status).toBe("active");

    const live = await t.query(api.games.listLive, { limit: 10 });
    expect(live[0].spectatorCount).toBe(1);
  });

  test("counts only spectators seen within the abandon window", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const mallory = await signUp(t, "mallory");
    const gameId = await seedGame(t, {
      mode: "online",
      whiteId: alice.id,
      blackId: bob.id,
    });
    await as(t, mallory).mutation(api.games.heartbeat, { gameId });
    await t.mutation(internal.games.refreshSpectatorCounts, {});
    expect((await readGame(t, gameId)).spectatorCount).toBe(1);

    // A watcher who stopped beating two minutes ago is no longer watching.
    await backdatePresence(t, gameId, mallory.id, 120_000);
    await t.mutation(internal.games.refreshSpectatorCounts, {});
    expect((await readGame(t, gameId)).spectatorCount).toBe(0);
  });
});

describe("games.presenceFor", () => {
  test("returns both participants' last heartbeat and no wall clock (FR-32)", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const mallory = await signUp(t, "mallory");
    const gameId = await seedGame(t, {
      mode: "online",
      whiteId: alice.id,
      blackId: bob.id,
    });

    expect(await as(t, alice).query(api.games.presenceFor, { gameId })).toEqual({
      w: null,
      b: null,
    });

    await as(t, alice).mutation(api.games.heartbeat, { gameId });
    await as(t, bob).mutation(api.games.heartbeat, { gameId });
    await backdatePresence(t, gameId, bob.id, 120_000);

    // Readable by both participants and by a spectator, with identical values.
    const seen = await as(t, alice).query(api.games.presenceFor, { gameId });
    const watched = await as(t, mallory).query(api.games.presenceFor, { gameId });
    expect(seen).toEqual(watched);
    expect(seen.w).not.toBeNull();
    expect(seen.b).not.toBeNull();
    // Black is the stale side: white's heartbeat is ~2 minutes newer, which is well
    // past the 60 s abandon window the client compares against.
    expect((seen.w ?? 0) - (seen.b ?? 0)).toBeGreaterThan(60_000);

    // A spectator's own row is never mistaken for a participant's.
    await as(t, mallory).mutation(api.games.heartbeat, { gameId });
    expect(await as(t, alice).query(api.games.presenceFor, { gameId })).toEqual(seen);
  });

  test("requires an identity and tolerates a missing game", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await seedGame(t, { mode: "ai", whiteId: alice.id, blackId: null });
    await expect(t.query(api.games.presenceFor, { gameId })).rejects.toThrow(
      /Not authenticated/,
    );
    // The AI seat has no presence row of its own.
    expect(await as(t, alice).query(api.games.presenceFor, { gameId })).toEqual({
      w: null,
      b: null,
    });
  });
});

describe("games.gcPresence", () => {
  test("deletes rows nobody has refreshed for ten minutes", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await seedGame(t, {
      mode: "online",
      whiteId: alice.id,
      blackId: bob.id,
    });
    await as(t, alice).mutation(api.games.heartbeat, { gameId });
    await as(t, bob).mutation(api.games.heartbeat, { gameId });
    await backdatePresence(t, gameId, bob.id, 20 * 60_000);

    await t.mutation(internal.games.gcPresence, {});
    const rows = await presenceFor(t, gameId);
    expect(rows).toHaveLength(1);
    expect(rows[0].playerId).toBe(alice.id);
  });
});
