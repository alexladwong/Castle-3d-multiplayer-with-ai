import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  as,
  makeTest,
  PROMOTION_PREFIX,
  readGame,
  readPlayer,
  SCHOLARS_MATE,
  seedGame,
  setRatings,
  signUp,
  STALEMATE_PREFIX,
  type TestPlayer,
} from "./harness.setup";

type T = ReturnType<typeof makeTest>;

async function onlineGame(t: T, white: TestPlayer, black: TestPlayer) {
  return await seedGame(t, { mode: "online", whiteId: white.id, blackId: black.id });
}

async function playPairs(
  t: T,
  gameId: Id<"games">,
  white: TestPlayer,
  black: TestPlayer,
  moves: Array<{ from: string; to: string }>,
) {
  let last;
  for (let i = 0; i < moves.length; i++) {
    const mover = i % 2 === 0 ? white : black;
    last = await as(t, mover).mutation(api.games.makeMove, {
      gameId,
      from: moves[i].from,
      to: moves[i].to,
    });
  }
  return last;
}

describe("games.makeMove", () => {
  test("applies a legal move and derives fen / turn / lastMove / pgn", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await onlineGame(t, alice, bob);

    const result = await as(t, alice).mutation(api.games.makeMove, {
      gameId,
      from: "e2",
      to: "e4",
    });
    expect(result).toEqual({ san: "e4", status: "active", turn: "b" });

    const game = await readGame(t, gameId);
    expect(game.moves).toEqual(["e4"]);
    expect(game.turn).toBe("b");
    expect(game.fen).toContain("4P3");
    expect(game.lastMove).toEqual({ from: "e2", to: "e4", san: "e4", colour: "w" });
    expect(game.pgn).toContain("1. e4");
  });

  test("records the square an en-passant victim actually stood on", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await onlineGame(t, alice, bob);

    // 1. e4 a6 2. e5 d5 3. exd6 e.p.
    await as(t, alice).mutation(api.games.makeMove, { gameId, from: "e2", to: "e4" });
    await as(t, bob).mutation(api.games.makeMove, { gameId, from: "a7", to: "a6" });
    await as(t, alice).mutation(api.games.makeMove, { gameId, from: "e4", to: "e5" });
    await as(t, bob).mutation(api.games.makeMove, { gameId, from: "d7", to: "d5" });
    await as(t, alice).mutation(api.games.makeMove, { gameId, from: "e5", to: "d6" });

    const game = await readGame(t, gameId);
    // The pawn taken is on d5; the board's capture flight must not start from d6.
    expect(game.lastMove).toMatchObject({
      from: "e5",
      to: "d6",
      captured: "p",
      capturedSquare: "d5",
    });
  });

  test("rejects an illegal move without writing anything", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await onlineGame(t, alice, bob);

    await expect(
      as(t, alice).mutation(api.games.makeMove, { gameId, from: "e2", to: "e5" }),
    ).rejects.toThrow(/illegal-move/);

    const game = await readGame(t, gameId);
    expect(game.moves).toEqual([]);
    expect(game.turn).toBe("w");
  });

  test("rejects an out-of-turn move", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await onlineGame(t, alice, bob);

    await expect(
      as(t, bob).mutation(api.games.makeMove, { gameId, from: "e7", to: "e5" }),
    ).rejects.toThrow(/not-your-turn/);
  });

  test("rejects a non-participant even when it is that colour's turn", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const mallory = await signUp(t, "mallory");
    const gameId = await onlineGame(t, alice, bob);

    await expect(
      as(t, mallory).mutation(api.games.makeMove, { gameId, from: "e2", to: "e4" }),
    ).rejects.toThrow(/not-a-participant/);
  });

  test("rejects an unauthenticated caller", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await onlineGame(t, alice, bob);
    await expect(
      t.mutation(api.games.makeMove, { gameId, from: "e2", to: "e4" }),
    ).rejects.toThrow(/Not authenticated/);
  });

  test("requires an explicit promotion piece (FR-11: no auto-queen)", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await seedGame(t, {
      mode: "online",
      whiteId: alice.id,
      blackId: bob.id,
      sans: PROMOTION_PREFIX,
    });

    await expect(
      as(t, alice).mutation(api.games.makeMove, { gameId, from: "b7", to: "a8" }),
    ).rejects.toThrow(/promotion-required/);

    const result = await as(t, alice).mutation(api.games.makeMove, {
      gameId,
      from: "b7",
      to: "a8",
      promotion: "n",
    });
    expect(result.san).toBe("bxa8=N");
    const game = await readGame(t, gameId);
    expect(game.lastMove?.promotion).toBe("n");
    expect(game.lastMove?.captured).toBe("r");
  });

  test("refuses moves once the game is over", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await onlineGame(t, alice, bob);
    await playPairs(t, gameId, alice, bob, SCHOLARS_MATE);
    await expect(
      as(t, bob).mutation(api.games.makeMove, { gameId, from: "b7", to: "b6" }),
    ).rejects.toThrow(/game-not-active/);
  });
});

