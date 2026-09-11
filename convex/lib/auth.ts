// convex/lib/auth.ts
//
// Identity always comes from `ctx.auth.getUserIdentity()` — never from a function
// argument (FR-5, Convex auth guidelines). `tokenIdentifier` ("<issuer>|<subject>")
// is the canonical key; `by_tokenIdentifier` is the only index auth paths use.
import type { UserIdentity } from "convex/server";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type AnyCtx = QueryCtx | MutationCtx;

/** Throws when the caller is not signed in. */
export async function requireIdentity(ctx: AnyCtx): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new Error("Not authenticated");
  return identity;
}

/** The `players` row for an identity, or null when `ensurePlayer` has not run yet. */
export async function playerForIdentity(
  ctx: AnyCtx,
  identity: UserIdentity,
): Promise<Doc<"players"> | null> {
  return await ctx.db
    .query("players")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
}

/** Signed in AND provisioned. The default gate for every mutation. */
export async function requirePlayer(ctx: AnyCtx): Promise<Doc<"players">> {
  const identity = await requireIdentity(ctx);
  const player = await playerForIdentity(ctx, identity);
  if (player === null) throw new Error("Player not provisioned");
  return player;
}

/** `null` instead of a throw — for queries that render outside `<Authenticated>`. */
export async function optionalPlayer(ctx: AnyCtx): Promise<Doc<"players"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  return await playerForIdentity(ctx, identity);
}
