import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  as,
  backdateQueue,
  makeTest,
  seedGame,
  setRatings,
  signUp,
} from "./harness.setup";

type T = ReturnType<typeof makeTest>;

async function queueRows(t: T): Promise<Array<Doc<"queue">>> {
  return await t.run(async (ctx) => ctx.db.query("queue").take(50));
}

async function onlineGames(t: T): Promise<Array<Doc<"games">>> {
  const all = await t.run(async (ctx) => ctx.db.query("games").take(50));
  return all.filter((game) => game.mode === "online");
}

/** `join` also schedules a pair tick; drain it so assertions see a settled state. */
async function settle(t: T): Promise<void> {
  await t.finishInProgressScheduledFunctions();
  await t.mutation(internal.queue.pair, {});
}

describe("queue.join / leave / myStatus", () => {
  test("enqueues once and reports status without reading the clock", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");

    await as(t, alice).mutation(api.queue.join, {});
    await as(t, alice).mutation(api.queue.join, {}); // idempotent re-click
    await t.finishInProgressScheduledFunctions();

    expect(await queueRows(t)).toHaveLength(1);
    const status = await as(t, alice).query(api.queue.myStatus, {});
    expect(status.inQueue).toBe(true);
    expect(status.joinedAt).toBeTypeOf("number");

    await as(t, alice).mutation(api.queue.leave, {});
    expect(await queueRows(t)).toHaveLength(0);
    expect(await as(t, alice).query(api.queue.myStatus, {})).toEqual({
      inQueue: false,
      joinedAt: null,
    });
  });

  test("refuses to queue while an active game is in progress (FR-26)", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    await seedGame(t, { mode: "online", whiteId: alice.id, blackId: bob.id });

    await expect(as(t, alice).mutation(api.queue.join, {})).rejects.toThrow(
      /already-in-game/,
    );
  });
});

describe("queue.pair", () => {
  test("pairs two players in range, assigns colours and seeds presence", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");

    await as(t, alice).mutation(api.queue.join, {});
    await as(t, bob).mutation(api.queue.join, {});
    await settle(t);

    expect(await queueRows(t)).toHaveLength(0);
    const games = await onlineGames(t);
    expect(games).toHaveLength(1);

    const game = games[0];
    expect(game.status).toBe("active");
    expect(game.rated).toBe(true);
    expect(game.turn).toBe("w");
    expect(game.moves).toEqual([]);
    expect(game.undoCount).toBe(0);

    const seats = [game.whiteId, game.blackId] as Array<Id<"players"> | null>;
    expect(seats).toContain(alice.id);
    expect(seats).toContain(bob.id);
    expect(game.whiteId).not.toBe(game.blackId);

    const presence = await t.run(async (ctx) =>
      ctx.db
        .query("presence")
        .withIndex("by_gameId_and_playerId", (q) => q.eq("gameId", game._id))
        .take(10),
    );
    expect(presence).toHaveLength(2);
    expect(presence.map((row) => row.role).sort()).toEqual(["b", "w"]);

    // Both clients learn about it through their existing subscription (FR-24).
    expect(await as(t, alice).query(api.games.myActiveGame, {})).toBe(game._id);
    expect(await as(t, bob).query(api.games.myActiveGame, {})).toBe(game._id);
  });

  test("does not pair outside the rating window, then widens over time (FR-23)", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    await setRatings(t, alice.id, { ratingHuman: 1200 });
    await setRatings(t, bob.id, { ratingHuman: 1700 });

    await as(t, alice).mutation(api.queue.join, {});
    await as(t, bob).mutation(api.queue.join, {});
    await settle(t);

    // |1700 - 1200| = 500 > the 200 starting window.
    expect(await onlineGames(t)).toHaveLength(0);
    expect(await queueRows(t)).toHaveLength(2);

    // 30 s of waiting widens the window to 200 + 3*100 = 500, which now admits it.
    await backdateQueue(t, alice.id, 30_000);
    await backdateQueue(t, bob.id, 30_000);
    await t.mutation(internal.queue.pair, {});

    expect(await onlineGames(t)).toHaveLength(1);
    expect(await queueRows(t)).toHaveLength(0);
  });

  test("never double-pairs: three waiting players yield one game and one leftover", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const cara = await signUp(t, "cara");

    await as(t, alice).mutation(api.queue.join, {});
    await as(t, bob).mutation(api.queue.join, {});
    await as(t, cara).mutation(api.queue.join, {});
    await settle(t);

    const games = await onlineGames(t);
    expect(games).toHaveLength(1);
    const remaining = await queueRows(t);
    expect(remaining).toHaveLength(1);

    const seated = [games[0].whiteId, games[0].blackId];
    expect(seated).not.toContain(remaining[0].playerId);
  });

  test("a repeated tick is a no-op (idempotent under retry)", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    await as(t, alice).mutation(api.queue.join, {});
    await as(t, bob).mutation(api.queue.join, {});
    await settle(t);
    await t.mutation(internal.queue.pair, {});
    await t.mutation(internal.queue.pair, {});
    expect(await onlineGames(t)).toHaveLength(1);
  });

  test("drops queue rows that have been waiting longer than 15 minutes", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    await as(t, alice).mutation(api.queue.join, {});
    await t.finishInProgressScheduledFunctions();
    await backdateQueue(t, alice.id, 16 * 60_000);

    await t.mutation(internal.queue.pair, {});
    expect(await queueRows(t)).toHaveLength(0);
    expect(await onlineGames(t)).toHaveLength(0);
  });
});
