// src/lib/engine/ai-stream.ts
//
// The NDJSON wire format of POST /api/ai/move — one JSON object per line
// (§E.4 step 8, patched). Shared by the route handler (encode) and the browser
// hook (decode); no React, no worker, no Node built-ins, so both runtimes can import it.
//
// The `status` heartbeat variant now lives in `AiStreamEvent` itself (src/lib/types.ts),
// so `AiStreamFrame` is a plain alias kept for the call sites that already use the name.
import type { AiMoveResult, AiPhase, AiStreamEvent } from "@/lib/types";

/** Keep-alive frame emitted roughly once a second while the agent is thinking. */
export interface AiStatusFrame {
  t: "status";
  d: AiPhase;
}

export type AiStreamFrame = AiStreamEvent;

export const AI_NDJSON_CONTENT_TYPE = "application/x-ndjson";
/** Heartbeat cadence (§E.4 step 8: "every ~1 s"). */
export const AI_STATUS_HEARTBEAT_MS = 1_000;

export function encodeFrame(frame: AiStreamFrame): string {
  return `${JSON.stringify(frame)}\n`;
}

/** Narrow an unknown parsed line to a frame we understand. */
export function asAiStreamFrame(value: unknown): AiStreamFrame | null {
  if (typeof value !== "object" || value === null) return null;
  const frame = value as { t?: unknown; d?: unknown };
  switch (frame.t) {
    case "status":
      return typeof frame.d === "string" ? { t: "status", d: frame.d as AiPhase } : null;
    case "delta":
      return typeof frame.d === "string" ? { t: "delta", d: frame.d } : null;
    case "error":
      return typeof frame.d === "string" ? { t: "error", d: frame.d } : null;
    case "result":
      return isAiMoveResult(frame.d) ? { t: "result", d: frame.d } : null;
    default:
      return null;
  }
}

export function isAiMoveResult(value: unknown): value is AiMoveResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Partial<AiMoveResult>;
  return (
    typeof result.move === "string" &&
    typeof result.commentary === "string" &&
    (result.source === "eve" || result.source === "fallback")
  );
}

/**
 * Decode an NDJSON body into frames. Malformed lines are skipped rather than
 * throwing — a truncated tail must never lose the frames that already arrived.
 */
export async function* readNdjson(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AiStreamFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const frame = parseLine(line);
        if (frame !== null) yield frame;
        newline = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    const tail = parseLine(buffer);
    if (tail !== null) yield tail;
  } finally {
    reader.releaseLock();
  }
}

function parseLine(line: string): AiStreamFrame | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  try {
    return asAiStreamFrame(JSON.parse(trimmed));
  } catch {
    return null;
  }
}