describe("game endings and ratings", () => {
  test("checkmate finalises the game, applies Elo and writes ratingHistory", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await onlineGame(t, alice, bob);

    const result = await playPairs(t, gameId, alice, bob, SCHOLARS_MATE);
    expect(result).toEqual({
      san: "Qxf7#",
      status: "checkmate",
      turn: "b",
      winner: "w",
    });

    const game = await readGame(t, gameId);
    expect(game.status).toBe("checkmate");
    expect(game.winner).toBe("w");
    expect(game.endReason).toBe("checkmate");
    expect(game.endedAt).toBeTypeOf("number");
    expect(game.pgn).toContain('[Result "1-0"]');

    // K = 32, both start at 1200 -> expected 0.5 -> ±16
    const white = await readPlayer(t, alice.id);
    const black = await readPlayer(t, bob.id);
    expect(white.ratingHuman).toBe(1216);
    expect(white.rating).toBe(1216);
    expect(white.wins).toBe(1);
    expect(black.ratingHuman).toBe(1184);
    expect(black.losses).toBe(1);
    expect(white.ratingAi).toBe(1200); // untouched pool

    const history = await t.run(async (ctx) =>
      ctx.db
        .query("ratingHistory")
        .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
        .take(10),
    );
    expect(history).toHaveLength(2);
    expect(history.every((row) => row.pool === "human")).toBe(true);
    expect(history.map((row) => row.delta).sort((a, b) => a - b)).toEqual([-16, 16]);
    for (const row of history) expect(row.before + row.delta).toBe(row.after);
  });

  test("stalemate is a draw for both pools", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    await setRatings(t, alice.id, { rating: 1400, ratingHuman: 1400 });
    const gameId = await seedGame(t, {
      mode: "online",
      whiteId: alice.id,
      blackId: bob.id,
      sans: STALEMATE_PREFIX,
    });

    const result = await as(t, alice).mutation(api.games.makeMove, {
      gameId,
      from: "c8",
      to: "e6",
    });
    expect(result.status).toBe("stalemate");
    expect(result.winner).toBe("draw");

    const game = await readGame(t, gameId);
    expect(game.endReason).toBe("stalemate");
    expect(game.pgn).toContain('[Result "1/2-1/2"]');

    const white = await readPlayer(t, alice.id);
    const black = await readPlayer(t, bob.id);
    expect(white.ratingHuman).toBe(1392); // -8
    expect(black.ratingHuman).toBe(1208); // +8
    expect(white.draws).toBe(1);
    expect(black.draws).toBe(1);
  });

  test("resign hands the win to the other colour", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await onlineGame(t, alice, bob);

    await as(t, bob).mutation(api.games.resign, { gameId });
    const game = await readGame(t, gameId);
    expect(game.status).toBe("resigned");
    expect(game.winner).toBe("w");
    expect(game.endReason).toBe("resignation");

    expect((await readPlayer(t, alice.id)).ratingHuman).toBe(1216);
    expect((await readPlayer(t, bob.id)).ratingHuman).toBe(1184);
  });

  test("a spectator cannot resign someone else's game", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const mallory = await signUp(t, "mallory");
    const gameId = await onlineGame(t, alice, bob);
    await expect(
      as(t, mallory).mutation(api.games.resign, { gameId }),
    ).rejects.toThrow(/not-a-participant/);
  });
});

