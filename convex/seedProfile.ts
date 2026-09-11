import { Chess } from "chess.js";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { AI_DISPLAY_NAME } from "./lib/constants";
import { finalizeGame } from "./lib/games";

const EVENT = "Castle demo profile wins - 2026-09-11";
const TARGET = 50;

/** Admin-only, development-only fixture. Repeat calls insert only missing wins. */
export const seedWins = internalMutation({
  args: { playerId: v.id("players") },
  returns: v.object({ added: v.number(), wins: v.number(), losses: v.number(), draws: v.number(), rating: v.number() }),
  handler: async (ctx, { playerId }) => {
    if (process.env.CONVEX_CLOUD_URL !== "https://tangible-dogfish-529.convex.cloud") {
      throw new Error("This fixture is restricted to the Castle development deployment.");
    }
    const player = await ctx.db.get("players", playerId);
    if (!player || player.usernameLower !== "sonnysangha") throw new Error("Unexpected demo profile.");
    const previous = await ctx.db.query("games")
      .withIndex("by_whiteId_and_createdAt", q => q.eq("whiteId", playerId)).take(2001);
    if (previous.length > 2000) throw new Error("Profile is too large for this bounded fixture.");
    const seeded = new Set(previous.filter(g => g.pgn.includes(`[Event "${EVENT}"]`)).map(g => g.pgn.match(/\[Round "(\d+)"\]/)?.[1]));
    let added = 0;
    const now = Date.now();
    for (let i = 0; i < TARGET; i++) {
      if (seeded.has(String(i + 1))) continue;
      const difficulty = (["casual", "intermediate", "advanced"] as const)[i % 3];
      const chess = new Chess();
      for (const [key, value] of Object.entries({ Event: EVENT, Round: String(i + 1), White: player.username, Black: AI_DISPLAY_NAME[difficulty], Result: "1-0" })) {
        chess.setHeader(key, value);
      }
      const line = i % 2 === 0
        ? ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]
        : ["e4", "e5", "Nf3", "d6", "Bc4", "Bg4", "Nc3", "g6", "Nxe5", "Bxd1", "Bxf7+", "Ke7", "Nd5#"];
      for (const san of line) chess.move(san);
      if (!chess.isCheckmate() || chess.turn() !== "b") throw new Error("Invalid winning fixture.");
      const endedAt = now - TARGET + i;
      const gameId = await ctx.db.insert("games", {
        whiteId: playerId, blackId: null, mode: "ai", difficulty, aiColor: "b",
        fen: chess.fen(), moves: chess.history(), pgn: chess.pgn(), turn: chess.turn(),
        status: "active", rated: true, undoCount: 0, hintsUsed: 0,
        createdAt: endedAt - 10 * 60 * 1000, lastMoveAt: endedAt,
      });
      const game = await ctx.db.get("games", gameId);
      if (!game) throw new Error("Missing fixture game.");
      await finalizeGame(ctx, game, { status: "checkmate", winner: "w", endReason: "checkmate" }, { now: endedAt });
      added++;
    }
    const result = await ctx.db.get("players", playerId);
    if (!result) throw new Error("Missing profile.");
    return { added, wins: result.wins, losses: result.losses, draws: result.draws, rating: result.rating };
  },
});
