// src/app/api/ai/_lib/eve-agent.ts
//
// Server-to-server client for the eve agent mounted at /eve/v1/* by `withEve`
// (§F.1). Folders prefixed with `_` are private in the App Router, so nothing
// here is routable.
//
// Everything in this file follows eve-agent.md Appendix A:
//   * a per-turn `outputSchema` is the ONLY way to get a machine-checkable move
//     (`defineAgent({ outputSchema })` applies to task mode, not interactive turns);
//   * the schema is a prompt hint, NOT enforced — `result.data === undefined` with
//     `status: "waiting"` is the OUTPUT_SCHEMA_NOT_FULFILLED shape, so we re-parse
//     locally and never branch on `status`;
//   * the 10 s budget is the caller's job: arm the AbortController BEFORE awaiting
//     `send()`, then `session.cancel()` so the session is clean for the next turn.
import { Client, ClientError } from "eve/client";
import type { MessageResponse, MessageStreamEvent, SendTurnOptions } from "eve/client";
import { generateText, Output } from "ai";
import type { z } from "zod";

/** Basic-auth username shared with `agent/channels/eve.ts`. */
export const EVE_BASIC_USERNAME = "chess-server";
/** Gateway id — same model as `agent/agent.ts`, used by the no-eve fallback. */
export const FALLBACK_MODEL_ID = "anthropic/claude-haiku-4.5";

/** Exactly what `SendTurnOptions.clientContext` accepts (eve's readonly JsonObject). */
type EveClientContext = NonNullable<SendTurnOptions["clientContext"]>;

/**
 * eve JSON-serialises `clientContext` into one user-role context message, so a
 * round-trip is both the honest type conversion and a cheap guard against a
 * non-serialisable value (Date, Map, NaN) reaching the wire.
 */
function toClientContext(value: Record<string, unknown>): EveClientContext {
  return JSON.parse(JSON.stringify(value)) as EveClientContext;
}

export interface AgentTurnInput {
  host: string;
  message: string;
  clientContext: Record<string, unknown>;
  /** Durable session for this game, when one is already stored. */
  sessionId?: string;
  /** Opaque per-request user marker; never a Clerk token. */
  userKey: string;
  budgetMs: number;
  signal?: AbortSignal;
}

export interface AgentTurnResult<T> {
  data: T | null;
  /** Session id to persist (new or reused); undefined when eve never answered. */
  sessionId: string | undefined;
  /** Machine-readable reason the agent path did not produce data. */
  failure: string | null;
  /** True when eve itself could not be reached (worth trying the direct model). */
  unreachable: boolean;
}

export function eveConfigured(): boolean {
  return typeof process.env.EVE_SERVER_SECRET === "string" && process.env.EVE_SERVER_SECRET.length > 0;
}

/**
 * Resolve the origin that serves `/eve/v1/*`.
 *
 * Deliberately does NOT trust the inbound `Host` header in production: this client
 * carries `EVE_SERVER_SECRET`, and a spoofed host would post it to an attacker. A
 * request origin is honoured only when it is loopback, which is what makes
 * `next dev --port 4000` work without extra configuration.
 */
export function resolveEveHost(requestUrl: string): string {
  const explicit = process.env.EVE_HOST;
  if (typeof explicit === "string" && explicit.length > 0) return explicit.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_URL;
  if (typeof vercelUrl === "string" && vercelUrl.length > 0) return `https://${vercelUrl}`;
  try {
    const origin = new URL(requestUrl);
    if (origin.hostname === "localhost" || origin.hostname === "127.0.0.1" || origin.hostname === "[::1]") {
      return origin.origin;
    }
  } catch {
    /* fall through */
  }
  return "http://localhost:3000";
}

/**
 * Vercel Deployment Protection headers (eve-agent.md §7).
 *
 * `resolveEveHost` targets the deployment's PUBLIC origin, so on a protected
 * deployment (team previews are protected by default) this server-to-server POST
 * is answered with a 401 challenge before it ever reaches `/eve/v1/*`. The bypass
 * secret is Vercel's own escape hatch for exactly this call. Resolved per request
 * so a rotated secret is picked up without a restart; empty when the project has
 * no protection configured, which is the normal production case.
 */
function protectionBypassHeaders(): Record<string, string> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (typeof secret !== "string" || secret.length === 0) return {};
  return {
    "x-vercel-protection-bypass": secret,
    // Never let the bypass be pinned as a cookie: this client is not a browser.
    "x-vercel-set-bypass-cookie": "false",
  };
}

