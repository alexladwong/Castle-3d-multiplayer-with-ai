// convex/__tests__/tutor.test.ts — docs/PRO_TUTOR.md §5.3 / §8.
//
// `useTutorTurn` is a spend guard, not the Pro gate (Convex never sees Clerk's
// `fea` claim). These tests pin the three properties the route depends on: the cap
// is 40, the throw at the cap says `tutor-limit`, and the counter is per game.
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { MAX_TUTOR_TURNS_PER_GAME } from "../lib/constants";
import { as, makeTest, readGame, seedGame, signUp } from "./harness.setup";

describe("games.useTutorTurn", () => {
  test("counts up from a row that predates the field and reports what is left", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    // `seedGame` writes no `tutorTurnsUsed`: exactly the shape of every game stored
    // before the tutor shipped.
    const gameId = await seedGame(t, { mode: "online", whiteId: alice.id, blackId: bob.id });
    expect((await readGame(t, gameId)).tutorTurnsUsed).toBeUndefined();

    expect(await as(t, alice).mutation(api.games.useTutorTurn, { gameId })).toEqual({
      tutorTurnsUsed: 1,
      remaining: MAX_TUTOR_TURNS_PER_GAME - 1,
    });
    expect(await as(t, alice).mutation(api.games.useTutorTurn, { gameId })).toEqual({
      tutorTurnsUsed: 2,
      remaining: MAX_TUTOR_TURNS_PER_GAME - 2,
    });
    expect((await readGame(t, gameId)).tutorTurnsUsed).toBe(2);
  });

  test(`refuses with "tutor-limit" once the game has spent ${MAX_TUTOR_TURNS_PER_GAME} turns`, async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await seedGame(t, { mode: "online", whiteId: alice.id, blackId: bob.id });

    for (let i = 0; i < MAX_TUTOR_TURNS_PER_GAME; i++) {
      await as(t, alice).mutation(api.games.useTutorTurn, { gameId });
    }
    expect(await readGame(t, gameId)).toMatchObject({
      tutorTurnsUsed: MAX_TUTOR_TURNS_PER_GAME,
    });

    await expect(as(t, alice).mutation(api.games.useTutorTurn, { gameId })).rejects.toThrow(
      /tutor-limit/,
    );
    // The refusal must not have charged anything.
    expect((await readGame(t, gameId)).tutorTurnsUsed).toBe(MAX_TUTOR_TURNS_PER_GAME);
  });

  test("the counter is per game, and both players spend the same one", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const first = await seedGame(t, { mode: "online", whiteId: alice.id, blackId: bob.id });
    const second = await seedGame(t, { mode: "online", whiteId: alice.id, blackId: bob.id });

    await as(t, alice).mutation(api.games.useTutorTurn, { gameId: first });
    await as(t, bob).mutation(api.games.useTutorTurn, { gameId: first });

    expect((await readGame(t, first)).tutorTurnsUsed).toBe(2);
    expect((await readGame(t, second)).tutorTurnsUsed).toBeUndefined();
  });

  test("a spectator may spend a turn, and a game that is over still answers", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const carol = await signUp(t, "carol");
    const gameId = await seedGame(t, { mode: "online", whiteId: alice.id, blackId: bob.id });

    // Neither seat, but actually in the room: `useHint` would throw here.
    await as(t, carol).mutation(api.games.heartbeat, { gameId });
    expect(await as(t, carol).mutation(api.games.useTutorTurn, { gameId })).toMatchObject({
      tutorTurnsUsed: 1,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch("games", gameId, {
        status: "resigned",
        winner: "b",
        endReason: "resignation",
        endedAt: Date.now(),
      });
    });
    expect(await as(t, carol).mutation(api.games.useTutorTurn, { gameId })).toMatchObject({
      tutorTurnsUsed: 2,
    });
  });

  test("refuses a stranger who is not in the room — the budget is not public", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const mallory = await signUp(t, "mallory");
    // `listLive` publishes online game ids to the spectate list and the landing
    // ticker, so "knows the id" is not "may spend the game's 40 turns".
    const online = await seedGame(t, { mode: "online", whiteId: alice.id, blackId: bob.id });
    await expect(
      as(t, mallory).mutation(api.games.useTutorTurn, { gameId: online }),
    ).rejects.toThrow(/not-a-participant/);
    expect((await readGame(t, online)).tutorTurnsUsed).toBeUndefined();

    // Once the game is over there is nothing live left to break, and §1 sells the
    // tutor for replay too — so a member reviewing it is not asked for presence.
    await t.run(async (ctx) => {
      await ctx.db.patch("games", online, {
        status: "resigned",
        winner: "b",
        endReason: "resignation",
        endedAt: Date.now(),
      });
    });
    expect(await as(t, mallory).mutation(api.games.useTutorTurn, { gameId: online })).toMatchObject({
      tutorTurnsUsed: 1,
    });

    // An `ai` game has no audience at all, so presence cannot be earned on one.
    const solo = await seedGame(t, { mode: "ai", whiteId: alice.id, blackId: null });
    await expect(
      as(t, mallory).mutation(api.games.useTutorTurn, { gameId: solo }),
    ).rejects.toThrow(/not-a-participant/);
    // Its own player is still free to ask.
    expect(await as(t, alice).mutation(api.games.useTutorTurn, { gameId: solo })).toMatchObject({
      tutorTurnsUsed: 1,
    });
  });

  test("refuses a caller who is not signed in, and an unknown game", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await seedGame(t, { mode: "online", whiteId: alice.id, blackId: bob.id });

    await expect(t.mutation(api.games.useTutorTurn, { gameId })).rejects.toThrow(
      /Not authenticated/,
    );

    const gone = await seedGame(t, { mode: "online", whiteId: alice.id, blackId: bob.id });
    await t.run(async (ctx) => {
      await ctx.db.delete("games", gone);
    });
    await expect(
      as(t, alice).mutation(api.games.useTutorTurn, { gameId: gone }),
    ).rejects.toThrow(/game-not-found/);
  });
});
