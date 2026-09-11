import { createThread, listMessages, saveMessage } from "@convex-dev/agent";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requirePlayer } from "./lib/auth";
import { requireParticipant } from "./lib/games";

// This component stores human messages only. No model or paid AI call is involved.
const MAX_LENGTH = 1_000;
const PAGE_SIZE = 200;

export const forGame = query({
  args: { gameId: v.id("games") },
  returns: v.array(v.object({
    id: v.string(), text: v.string(), mine: v.boolean(), createdAt: v.number(), sequence: v.number(),
  })),
  handler: async (ctx, { gameId }) => {
    const player = await requirePlayer(ctx);
    const game = await ctx.db.get("games", gameId);
    if (!game) throw new Error("game-not-found");
    requireParticipant(game, player._id);
    if (game.mode !== "online") throw new Error("online-chat-only");
    if (!game.playerChatThreadId) return [];
    const result = await listMessages(ctx, components.agent, {
      threadId: game.playerChatThreadId,
      paginationOpts: { numItems: PAGE_SIZE, cursor: null },
    });
    return result.page.reverse().map((message) => ({
      id: message._id,
      text: message.text ?? "",
      mine: message.userId === player._id,
      createdAt: message._creationTime,
      sequence: message.order,
    }));
  },
});

export const send = mutation({
  args: { gameId: v.id("games"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, { gameId, text: raw }) => {
    const player = await requirePlayer(ctx);
    const game = await ctx.db.get("games", gameId);
    if (!game) throw new Error("game-not-found");
    requireParticipant(game, player._id);
    if (game.mode !== "online") throw new Error("online-chat-only");
    const text = raw.trim();
    if (!text || text.length > MAX_LENGTH) throw new Error("invalid-message-length");

    // Created atomically with the first message: concurrent first sends share
    // the same thread after Convex retries the conflicting transaction.
    let threadId = game.playerChatThreadId;
    if (!threadId) {
      threadId = await createThread(ctx, components.agent);
      await ctx.db.patch("games", gameId, { playerChatThreadId: threadId });
    }
    await saveMessage(ctx, components.agent, {
      threadId,
      userId: player._id,
      message: { role: "user", content: text },
    });
    return null;
  },
});