function eveClient(host: string): Client {
  return new Client({
    host,
    auth: {
      basic: {
        username: EVE_BASIC_USERNAME,
        // Resolved per request so a rotated secret is picked up without a restart.
        password: () => process.env.EVE_SERVER_SECRET ?? "",
      },
    },
    headers: () => protectionBypassHeaders(),
    // Credential-bearing clients must not follow redirects (ClientRedirectPolicy).
    redirect: "manual",
  });
}

/**
 * True when a failed eve call means "eve did not answer" rather than "eve answered
 * badly" — the §F.6 direct-model fallback is worth a try only in the first case.
 * 401/403 belong here: a Deployment Protection or basic-auth challenge is indis-
 * tinguishable from eve being down as far as this request is concerned, and
 * without it every move would silently degrade to the Stockfish fallback.
 */
function isUnreachableStatus(status: number): boolean {
  return status >= 500 || status === 404 || status === 401 || status === 403;
}

/**
 * Run one structured turn against the agent. Never throws: every failure is
 * reported through {@link AgentTurnResult} so the caller can fall back to
 * Stockfish (NFR-5) without a try/catch around the whole route.
 */
export async function runAgentTurn<T>(
  schema: z.ZodType<T>,
  input: AgentTurnInput,
): Promise<AgentTurnResult<T>> {
  if (!eveConfigured()) {
    return { data: null, sessionId: input.sessionId, failure: "eve-not-configured", unreachable: true };
  }

  const client = eveClient(input.host);
  const controller = new AbortController();
  const abortOuter = () => controller.abort();
  input.signal?.addEventListener("abort", abortOuter, { once: true });
  const timer = setTimeout(abortOuter, input.budgetMs);

  const clientContext = toClientContext(input.clientContext);
  let sessionId = input.sessionId;
  let failure: string | null = null;
  let unreachable = false;

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (controller.signal.aborted) {
        failure ??= "timeout";
        break;
      }
      const reuse = attempt === 0 ? sessionId : undefined;
      try {
        let response: MessageResponse<T>;
        if (reuse !== undefined) {
          // `attach(id)` alone starts the response stream at index 0, so
          // `result()` stops at the FIRST turn boundary in the session and hands
          // back the PREVIOUS turn's result (measured: 13 ms, identical payload).
          // Attach at the current tail + 1 so the stream begins with our own turn.
          const tail = await readTailIndex(client, reuse, controller.signal);
          if (tail.kind === "gone") {
            // The session really is not there any more — a fresh one is correct.
            sessionId = undefined;
            failure = "session-restarted";
            continue;
          }
          if (tail.kind === "unavailable") {
            // Transport/auth failure, not a missing session: KEEP the stored id
            // (a new session per hiccup would reset the persona every ply, FR-37)
            // and let this one turn fall back to the Stockfish candidates.
            failure = tail.status === null ? "session-index-unavailable" : `eve-${tail.status}`;
            unreachable = tail.status === null || isUnreachableStatus(tail.status);
            break;
          }
          response = await client.sessions
            .attach(reuse, { streamIndex: tail.index + 1 })
            .send<T>(input.message, {
              clientContext,
              outputSchema: schema,
              signal: controller.signal,
              headers: { "x-chess-user": input.userKey },
            });
        } else {
          const created = await client.sessions.create<T>({
            message: input.message,
            clientContext,
            outputSchema: schema,
            signal: controller.signal,
            headers: { "x-chess-user": input.userKey },
          });
          response = created.response;
        }
        sessionId = response.sessionId;

        const result = await response.result();
        if (!isOwnTurn(result.events)) {
          // Belt and braces for the cursor problem above: without a `turn.started`
          // this aggregate belongs to an older turn and must never be applied.
          sessionId = undefined;
          failure = "stale-stream";
          continue;
        }
        const parsed = schema.safeParse(result.data);
        if (parsed.success) {
          return { data: parsed.data, sessionId, failure: null, unreachable: false };
        }
        // A.5: the schema is a prompt hint. `status` is "waiting" either way, so
        // the only reliable signals are `data` and the failure events.
        failure = schemaFailureCode(result.events);
        break;
      } catch (error) {
        if (controller.signal.aborted) {
          failure = input.signal?.aborted === true ? "aborted" : "timeout";
          break;
        }
        if (error instanceof ClientError) {
          if (isStaleSession(error) && attempt === 0 && reuse !== undefined) {
            // The stored session was retired (expired / cleared). Start a fresh one.
            sessionId = undefined;
            failure = "session-restarted";
            continue;
          }
          failure = error.code ?? `eve-${error.status}`;
          unreachable = isUnreachableStatus(error.status);
          break;
        }
        failure = "eve-unreachable";
        unreachable = true;
        break;
      }
    }
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abortOuter);
    if (controller.signal.aborted && sessionId !== undefined) {
      // Detaching the client never stops server-side work — cancel the turn so the
      // session is parked at `session.waiting` for the next move (A.8).
      void client.sessions
        .attach(sessionId)
        .cancel()
        .catch(() => undefined);
    }
  }

  return { data: null, sessionId, failure: failure ?? "no-result", unreachable };
}