describe("draw offers", () => {
  test("accepting ends the game by agreement", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await onlineGame(t, alice, bob);

    await as(t, alice).mutation(api.games.offerDraw, { gameId });
    expect((await readGame(t, gameId)).drawOffer).toBe("w");

    await as(t, bob).mutation(api.games.respondDraw, { gameId, accept: true });
    const game = await readGame(t, gameId);
    expect(game.status).toBe("draw");
    expect(game.winner).toBe("draw");
    expect(game.endReason).toBe("agreement");
    expect(game.drawOffer).toBeUndefined();
    expect((await readPlayer(t, alice.id)).draws).toBe(1);
  });

  test("an unrated online game still counts the draw for both sides (FR-48)", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    // `undo` is rejected outright for online games (FR-46), so this can only be
    // reached defensively — but the rule is the same in every mode: `rated: false`
    // suppresses the Elo, never the W/L/D record.
    const gameId = await seedGame(t, {
      mode: "online",
      whiteId: alice.id,
      blackId: bob.id,
      sans: ["e4", "e5"],
      rated: false,
    });

    await as(t, alice).mutation(api.games.offerDraw, { gameId });
    await as(t, bob).mutation(api.games.respondDraw, { gameId, accept: true });

    for (const player of [alice, bob]) {
      const row = await readPlayer(t, player.id);
      expect(row.draws).toBe(1);
      expect(row.ratingHuman).toBe(1200);
      expect(row.rating).toBe(1200);
    }
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query("ratingHistory")
          .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
          .take(5),
      ),
    ).toHaveLength(0);
  });

  test("declining clears the offer and leaves the game running", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await onlineGame(t, alice, bob);

    await as(t, alice).mutation(api.games.offerDraw, { gameId });
    await as(t, bob).mutation(api.games.respondDraw, { gameId, accept: false });
    const game = await readGame(t, gameId);
    expect(game.status).toBe("active");
    expect(game.drawOffer).toBeUndefined();
  });

  test("a repeat offer is a no-op and the offerer cannot answer themselves", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await onlineGame(t, alice, bob);

    await as(t, alice).mutation(api.games.offerDraw, { gameId });
    await as(t, alice).mutation(api.games.offerDraw, { gameId });
    expect((await readGame(t, gameId)).status).toBe("active");

    await expect(
      as(t, alice).mutation(api.games.respondDraw, { gameId, accept: true }),
    ).rejects.toThrow(/cannot-answer-own-offer/);
  });

  test("offering into a standing offer from the other side accepts it", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await onlineGame(t, alice, bob);

    await as(t, alice).mutation(api.games.offerDraw, { gameId });
    await as(t, bob).mutation(api.games.offerDraw, { gameId });
    expect((await readGame(t, gameId)).status).toBe("draw");
  });

  test("is refused in an AI game — nobody could ever answer the offer", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await seedGame(t, {
      mode: "ai",
      whiteId: alice.id,
      blackId: null,
      aiColor: "b",
      difficulty: "casual",
    });

    await expect(
      as(t, alice).mutation(api.games.offerDraw, { gameId }),
    ).rejects.toThrow(/draw-not-available/);
    await expect(
      as(t, alice).mutation(api.games.respondDraw, { gameId, accept: true }),
    ).rejects.toThrow(/draw-not-available/);
    expect((await readGame(t, gameId)).drawOffer).toBeUndefined();
  });

  test("a local owner can still agree a draw with themselves (FR-21a)", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await seedGame(t, {
      mode: "local",
      whiteId: alice.id,
      blackId: null,
    });

    await as(t, alice).mutation(api.games.offerDraw, { gameId });
    await as(t, alice).mutation(api.games.respondDraw, { gameId, accept: true });
    const game = await readGame(t, gameId);
    expect(game.status).toBe("draw");
    expect(game.endReason).toBe("agreement");
  });

  test("a move clears a standing draw offer", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await onlineGame(t, alice, bob);
    await as(t, alice).mutation(api.games.offerDraw, { gameId });
    await as(t, alice).mutation(api.games.makeMove, { gameId, from: "e2", to: "e4" });
    expect((await readGame(t, gameId)).drawOffer).toBeUndefined();
  });
});

