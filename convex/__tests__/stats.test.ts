import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { makeTest, seedGame, signUp } from "./harness.setup";

describe("stats.landing", () => {
  test("counts online games in progress, and every game ever started", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");

    await seedGame(t, { mode: "online", whiteId: alice.id, blackId: bob.id });
    await seedGame(t, { mode: "online", whiteId: bob.id, blackId: alice.id });
    // A vs-AI game is in progress but is not an ONLINE game…
    await seedGame(t, { mode: "ai", whiteId: alice.id, difficulty: "beginner", aiColor: "b" });
    // …and a finished online game is over, so neither counts as "playing now".
    const over = await seedGame(t, { mode: "online", whiteId: alice.id, blackId: bob.id });
    await t.run(async (ctx) => {
      await ctx.db.patch("games", over, { status: "checkmate", winner: "w" });
    });

    // Public: no identity is set on `t` here, and the query still answers.
    const stats = await t.query(api.stats.landing, {});
    expect(stats.playingNow).toBe(2);
    expect(stats.gamesPlayed).toBe(4);
  });

  test("is zero on an empty deployment", async () => {
    const t = makeTest();
    expect(await t.query(api.stats.landing, {})).toEqual({ playingNow: 0, gamesPlayed: 0 });
  });
});
