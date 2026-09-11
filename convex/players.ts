// convex/players.ts — FR-1…FR-5, FR-15, FR-21e/j/k/l, FR-31
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  optionalPlayer,
  playerForIdentity,
  requireIdentity,
  requirePlayer,
} from "./lib/auth";
import { MAX_ROOM_IMAGE_BYTES } from "./lib/constants";
import { START_RATING } from "./lib/elo";
import { vMe, vPlayerProfile } from "./lib/returns";
import {
  vBoardView,
  vQualityTier,
  vRoomColors,
  vRoomPreset,
} from "./lib/validators";

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

/**
 * `usernameLower` has to be collision-free: three public queries resolve a profile
 * through `by_usernameLower`, and two rows sharing a name would make all of them
 * throw. Clerk only guarantees uniqueness for the username claim — `name` (the
 * display name we fall back to) is not unique, so the candidate is checked here
 * and disambiguated with the Clerk subject before it is written.
 */
async function freeUsername(
  ctx: MutationCtx,
  candidate: string,
  identity: { subject: string; tokenIdentifier: string },
): Promise<string> {
  const suffix = identity.subject.slice(-6);
  const options = [candidate, `${candidate}-${suffix}`, `player${suffix}`];

  for (const option of options) {
    const taken: Doc<"players"> | null = await ctx.db
      .query("players")
      .withIndex("by_usernameLower", (q) => q.eq("usernameLower", option.toLowerCase()))
      .first();
    if (taken === null || taken.tokenIdentifier === identity.tokenIdentifier) {
      return option;
    }
  }
  return options[options.length - 1];
}

function assertHexColours(colors: {
  background: string;
  lightSquare: string;
  darkSquare: string;
}): void {
  for (const value of [colors.background, colors.lightSquare, colors.darkSquare]) {
    if (!HEX_COLOUR.test(value)) throw new Error("invalid-colour");
  }
}

/**
 * Upsert the caller's row from their Clerk identity (FR-3). Idempotent — the
 * client calls it once per session. No client-supplied user id is ever accepted
 * (FR-5): everything comes from `ctx.auth.getUserIdentity()`.
 */
export const ensurePlayer = mutation({
  args: {},
  returns: v.id("players"),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const now = Date.now();

    // `nickname` is the Clerk username on this instance; the other claims are
    // usually null (clerk-setup.md §0, ARCHITECTURE §I-13).
    const candidate =
      identity.nickname ??
      identity.preferredUsername ??
      identity.name ??
      `player${identity.subject.slice(-6)}`;
    const username = await freeUsername(ctx, candidate, identity);
    const avatarUrl = identity.pictureUrl ?? "";

    const existing = await playerForIdentity(ctx, identity);
    if (existing !== null) {
      const changed =
        existing.username !== username || existing.avatarUrl !== avatarUrl;
      if (changed) {
        await ctx.db.patch("players", existing._id, {
          username,
          usernameLower: username.toLowerCase(),
          avatarUrl,
          updatedAt: now,
        });
      }
      return existing._id;
    }

    return await ctx.db.insert("players", {
      clerkId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      username,
      usernameLower: username.toLowerCase(),
      avatarUrl,
      rating: START_RATING,
      ratingHuman: START_RATING,
      ratingAi: START_RATING,
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
  },
});

/** The caller's own row. Returns null when unauthenticated so it is safe to
 *  render outside `<Authenticated>`. */
export const me = query({
  args: {},
  returns: v.union(vMe, v.null()),
  handler: async (ctx) => {
    const player = await optionalPlayer(ctx);
    if (player === null) return null;
    const roomImageUrl =
      player.roomImageStorageId === undefined
        ? null
        : await ctx.storage.getUrl(player.roomImageStorageId);
    return { ...player, roomImageUrl };
  },
});

/** Public profile projection — never leaks settings or `clerkId` (FR-53). */
export const getByUsername = query({
  args: { username: v.string() },
  returns: v.union(vPlayerProfile, v.null()),
  handler: async (ctx, args) => {
    // `.first()`, not `.unique()`: `ensurePlayer` keeps `usernameLower` unique, but
    // a legacy duplicate must degrade to one profile, never to a 500 for both.
    const player = await ctx.db
      .query("players")
      .withIndex("by_usernameLower", (q) =>
        q.eq("usernameLower", args.username.toLowerCase()),
      )
      .first();
    if (player === null) return null;
    return {
      _id: player._id,
      username: player.username,
      avatarUrl: player.avatarUrl,
      rating: player.rating,
      ratingHuman: player.ratingHuman,
      ratingAi: player.ratingAi,
      wins: player.wins,
      losses: player.losses,
      draws: player.draws,
      createdAt: player.createdAt,
    };
  },
});

/** Patch only the supplied keys. `roomColors: null` clears them. */
export const updateSettings = mutation({
  args: {
    boardView: v.optional(vBoardView),
    roomPreset: v.optional(vRoomPreset),
    roomColors: v.optional(v.union(vRoomColors, v.null())),
    boardFlipEnabled: v.optional(v.boolean()),
    qualityTier: v.optional(vQualityTier),
    postFxEnabled: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx);
    const patch: {
      boardView?: "2d" | "3d";
      roomPreset?: "study" | "space" | "park" | "arcade" | "minimal" | "custom";
      roomColors?: { background: string; lightSquare: string; darkSquare: string };
      boardFlipEnabled?: boolean;
      qualityTier?: "auto" | "low" | "medium" | "high";
      postFxEnabled?: boolean;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (args.boardView !== undefined) patch.boardView = args.boardView;
    if (args.roomPreset !== undefined) patch.roomPreset = args.roomPreset;
    if (args.boardFlipEnabled !== undefined) {
      patch.boardFlipEnabled = args.boardFlipEnabled;
    }
    if (args.qualityTier !== undefined) patch.qualityTier = args.qualityTier;
    if (args.postFxEnabled !== undefined) patch.postFxEnabled = args.postFxEnabled;
    if (args.roomColors !== undefined) {
      if (args.roomColors === null) {
        // `undefined` in a patch removes the field.
        patch.roomColors = undefined;
      } else {
        assertHexColours(args.roomColors);
        patch.roomColors = args.roomColors;
      }
    }

    await ctx.db.patch("players", player._id, patch);
    return null;
  },
});

/** FR-21k. The returned URL expires in one hour. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requirePlayer(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** FR-21k. Enforces the 5 MB / `image/*` limits from the `_storage` metadata. */
export const setRoomImage = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx);
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (metadata === null) throw new Error("upload-not-found");

    const contentType = metadata.contentType ?? "";
    if (metadata.size > MAX_ROOM_IMAGE_BYTES || !contentType.startsWith("image/")) {
      await ctx.storage.delete(args.storageId);
      throw new Error("invalid-room-image");
    }

    if (
      player.roomImageStorageId !== undefined &&
      player.roomImageStorageId !== args.storageId
    ) {
      await ctx.storage.delete(player.roomImageStorageId);
    }

    await ctx.db.patch("players", player._id, {
      roomImageStorageId: args.storageId,
      roomPreset: "custom",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const clearRoomImage = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const player = await requirePlayer(ctx);
    if (player.roomImageStorageId === undefined) return null;
    await ctx.storage.delete(player.roomImageStorageId);
    await ctx.db.patch("players", player._id, {
      roomImageStorageId: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});