describe("games.makeAiMove", () => {
  async function aiGame(t: T, human: TestPlayer, sans: string[] = []) {
    return await seedGame(t, {
      mode: "ai",
      whiteId: human.id,
      blackId: null,
      aiColor: "b",
      difficulty: "casual",
      sans,
    });
  }

  test("applies a legal SAN on the AI's turn", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await aiGame(t, alice, ["e4"]);

    const result = await as(t, alice).mutation(api.games.makeAiMove, {
      gameId,
      san: "e5",
      expectedPly: 1,
    });
    expect(result).toEqual({ san: "e5", status: "active", turn: "w" });
    expect((await readGame(t, gameId)).moves).toEqual(["e4", "e5"]);
  });

  test("accepts LAN from the model (permissive parser)", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await aiGame(t, alice, ["e4"]);
    const result = await as(t, alice).mutation(api.games.makeAiMove, {
      gameId,
      san: "e7e5",
      expectedPly: 1,
    });
    expect(result.san).toBe("e5");
  });

  test("rejects an illegal SAN", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await aiGame(t, alice, ["e4"]);
    await expect(
      as(t, alice).mutation(api.games.makeAiMove, {
        gameId,
        san: "Qh4",
        expectedPly: 1,
      }),
    ).rejects.toThrow(/illegal-move/);
  });

  test("rejects a stale ply (idempotency guard against double moves)", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await aiGame(t, alice, ["e4"]);
    await expect(
      as(t, alice).mutation(api.games.makeAiMove, {
        gameId,
        san: "e5",
        expectedPly: 0,
      }),
    ).rejects.toThrow(/stale-ai-move/);
  });

  test("rejects a move when it is not the AI's turn", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await aiGame(t, alice, []);
    await expect(
      as(t, alice).mutation(api.games.makeAiMove, {
        gameId,
        san: "e4",
        expectedPly: 0,
      }),
    ).rejects.toThrow(/not-ai-turn/);
  });

  test("rejects an AI move on an online game and from a non-participant", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const mallory = await signUp(t, "mallory");

    const online = await seedGame(t, {
      mode: "online",
      whiteId: alice.id,
      blackId: bob.id,
      sans: ["e4"],
    });
    await expect(
      as(t, bob).mutation(api.games.makeAiMove, {
        gameId: online,
        san: "e5",
        expectedPly: 1,
      }),
    ).rejects.toThrow(/not-an-ai-game/);

    const ai = await aiGame(t, alice, ["e4"]);
    await expect(
      as(t, mallory).mutation(api.games.makeAiMove, {
        gameId: ai,
        san: "e5",
        expectedPly: 1,
      }),
    ).rejects.toThrow(/not-a-participant/);
  });

  test("AI games use K=16 against the fixed AI rating", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    // Human (white) mates the AI: casual AI is rated 1100, human 1200.
    const gameId = await seedGame(t, {
      mode: "ai",
      whiteId: alice.id,
      blackId: null,
      aiColor: "b",
      difficulty: "casual",
      sans: ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6"],
    });
    await as(t, alice).mutation(api.games.makeMove, {
      gameId,
      from: "h5",
      to: "f7",
    });

    const game = await readGame(t, gameId);
    expect(game.status).toBe("checkmate");
    const human = await readPlayer(t, alice.id);
    // expected(1200,1100) = 0.6401 -> round(16 * (1 - 0.6401)) = 6
    expect(human.ratingAi).toBe(1206);
    expect(human.rating).toBe(1206);
    expect(human.ratingHuman).toBe(1200);
    const history = await t.run(async (ctx) =>
      ctx.db
        .query("ratingHistory")
        .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
        .take(10),
    );
    expect(history).toHaveLength(1);
    expect(history[0].pool).toBe("ai");
  });
});

