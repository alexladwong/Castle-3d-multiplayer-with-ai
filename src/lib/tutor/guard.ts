// src/lib/tutor/guard.ts
// Everything the tutor route decides BEFORE it talks to a model (docs/PRO_TUTOR.md §5.1-§5.3).
//
// It lives outside `route.ts` for one reason: it is the security surface, and a
// security surface that cannot be unit-tested is a security surface nobody checks.
// `src/lib/tutor/__tests__/guard.test.ts` drives every branch with `auth` and the
// Convex calls mocked.
//
// Order matters and is the order of the contract:
//   1. signed in                      → 401 unauthorized
//   2. Pro (Clerk feature "tutor")    → 402 pro-required
//   3. body shape                     → 400 invalid-body
//   4. the game, read with the CALLER's token (players and spectators alike)
//                                     → 404 game-not-found
//   5. the ply, and the FEN derived from the stored move list
//                                     → 400 invalid-ply / 409 position-unavailable
//   6. a gateway credential exists    → 503 tutor-unavailable   (before we charge)
//   7. the per-game quota, charged    → 429 quota
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { TUTOR_FEATURE } from "@/lib/constants";
import { getAuthToken } from "@/lib/convex-server";
import type { GameView } from "@/lib/types";
import { fenAtPly } from "./system";
import type { LanguageModel } from "ai";
import { describeGatewayCredential, resolveGatewayModel } from "./model";

/**
 * The body the panel posts. `messages` is checked only for shape here — the route
 * validates it properly with `safeValidateUIMessages` once the tools exist, because
 * that is the check that knows what a tool part may contain.
 */
/**
 * The whole request, in bytes. Generous for a real conversation — 80 turns of an
 * answer under 120 words is well under 100 kB — and a hard stop on anything else.
 */
export const MAX_TUTOR_BODY_BYTES = 200_000;

export const tutorBodySchema = z.object({
  gameId: z.string().min(1).max(128),
  ply: z.number().int().min(0).max(1024),
  messages: z.array(z.unknown()).min(1).max(80),
});

export type TutorBody = z.infer<typeof tutorBodySchema>;

export interface TutorGuardOk {
  ok: true;
  /** The gateway model with its credential already attached. */
  model: LanguageModel;
  view: GameView;
  /** FEN at the ply in view, replayed server-side from `game.moves`. */
  fen: string;
  ply: number;
  messages: unknown[];
  /** Turns this game has now spent, after the charge. */
  tutorTurnsUsed: number;
  remaining: number;
}

export interface TutorGuardFailure {
  ok: false;
  status: number;
  error: string;
}

export type TutorGuardResult = TutorGuardOk | TutorGuardFailure;

/** Every failure the panel can be shown, in one place, so the copy has one source. */
function fail(status: number, error: string): TutorGuardFailure {
  return { ok: false, status, error };
}

/** A `Response` for a guard failure. `no-store`: none of these may be cached. */
export function tutorErrorResponse(failure: TutorGuardFailure): Response {
  return Response.json(
    { error: failure.error },
    { status: failure.status, headers: { "cache-control": "no-store" } },
  );
}

export async function guardTutorRequest(request: Request): Promise<TutorGuardResult> {
  // 1 + 2. Auth before the body is even read, so an unauthenticated caller can never
  // learn the difference between "not signed in" and "that body is malformed".
  const { userId, has } = await auth();
  if (userId === null) return fail(401, "unauthorized");
  if (!has({ feature: TUTOR_FEATURE })) return fail(402, "pro-required");

  // 3. The schema bounds the NUMBER of messages (80) but each element is
  // `z.unknown()`, and neither `safeValidateUIMessages` nor `convertToModelMessages`
  // caps text length — so 80 megabyte-scale parts would all be forwarded to the
  // gateway for one quota turn. The counter caps how many model calls a game may
  // make, not what each one costs; this caps the cost. Read as text once, so the
  // ceiling is on bytes rather than on whatever the parsed shape happens to be.
  let body: TutorBody;
  try {
    const raw = await request.text();
    if (raw.length > MAX_TUTOR_BODY_BYTES) return fail(413, "invalid-body");
    body = tutorBodySchema.parse(JSON.parse(raw));
  } catch {
    return fail(400, "invalid-body");
  }

  // 4. The caller's own token: Convex re-derives identity, and a signed-in member may
  // read any game they can open — a player, or a spectator watching it.
  const token = await getAuthToken();
  let view: GameView | null;
  try {
    view = await fetchQuery(
      api.games.get,
      { gameId: body.gameId as Id<"games"> },
      { token },
    );
  } catch {
    // A malformed id throws inside Convex rather than returning null. Both mean the
    // same thing to the caller, and neither reveals whether the game exists.
    return fail(404, "game-not-found");
  }
  if (view === null) return fail(404, "game-not-found");

  // 5. The client never sends a FEN (NFR-4): the position is replayed here.
  if (body.ply > view.game.moves.length) return fail(400, "invalid-ply");
  const fen = fenAtPly(view.game.moves, body.ply);
  if (fen === null) return fail(409, "position-unavailable");

  // 6. No credential means no answer is possible; say so before spending a turn.
  // The credential is resolved from this request (Vercel's OIDC header), the runtime
  // context or the environment, and the model carries it explicitly (see model.ts).
  const model = resolveGatewayModel(request.headers);
  if (model === null) {
    console.warn("[tutor] no gateway credential", describeGatewayCredential(request.headers));
    return fail(503, "tutor-unavailable");
  }

  // 7. Charged BEFORE the model call, with the caller's token, exactly like
  // `useHint` in /api/ai/hint: a turn that then fails still costs one, and a direct
  // POST that skips the panel is capped like any other caller.
  let charge: { tutorTurnsUsed: number; remaining: number };
  try {
    charge = await fetchMutation(
      api.games.useTutorTurn,
      { gameId: view.game._id },
      { token },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("tutor-limit")) return fail(429, "quota");
    if (message.includes("game-not-found")) return fail(404, "game-not-found");
    // Anything else is the backend, not the member: say so in the logs. On
    // 2026-09-11 this branch hid a production Convex deployment that did not have
    // `useTutorTurn` yet behind the same "tutor-unavailable" the credential check uses.
    console.error("[tutor] quota charge failed", message || String(error));
    return fail(503, "tutor-unavailable");
  }

  return {
    ok: true,
    model,
    view,
    fen,
    ply: body.ply,
    messages: body.messages,
    tutorTurnsUsed: charge.tutorTurnsUsed,
    remaining: charge.remaining,
  };
}
