// src/lib/tutor/model.ts
// The tutor's model id and the gateway credential check (docs/PRO_TUTOR.md §5.6).
//
// Model strings that look like "<provider>/<model>" are routed by the AI SDK through
// the Vercel AI Gateway — the same path `agent/agent.ts:8-12` and
// `src/app/api/ai/_lib/eve-agent.ts:23` already use. There is no provider package to
// import and no client to construct; the credential is read from the environment.
//
// ---------------------------------------------------------------- catalogue evidence
// Read live on 2026-09-11 from the public catalogue:
//   curl -s https://ai-gateway.vercel.sh/v1/models   →  200, 371 models.
// The Anthropic ids it listed, in full:
//   claude-3-haiku, claude-fable-5, claude-fable-5.1, claude-haiku-4.5,
//   claude-opus-4, claude-opus-4.5, claude-opus-4.6, claude-opus-4.7,
//   claude-opus-4.8, claude-opus-4.8-fast, claude-opus-5, claude-opus-5-fast,
//   claude-sonnet-4, claude-sonnet-4.5, claude-sonnet-4.6, claude-sonnet-5
// Newest Sonnet-class: `anthropic/claude-sonnet-5` ("Claude Sonnet 5", released
// 2026-06-29, 1 M context, 128 k max output, tags include `tool-use` and
// `reasoning` — the tutor's loop needs tool-use, and nothing else here is optional).
// Sonnet rather than Haiku because the tutor reads an engine's lines and explains a
// position in prose; the opponent's move choice (Haiku 4.5) is a different job with
// a 3 s budget, and it keeps its own id.
import { createGateway, type LanguageModel } from "ai";
import { getContext } from "@vercel/oidc";
export const TUTOR_MODEL_ID = "anthropic/claude-sonnet-5";

/**
 * Fallback if the catalogue is ever unreadable: the id the opponent already uses.
 * Nothing reads this today — it is here so the next person can see what the fallback
 * was meant to be without re-reading the brief.
 */
export const TUTOR_FALLBACK_MODEL_ID = "anthropic/claude-haiku-4.5";

/**
 * The gateway's two credentials, in the order the AI SDK resolves them: an explicit
 * API key, or the Vercel OIDC token that `vercel env pull` writes into `.env.local`
 * and that Vercel injects in production.
 *
 * Checked BEFORE the quota is charged, so a deployment with no credential answers
 * 503 `tutor-unavailable` instead of spending one of the game's 40 turns on a
 * request that could never reach a model.
 *
 * An OIDC token that has EXPIRED counts as no credential. It is worth the few lines:
 * `vercel env pull` writes a token that lasts hours, so a `.env.local` left over from
 * yesterday is the ordinary case, and the gateway's answer to it ("authentication
 * failed") would otherwise arrive halfway through a stream — the member would see
 * "the tutor did not answer" and retry forever, having been charged each time.
 */
export function gatewayCredentialPresent(requestHeaders?: Headers): boolean {
  if (hasValue(process.env.AI_GATEWAY_API_KEY)) return true;
  const oidc = resolveOidcToken(requestHeaders);
  return hasValue(oidc) && !isExpiredJwt(oidc);
}

/** Where the credential was (not) found; booleans only, safe to log. */
export function describeGatewayCredential(requestHeaders?: Headers): Record<string, boolean> {
  const ctx = getContext();
  return {
    apiKey: hasValue(process.env.AI_GATEWAY_API_KEY),
    requestHeader: hasValue(requestHeaders?.get(OIDC_HEADER) ?? undefined),
    contextHeaders: ctx.headers !== undefined,
    contextHeader: hasValue(ctx.headers?.[OIDC_HEADER]),
    env: hasValue(process.env.VERCEL_OIDC_TOKEN),
  };
}

const OIDC_HEADER = "x-vercel-oidc-token";

/**
 * The token as `@vercel/oidc` (and therefore the AI SDK's gateway provider) resolves
 * it — the per-request `x-vercel-oidc-token` header on Vercel, else the local
 * `VERCEL_OIDC_TOKEN` that `vercel env pull` wrote — plus the incoming request's own
 * header, which is where Vercel puts the token before any runtime context exists.
 * Reading only the environment variable answered 503 in production while the
 * opponent's agent, on the same credential, was answering fine.
 */
export function resolveOidcToken(requestHeaders?: Headers): string | undefined {
  // Trusted sources first: the runtime context and the environment cannot be set by
  // a caller. The inbound header is the last resort, and only when it is shaped like
  // a token Vercel minted. A caller who forges one changes nothing for anyone else —
  // the route has already required Clerk auth and the Pro feature, the token is only
  // ever presented to the AI Gateway as a bearer, and a bad one fails there for that
  // caller's own request — but it should never outrank the platform's own copy.
  const fromContext = getContext().headers?.[OIDC_HEADER];
  if (hasValue(fromContext)) return fromContext;
  if (hasValue(process.env.VERCEL_OIDC_TOKEN)) return process.env.VERCEL_OIDC_TOKEN;
  const fromRequest = requestHeaders?.get(OIDC_HEADER) ?? undefined;
  return hasValue(fromRequest) && isVercelOidcIssued(fromRequest) ? fromRequest : undefined;
}

/** Vercel's OIDC issuer for every team is `https://oidc.vercel.com/<team-slug>`. */
export function isVercelOidcIssued(token: string): boolean {
  const payload = token.split(".")[1];
  if (payload === undefined) return false;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof claims !== "object" || claims === null) return false;
    const iss = (claims as { iss?: unknown }).iss;
    return typeof iss === "string" && iss.startsWith("https://oidc.vercel.com/");
  } catch {
    return false;
  }
}

function hasValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * True only when the token is a readable JWT whose `exp` has passed. An opaque or
 * unparseable credential is given the benefit of the doubt — refusing to call the
 * gateway because we could not read a token we do not own would be worse than
 * letting the gateway answer for itself.
 */
export function isExpiredJwt(token: string, now: number = Date.now()): boolean {
  const payload = token.split(".")[1];
  if (payload === undefined) return false;
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const claims: unknown = JSON.parse(json);
    if (typeof claims !== "object" || claims === null) return false;
    const exp = (claims as { exp?: unknown }).exp;
    return typeof exp === "number" && exp * 1000 <= now;
  } catch {
    return false;
  }
}

/**
 * The model the route streams from, with the credential resolved HERE rather than
 * left to the provider. With `AI_GATEWAY_API_KEY` the plain id string is enough (the
 * SDK reads the key). On the OIDC path the provider would call `getVercelOidcToken()`,
 * which reads the runtime request context — empty in this deployment's route
 * handlers even though the token rides in on the request itself — so the token found
 * by `resolveOidcToken` is handed to `createGateway({ apiKey })` explicitly. The
 * gateway accepts an OIDC token there (verified 2026-09-11: a local token as `apiKey`
 * answered "ok"). Returns null when there is no usable credential at all.
 */
export function resolveGatewayModel(requestHeaders?: Headers): LanguageModel | null {
  if (hasValue(process.env.AI_GATEWAY_API_KEY)) return TUTOR_MODEL_ID;
  const oidc = resolveOidcToken(requestHeaders);
  if (!hasValue(oidc) || isExpiredJwt(oidc)) return null;
  return createGateway({ apiKey: oidc }).languageModel(TUTOR_MODEL_ID);
}