describe("games.undo", () => {
  test("rewinds a full turn in an AI game and unrates it", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await seedGame(t, {
      mode: "ai",
      whiteId: alice.id,
      blackId: null,
      aiColor: "b",
      difficulty: "beginner",
      sans: ["e4", "e5", "Nf3", "Nc6"],
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("commentary", {
        gameId,
        ply: 4,
        text: "nice knight",
        source: "eve",
        createdAt: Date.now(),
      });
      await ctx.db.patch("games", gameId, { eveSessionId: "sess_1" });
    });

    const result = await as(t, alice).mutation(api.games.undo, { gameId, toPly: 2 });
    expect(result.turn).toBe("w");
    expect(result.undoCount).toBe(2);

    const game = await readGame(t, gameId);
    expect(game.moves).toEqual(["e4", "e5"]);
    expect(game.rated).toBe(false);
    expect(game.eveSessionId).toBeUndefined();
    expect(game.lastMove?.san).toBe("e5");
    const commentary = await t.run(async (ctx) =>
      ctx.db
        .query("commentary")
        .withIndex("by_gameId_and_ply", (q) => q.eq("gameId", gameId))
        .take(10),
    );
    expect(commentary).toHaveLength(0);
  });

  test("snaps an odd ply down so the human is to move again", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await seedGame(t, {
      mode: "ai",
      whiteId: alice.id,
      blackId: null,
      aiColor: "b",
      difficulty: "beginner",
      sans: ["e4", "e5", "Nf3", "Nc6"],
    });
    const result = await as(t, alice).mutation(api.games.undo, { gameId, toPly: 3 });
    expect(result.turn).toBe("w");
    expect((await readGame(t, gameId)).moves).toEqual(["e4", "e5"]);
  });

  test("rewinds a single half-move in a local game", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await seedGame(t, {
      mode: "local",
      whiteId: alice.id,
      blackId: null,
      localPlayerTwoName: "Sam",
      sans: ["e4", "e5"],
    });
    const result = await as(t, alice).mutation(api.games.undo, { gameId, toPly: 1 });
    expect(result.turn).toBe("b");
    expect(result.undoCount).toBe(1);
    expect((await readGame(t, gameId)).moves).toEqual(["e4"]);
  });

  test("is rejected outright for online games (FR-46)", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const gameId = await seedGame(t, {
      mode: "online",
      whiteId: alice.id,
      blackId: bob.id,
      sans: ["e4", "e5"],
    });
    await expect(
      as(t, alice).mutation(api.games.undo, { gameId, toPly: 1 }),
    ).rejects.toThrow(/undo-not-allowed/);
  });

  test("refuses to reopen a finished game (FR-49: the Elo cannot be taken back)", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await seedGame(t, {
      mode: "ai",
      whiteId: alice.id,
      blackId: null,
      aiColor: "b",
      difficulty: "beginner",
      sans: ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6"],
    });
    await as(t, alice).mutation(api.games.makeMove, { gameId, from: "h5", to: "f7" });
    expect((await readGame(t, gameId)).status).toBe("checkmate");
    const won = await readPlayer(t, alice.id);

    await expect(
      as(t, alice).mutation(api.games.undo, { gameId, toPly: 6 }),
    ).rejects.toThrow(/game-not-active/);

    // The finished game, its result and the rating it awarded are all untouched.
    const after = await readGame(t, gameId);
    expect(after.status).toBe("checkmate");
    expect(after.winner).toBe("w");
    expect(after.rated).toBe(true);
    const player = await readPlayer(t, alice.id);
    expect(player.ratingAi).toBe(won.ratingAi);
    expect(player.wins).toBe(1);
    const history = await t.run(async (ctx) =>
      ctx.db
        .query("ratingHistory")
        .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
        .take(10),
    );
    expect(history).toHaveLength(1);
  });

  test("a take-back before the end still unrates the game (FR-49)", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await seedGame(t, {
      mode: "ai",
      whiteId: alice.id,
      blackId: null,
      aiColor: "b",
      difficulty: "beginner",
      sans: ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6"],
    });
    await as(t, alice).mutation(api.games.undo, { gameId, toPly: 4 });
    expect((await readGame(t, gameId)).rated).toBe(false);

    // Replay to mate through the real paths. FR-45/FR-48/FR-49: the take-back
    // unrates the game, not the result — no Elo moves and no sparkline point is
    // written, but it is still a win on the record ("Won with 2 take-backs").
    await as(t, alice).mutation(api.games.makeMove, { gameId, from: "f1", to: "c4" });
    await as(t, alice).mutation(api.games.makeAiMove, {
      gameId,
      san: "Nf6",
      expectedPly: 5,
    });
    await as(t, alice).mutation(api.games.makeMove, { gameId, from: "h5", to: "f7" });
    expect((await readGame(t, gameId)).status).toBe("checkmate");
    const player = await readPlayer(t, alice.id);
    expect(player.ratingAi).toBe(1200);
    expect(player.ratingHuman).toBe(1200);
    expect(player.rating).toBe(1200);
    expect(player.wins).toBe(1);
    expect(player.losses).toBe(0);
    expect(player.draws).toBe(0);
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query("ratingHistory")
          .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
          .take(5),
      ),
    ).toHaveLength(0);
  });

  test("a take-back'd loss still counts on the record (FR-45/FR-48)", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    // Fool's mate: the human plays white and gets mated by the AI on ply 4.
    const gameId = await seedGame(t, {
      mode: "ai",
      whiteId: alice.id,
      blackId: null,
      aiColor: "b",
      difficulty: "casual",
      sans: ["f3", "e5", "g4"],
    });
    await as(t, alice).mutation(api.games.undo, { gameId, toPly: 2 });
    expect((await readGame(t, gameId)).rated).toBe(false);

    await as(t, alice).mutation(api.games.makeMove, { gameId, from: "g2", to: "g4" });
    await as(t, alice).mutation(api.games.makeAiMove, {
      gameId,
      san: "Qh4#",
      expectedPly: 3,
    });

    const game = await readGame(t, gameId);
    expect(game.status).toBe("checkmate");
    expect(game.winner).toBe("b");
    const player = await readPlayer(t, alice.id);
    expect(player.losses).toBe(1);
    expect(player.wins).toBe(0);
    expect(player.ratingAi).toBe(1200);
    expect(player.rating).toBe(1200);
  });

  test("rejects an out-of-range ply", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await seedGame(t, {
      mode: "local",
      whiteId: alice.id,
      blackId: null,
      sans: ["e4"],
    });
    await expect(
      as(t, alice).mutation(api.games.undo, { gameId, toPly: 1 }),
    ).rejects.toThrow(/invalid-ply/);
    await expect(
      as(t, alice).mutation(api.games.undo, { gameId, toPly: -1 }),
    ).rejects.toThrow(/invalid-ply/);
  });
});

