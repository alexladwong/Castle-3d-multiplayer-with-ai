import agentTest from "@convex-dev/agent/test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { as, makeTest, seedGame, signUp } from "./harness.setup";

async function setup() {
  const t = makeTest();
  agentTest.register(t);
  const white = await signUp(t, "white");
  const black = await signUp(t, "black");
  const stranger = await signUp(t, "stranger");
  const gameId = await seedGame(t, { mode: "online", whiteId: white.id, blackId: black.id });
  return { t, white, black, stranger, gameId };
}

describe("live player chat", () => {
  test("both players read the shared ordered conversation with server-derived authorship", async () => {
    const { t, white, black, gameId } = await setup();
    expect(await as(t, white).query(api.playerChat.forGame, { gameId })).toEqual([]);
    await as(t, white).mutation(api.playerChat.send, { gameId, text: "  Good luck!  " });
    await as(t, black).mutation(api.playerChat.send, { gameId, text: "You too!" });
    const whiteView = await as(t, white).query(api.playerChat.forGame, { gameId });
    const blackView = await as(t, black).query(api.playerChat.forGame, { gameId });
    expect(whiteView.map(({ text, mine }) => ({ text, mine }))).toEqual([
      { text: "Good luck!", mine: true }, { text: "You too!", mine: false },
    ]);
    expect(blackView.map(({ mine }) => mine)).toEqual([false, true]);
    expect(whiteView.map(({ id }) => id)).toEqual(blackView.map(({ id }) => id));
  });
  test("rejects unauthenticated callers and players outside the game for both reads and writes", async () => {
    const { t, stranger, gameId } = await setup();
    await expect(t.query(api.playerChat.forGame, { gameId })).rejects.toThrow("Not authenticated");
    await expect(t.mutation(api.playerChat.send, { gameId, text: "Hello" })).rejects.toThrow("Not authenticated");
    await expect(as(t, stranger).query(api.playerChat.forGame, { gameId })).rejects.toThrow("not-a-participant");
    await expect(as(t, stranger).mutation(api.playerChat.send, { gameId, text: "Hello" })).rejects.toThrow("not-a-participant");
  });
  test("isolates games even when the same player is in both", async () => {
    const { t, white, black, stranger, gameId } = await setup();
    const second = await seedGame(t, { whiteId: white.id, blackId: stranger.id });
    await as(t, black).mutation(api.playerChat.send, { gameId, text: "Private to this game" });
    expect(await as(t, white).query(api.playerChat.forGame, { gameId: second })).toEqual([]);
    await expect(as(t, black).query(api.playerChat.forGame, { gameId: second })).rejects.toThrow("not-a-participant");
  });
  test("rejects blank and oversized messages and non-online games", async () => {
    const { t, white, gameId } = await setup();
    for (const text of ["   ", "x".repeat(1001)]) {
      await expect(as(t, white).mutation(api.playerChat.send, { gameId, text })).rejects.toThrow("invalid-message-length");
    }
    const local = await seedGame(t, { mode: "local", whiteId: white.id });
    await expect(as(t, white).mutation(api.playerChat.send, { gameId: local, text: "Hi" })).rejects.toThrow("online-chat-only");
    await expect(as(t, white).query(api.playerChat.forGame, { gameId: local })).rejects.toThrow("online-chat-only");
  });
  test("allows a postgame good game without changing moves or game status", async () => {
    const { t, white, gameId } = await setup();
    await t.run(async (ctx) => { await ctx.db.patch("games", gameId, { status: "resigned", winner: "b" }); });
    await as(t, white).mutation(api.playerChat.send, { gameId, text: "Good game" });
    expect(await as(t, white).query(api.playerChat.forGame, { gameId })).toHaveLength(1);
    const game = await t.run(async (ctx) => ctx.db.get("games", gameId));
    expect(game).toMatchObject({ status: "resigned", moves: [] });
  });
});