/**
 * Direct AI SDK 7 path, used only when eve itself is unreachable (§F.6).
 * `generateObject` is deprecated since AI SDK 6 — this is `generateText` + `Output.object`.
 */
export async function runDirectTurn<T>(
  schema: z.ZodType<T>,
  input: { system: string; prompt: string; budgetMs: number; signal?: AbortSignal },
): Promise<{ data: T | null; failure: string | null }> {
  try {
    const result = await generateText({
      model: FALLBACK_MODEL_ID,
      system: input.system,
      prompt: input.prompt,
      output: Output.object({ schema }),
      timeout: { totalMs: input.budgetMs },
      abortSignal: input.signal,
      maxRetries: 0,
    });
    const parsed = schema.safeParse(result.output);
    return parsed.success ? { data: parsed.data, failure: null } : { data: null, failure: "invalid-shape" };
  } catch {
    return { data: null, failure: "direct-model-failed" };
  }
}

/**
 * Why this is a discriminated union: "the session is gone" and "the request
 * failed" need OPPOSITE handling. Collapsing both to `null` made every transport
 * hiccup (a 5xx, a protection 401) throw the game's durable session away and
 * create a fresh one on the next ply, so the agent lost all cross-turn context
 * and paid for a `sessions.create` every move.
 */
type TailIndex =
  | { kind: "ok"; index: number }
  /** 404 / no tail header on a 2xx: this session really is not there any more. */
  | { kind: "gone" }
  /** The request itself failed; `status` is null for a thrown fetch. */
  | { kind: "unavailable"; status: number | null };

/** Index of the newest durable event in a session. Retries a failed call once. */
async function readTailIndex(
  client: Client,
  sessionId: string,
  signal: AbortSignal,
): Promise<TailIndex> {
  let last: TailIndex = { kind: "unavailable", status: null };
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted) return last;
    last = await readTailIndexOnce(client, sessionId, signal);
    if (last.kind !== "unavailable") return last;
  }
  return last;
}

async function readTailIndexOnce(
  client: Client,
  sessionId: string,
  signal: AbortSignal,
): Promise<TailIndex> {
  let response: Response;
  try {
    response = await client.fetch(
      `${EVE_SESSION_STREAM_PATH(sessionId)}?startIndex=-1&includeTailIndex=1`,
      { method: "GET", signal },
    );
  } catch {
    return { kind: "unavailable", status: null };
  }
  const header = response.headers.get(EVE_STREAM_TAIL_INDEX_HEADER);
  // We only wanted the header; never drain a follow stream.
  void response.body?.cancel().catch(() => undefined);
  if (!response.ok) {
    return response.status === 404 ? { kind: "gone" } : { kind: "unavailable", status: response.status };
  }
  if (header === null) return { kind: "gone" };
  const parsed = Number.parseInt(header, 10);
  return Number.isFinite(parsed) && parsed >= -1
    ? { kind: "ok", index: parsed }
    : { kind: "gone" };
}

const EVE_STREAM_TAIL_INDEX_HEADER = "x-eve-stream-tail-index";
const EVE_SESSION_STREAM_PATH = (sessionId: string) =>
  `/eve/v1/session/${encodeURIComponent(sessionId)}/stream`;

/** True when the aggregated events contain a turn we ourselves started. */
function isOwnTurn(events: readonly MessageStreamEvent[]): boolean {
  return events.some((event) => event.type === "turn.started" || event.type === "session.started");
}

function isStaleSession(error: ClientError): boolean {
  return error.code === "session_not_active" || error.status === 404 || error.status === 409;
}

function schemaFailureCode(events: readonly MessageStreamEvent[]): string {
  for (const event of events) {
    if (event.type === "step.failed" || event.type === "turn.failed" || event.type === "session.failed") {
      return event.data.code;
    }
  }
  return "invalid-shape";
}