describe("games.useHint", () => {
  test("allows three hints on beginner then refuses", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await seedGame(t, {
      mode: "ai",
      whiteId: alice.id,
      blackId: null,
      aiColor: "b",
      difficulty: "beginner",
    });

    expect(await as(t, alice).mutation(api.games.useHint, { gameId })).toEqual({
      hintsUsed: 1,
      remaining: 2,
    });
    await as(t, alice).mutation(api.games.useHint, { gameId });
    expect(await as(t, alice).mutation(api.games.useHint, { gameId })).toEqual({
      hintsUsed: 3,
      remaining: 0,
    });
    await expect(
      as(t, alice).mutation(api.games.useHint, { gameId }),
    ).rejects.toThrow(/hint-limit/);
  });

  test("is unavailable above casual and outside AI games", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");

    const hard = await seedGame(t, {
      mode: "ai",
      whiteId: alice.id,
      blackId: null,
      aiColor: "b",
      difficulty: "advanced",
    });
    await expect(as(t, alice).mutation(api.games.useHint, { gameId: hard })).rejects.toThrow(
      /hints-unavailable/,
    );

    const online = await onlineGame(t, alice, bob);
    await expect(
      as(t, alice).mutation(api.games.useHint, { gameId: online }),
    ).rejects.toThrow(/hints-unavailable/);
  });
});

describe("local games", () => {
  test("the owner may move both colours and the game is never rated", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await as(t, alice).mutation(api.games.createLocalGame, {
      playerTwoName: "   Sam   ",
    });

    const game0 = await readGame(t, gameId);
    expect(game0.rated).toBe(false);
    expect(game0.localPlayerTwoName).toBe("Sam");

    await as(t, alice).mutation(api.games.makeMove, { gameId, from: "e2", to: "e4" });
    await as(t, alice).mutation(api.games.makeMove, { gameId, from: "e7", to: "e5" });
    expect((await readGame(t, gameId)).moves).toEqual(["e4", "e5"]);

    const view = await as(t, alice).query(api.games.get, { gameId });
    expect(view?.viewerRole).toBe("local");
    expect(view?.blackName).toBe("Sam");
  });

  test("defaults the second player's name and caps its length", async () => {
    const t = makeTest();
    // One game per player: FR-26 now refuses a second active game (see below).
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const blank = await as(t, alice).mutation(api.games.createLocalGame, {});
    expect((await readGame(t, blank)).localPlayerTwoName).toBe("Player 2");

    const long = await as(t, bob).mutation(api.games.createLocalGame, {
      playerTwoName: "x".repeat(80),
    });
    expect((await readGame(t, long)).localPlayerTwoName).toHaveLength(24);
  });
});

