// src/app/api/ai/_lib/game-guard.ts
//
// Auth + ownership gate shared by /api/ai/move and /api/ai/hint (§F.6, §G).
//
// Defence in depth: the proxy matcher covers /api/*, but Server Functions and
// matcher edge cases mean every handler re-checks `auth()` itself, and the game
// document is re-read server-side so the CLIENT NEVER SUPPLIES the position, the
// difficulty or the session id — only the engine candidates, which are re-validated
// against the server's FEN before they reach the model.
import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { getAuthToken } from "@/lib/convex-server";
import type { ViewerRole } from "@/lib/types";

export interface GuardFailure {
  ok: false;
  status: number;
  error: string;
}

export interface GuardSuccess {
  ok: true;
  userId: string;
  game: Doc<"games">;
  viewerRole: ViewerRole;
  /** Stable, non-reversible marker for the agent's `x-chess-user` header. */
  userKey: string;
}

export type GuardResult = GuardSuccess | GuardFailure;

/**
 * Resolve the caller and the game, and prove the caller is a human participant of
 * an active vs-AI game. Everything downstream reads `result.game`, never the body.
 */
export async function guardAiGame(rawGameId: string): Promise<GuardResult> {
  const { userId } = await auth();
  if (userId === null) return { ok: false, status: 401, error: "unauthorized" };

  let view: Awaited<ReturnType<typeof fetchQuery<typeof api.games.get>>>;
  try {
    const token = await getAuthToken();
    view = await fetchQuery(api.games.get, { gameId: rawGameId as Id<"games"> }, { token });
  } catch {
    // A malformed id fails Convex ARGUMENT validation; an expired token fails auth.
    return { ok: false, status: 400, error: "invalid-game" };
  }

  if (view === null) return { ok: false, status: 404, error: "game-not-found" };
  const game = view.game;
  if (game.mode !== "ai") return { ok: false, status: 400, error: "not-an-ai-game" };
  if (game.status !== "active") return { ok: false, status: 409, error: "game-not-active" };
  if (view.viewerRole !== "white" && view.viewerRole !== "black") {
    return { ok: false, status: 403, error: "not-a-participant" };
  }

  return { ok: true, userId, game, viewerRole: view.viewerRole, userKey: hashUserId(userId) };
}

/** FNV-1a — enough to correlate turns in agent traces without carrying a Clerk id. */
function hashUserId(userId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `u_${hash.toString(36)}`;
}

export function jsonError(failure: GuardFailure): Response {
  return Response.json({ error: failure.error }, { status: failure.status });
}
