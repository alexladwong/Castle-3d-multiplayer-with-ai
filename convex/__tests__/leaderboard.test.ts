import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { as, makeTest, seedGame, setRatings, signUp } from "./harness.setup";

describe("leaderboard.top", () => {
  test("orders by the pool the filter names", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const cara = await signUp(t, "cara");

    await setRatings(t, alice.id, { rating: 1500, ratingHuman: 1100, ratingAi: 1900 });
    await setRatings(t, bob.id, { rating: 1700, ratingHuman: 1800, ratingAi: 1000 });
    await setRatings(t, cara.id, { rating: 1300, ratingHuman: 1400, ratingAi: 1500 });

    const all = await t.query(api.leaderboard.top, { filter: "all", limit: 10 });
    expect(all.map((row) => row.username)).toEqual(["bob", "alice", "cara"]);
    expect(all.map((row) => row.rank)).toEqual([1, 2, 3]);
    expect(all[0].rating).toBe(1700);

    const human = await t.query(api.leaderboard.top, { filter: "human", limit: 10 });
    expect(human.map((row) => row.username)).toEqual(["bob", "cara", "alice"]);
    expect(human[0].rating).toBe(1800);

    const ai = await t.query(api.leaderboard.top, { filter: "ai", limit: 10 });
    expect(ai.map((row) => row.username)).toEqual(["alice", "cara", "bob"]);
    expect(ai[0].rating).toBe(1900);
  });

  test("is public and clamps a hostile limit", async () => {
    const t = makeTest();
    await signUp(t, "alice");
    expect(await t.query(api.leaderboard.top, { filter: "all", limit: 1e9 })).toHaveLength(1);
    expect(await t.query(api.leaderboard.top, { filter: "all", limit: -5 })).toHaveLength(1);
    expect(
      await t.query(api.leaderboard.top, { filter: "all", limit: Number.NaN }),
    ).toHaveLength(1);
  });
});

describe("ratingHistory.forPlayer", () => {
  test("returns oldest-first rows for the requested pool", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");

    // One rated online loss for alice, one rated AI win.
    const online = await seedGame(t, {
      mode: "online",
      whiteId: alice.id,
      blackId: bob.id,
    });
    await as(t, alice).mutation(api.games.resign, { gameId: online });

    const ai = await seedGame(t, {
      mode: "ai",
      whiteId: alice.id,
      blackId: null,
      aiColor: "b",
      difficulty: "casual",
      sans: ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6"],
    });
    await as(t, alice).mutation(api.games.makeMove, {
      gameId: ai,
      from: "h5",
      to: "f7",
    });

    const all = await t.query(api.ratingHistory.forPlayer, {
      username: "alice",
      pool: "all",
      limit: 50,
    });
    expect(all).toHaveLength(2);
    expect(all[0].createdAt).toBeLessThanOrEqual(all[1].createdAt);
    expect(all.map((row) => row.pool)).toEqual(["human", "ai"]);

    const aiOnly = await t.query(api.ratingHistory.forPlayer, {
      username: "ALICE",
      pool: "ai",
      limit: 50,
    });
    expect(aiOnly).toHaveLength(1);
    expect(aiOnly[0].after).toBeGreaterThan(aiOnly[0].before);

    expect(
      await t.query(api.ratingHistory.forPlayer, {
        username: "nobody",
        pool: "all",
        limit: 10,
      }),
    ).toEqual([]);
  });
});

describe("commentary", () => {
  test("appends, overwrites the same (ply, source) and lists in ply order", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await seedGame(t, {
      mode: "ai",
      whiteId: alice.id,
      blackId: null,
      aiColor: "b",
      difficulty: "casual",
      sans: ["e4", "e5"],
    });

    await as(t, alice).mutation(api.commentary.append, {
      gameId,
      ply: 2,
      text: "Symmetry!",
      source: "eve",
      persona: "Marco",
    });
    // A retry of the same turn must overwrite, not duplicate.
    await as(t, alice).mutation(api.commentary.append, {
      gameId,
      ply: 2,
      text: "Symmetry, my friend!",
      source: "eve",
      persona: "Marco",
    });
    await as(t, alice).mutation(api.commentary.append, {
      gameId,
      ply: 2,
      text: "Try Nf3.",
      source: "hint",
    });
    await as(t, alice).mutation(api.commentary.append, {
      gameId,
      ply: 1,
      text: "   ",
      source: "eve",
    });

    const rows = await as(t, alice).query(api.commentary.forGame, { gameId });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.ply === 2)).toBe(true);
    expect(rows.find((row) => row.source === "eve")?.text).toBe("Symmetry, my friend!");
    expect(rows.find((row) => row.source === "hint")?.text).toBe("Try Nf3.");
  });

  test("truncates to 400 characters and refuses non-participants", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const mallory = await signUp(t, "mallory");
    const gameId = await seedGame(t, {
      mode: "ai",
      whiteId: alice.id,
      blackId: null,
      aiColor: "b",
      difficulty: "casual",
    });

    await as(t, alice).mutation(api.commentary.append, {
      gameId,
      ply: 0,
      text: "x".repeat(1000),
      source: "eve",
    });
    const rows = await as(t, alice).query(api.commentary.forGame, { gameId });
    expect(rows[0].text).toHaveLength(400);

    await expect(
      as(t, mallory).mutation(api.commentary.append, {
        gameId,
        ply: 0,
        text: "hi",
        source: "eve",
      }),
    ).rejects.toThrow(/not-a-participant/);
  });
});