describe("FR-26: one active game per player", () => {
  test("createAiGame refuses a second game and leaves the queue first", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    await as(t, alice).mutation(api.queue.join, {});

    const gameId = await as(t, alice).mutation(api.games.createAiGame, {
      difficulty: "casual",
      playerColor: "w",
    });

    // Starting a game dequeues, so `queue.pair` can never seat this player into a
    // second, rated online game they would silently forfeit.
    expect(await as(t, alice).query(api.queue.myStatus, {})).toEqual({
      inQueue: false,
      joinedAt: null,
    });
    const queued = await t.run(async (ctx) => ctx.db.query("queue").take(5));
    expect(queued).toHaveLength(0);

    await expect(
      as(t, alice).mutation(api.games.createAiGame, {
        difficulty: "casual",
        playerColor: "w",
      }),
    ).rejects.toThrow(/already-in-game/);
    await expect(
      as(t, alice).mutation(api.games.createLocalGame, {}),
    ).rejects.toThrow(/already-in-game/);

    // Finishing the game frees the player again.
    await as(t, alice).mutation(api.games.resign, { gameId });
    await as(t, alice).mutation(api.games.createLocalGame, {});
  });

  test("createLocalGame refuses a second game while an AI game is running", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    await as(t, alice).mutation(api.games.createLocalGame, {});
    await expect(
      as(t, alice).mutation(api.games.createAiGame, {
        difficulty: "beginner",
        playerColor: "b",
      }),
    ).rejects.toThrow(/already-in-game/);
  });
});

describe("games.createAiGame and views", () => {
  test("seats the human and gives the AI the other colour", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const gameId = await as(t, alice).mutation(api.games.createAiGame, {
      difficulty: "grandmaster",
      playerColor: "b",
    });
    const game = await readGame(t, gameId);
    expect(game.whiteId).toBeNull();
    expect(game.blackId).toBe(alice.id);
    expect(game.aiColor).toBe("w");
    expect(game.rated).toBe(true);

    const view = await as(t, alice).query(api.games.get, { gameId });
    expect(view?.viewerRole).toBe("black");
    expect(view?.whiteName).toBe("Kasparova");
    expect(view?.blackName).toBe("alice");
    expect(view?.white).toBeNull();
  });

  test("a third party sees the game as a spectator", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const mallory = await signUp(t, "mallory");
    const gameId = await onlineGame(t, alice, bob);

    const view = await as(t, mallory).query(api.games.get, { gameId });
    expect(view?.viewerRole).toBe("spectator");
    expect(view?.white?.username).toBe("alice");
    expect(view?.white).not.toHaveProperty("clerkId");
  });

  test("listLive only surfaces online games and myActiveGame finds the caller's", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const mallory = await signUp(t, "mallory");
    const online = await onlineGame(t, alice, bob);
    // An active AI game must never appear in the spectate list.
    await seedGame(t, {
      mode: "ai",
      whiteId: mallory.id,
      blackId: null,
      aiColor: "b",
      difficulty: "casual",
    });

    const live = await t.query(api.games.listLive, { limit: 10 });
    expect(live).toHaveLength(1);
    expect(live[0]._id).toBe(online);
    expect(live[0].whiteName).toBe("alice");

    expect(await as(t, alice).query(api.games.myActiveGame, {})).toBe(online);
    expect(await as(t, bob).query(api.games.myActiveGame, {})).toBe(online);
  });

  test("a wall of active AI games cannot crowd online games out of listLive", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const mallory = await signUp(t, "mallory");
    const online = await onlineGame(t, alice, bob);
    // `lastMoveAt` is bumped by every mode, so these all sort ABOVE the online
    // game; before the mode-scoped index they filled the whole scan window.
    for (let i = 0; i < 60; i++) {
      await seedGame(t, {
        mode: "ai",
        whiteId: mallory.id,
        blackId: null,
        aiColor: "b",
        difficulty: "casual",
      });
    }
    await seedGame(t, { mode: "local", whiteId: mallory.id, blackId: null });

    const live = await t.query(api.games.listLive, { limit: 10 });
    expect(live).toHaveLength(1);
    expect(live[0]._id).toBe(online);
  });

  test("myRecentGames summarises both colours with the opponent resolved", async () => {
    const t = makeTest();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    await seedGame(t, { mode: "online", whiteId: alice.id, blackId: bob.id });
    await seedGame(t, { mode: "online", whiteId: bob.id, blackId: alice.id });

    const rows = await as(t, alice).query(api.games.myRecentGames, { limit: 10 });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.opponentName === "bob")).toBe(true);
    expect(rows.map((row) => row.myColour).sort()).toEqual(["b", "w"]);

    const byName = await t.query(api.games.gamesForProfile, {
      username: "BOB",
      limit: 10,
    });
    expect(byName).toHaveLength(2);
  });
});
