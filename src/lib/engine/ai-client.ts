// src/lib/engine/ai-client.ts
//
// Browser-side callers for the two AI route handlers. Nothing here knows about
// React or Convex — `use-ai-turn` and `hint-button` own that side.
import type { AiMoveRequest, AiMoveResult, AiPhase, Candidate, HintResult } from "@/lib/types";
import { readNdjson } from "./ai-stream";

export class AiRouteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AiRouteError";
  }
}

export interface AiMoveCallbacks {
  /** Heartbeat frames — keep the "thinking" indicator alive. */
  onStatus?(phase: AiPhase): void;
  /**
   * Text deltas. Reserved: with a per-turn `outputSchema` eve emits none
   * (eve-agent.md A.1), so today the commentary lands whole with the result.
   */
  onDelta?(delta: string): void;
}

/**
 * POST /api/ai/move and consume the NDJSON stream to its single `result` frame.
 * Throws {@link AiRouteError} on a non-2xx response, or the abort reason when
 * `signal` fires; resolves to null only when the stream ended without a result.
 */
export async function postAiMove(
  request: AiMoveRequest,
  options: { signal?: AbortSignal } & AiMoveCallbacks = {},
): Promise<AiMoveResult | null> {
  const response = await fetch("/api/ai/move", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal: options.signal,
    cache: "no-store",
  });

  if (!response.ok || response.body === null) {
    throw new AiRouteError(await describeFailure(response), response.status);
  }

  let result: AiMoveResult | null = null;
  let streamError: string | null = null;
  for await (const frame of readNdjson(response.body)) {
    switch (frame.t) {
      case "status":
        options.onStatus?.(frame.d);
        break;
      case "delta":
        options.onDelta?.(frame.d);
        break;
      case "error":
        streamError = frame.d;
        break;
      case "result":
        result = frame.d;
        break;
    }
  }
  if (result === null && streamError !== null) {
    throw new AiRouteError(streamError, response.status);
  }
  return result;
}

/**
 * FR-40. One-shot JSON, no streaming. The route charges the 3-per-game limit
 * itself (`api.games.useHint`) before it does any model work, so the caller must
 * NOT pre-charge it — that would spend two hints per press. The position and
 * history come from the server's own game document; only the engine candidates
 * travel from the browser.
 */
export async function postAiHint(
  request: { gameId: string; candidates: Candidate[] },
  options: { signal?: AbortSignal } = {},
): Promise<HintResult> {
  const response = await fetch("/api/ai/hint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal: options.signal,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new AiRouteError(await describeFailure(response), response.status);
  }
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as HintResult).san !== "string" ||
    typeof (body as HintResult).text !== "string"
  ) {
    throw new AiRouteError("hint-malformed", response.status);
  }
  return body as HintResult;
}

async function describeFailure(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string") {
      return (body as { error: string }).error;
    }
  } catch {
    /* non-JSON body */
  }
  return `ai-route-${response.status}`;
}
