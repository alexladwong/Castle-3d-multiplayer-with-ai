// src/lib/tutor/tools.ts
// The tutor's tool contract, shared by the route handler (server) and the panel
// (client). docs/PRO_TUTOR.md §5.5 / §6. Verified against ai@7 (docs/research/tutor-agent.md):
// `tool({ description, inputSchema, execute })`; a tool WITHOUT `execute` is
// forwarded to the browser and answered with `addToolOutput`.
import { Chess } from "chess.js";
import { tool, type InferUITools, type UIDataTypes, type UIMessage } from "ai";
import { z } from "zod";

export const SQUARE_PATTERN = /^[a-h][1-8]$/;
const square = z.string().regex(SQUARE_PATTERN, "a board square such as e4");
const tone = z.enum(["good", "bad", "threat", "idea"]);

export const highlightSquaresInput = z.object({
  squares: z.array(square).min(1).max(16),
  tone,
});

export const drawArrowsInput = z.object({
  arrows: z.array(z.object({ from: square, to: square, tone })).min(1).max(6),
});

export const showLineInput = z.object({
  /** SAN moves from the position in view, e.g. ["Nxe5", "Qh5", "Nf3"]. */
  san: z.array(z.string().min(1)).min(1).max(12),
});

export const requestAnalysisInput = z.object({
  depth: z.number().int().min(8).max(22).default(16),
  multiPv: z.number().int().min(1).max(5).default(3),
});

export const analysisLine = z.object({
  san: z.string(),
  uci: z.string(),
  /** Centipawns from the side to move's point of view; null when a mate is found. */
  scoreCp: z.number().nullable(),
  mateIn: z.number().nullable(),
  depth: z.number(),
  pv: z.array(z.string()),
});

export const requestAnalysisOutput = z.object({
  fen: z.string(),
  lines: z.array(analysisLine),
  /** "engine-busy": the opponent's search had the worker; the tutor answers without lines. */
  note: z.enum(["ok", "engine-busy", "engine-unavailable"]).default("ok"),
});

export type AnalysisLine = z.infer<typeof analysisLine>;
export type RequestAnalysisOutput = z.infer<typeof requestAnalysisOutput>;

export interface TutorToolContext {
  /** FEN of the position the tutor is looking at (derived server-side, never from the client). */
  fen: string;
}

/**
 * Tools are created per request so `showLine` can validate against the position in
 * view. The three drawing tools return immediately (the client renders them from the
 * tool INPUT); `requestAnalysis` has no `execute`, so the browser runs Stockfish.
 */
export function createTutorTools(ctx: TutorToolContext) {
  return {
    highlightSquares: tool({
      description:
        "Mark squares on the board so the player sees what you are talking about. Use one tone per call: good, bad (a mistake), threat, or idea. At most two drawings per answer.",
      inputSchema: highlightSquaresInput,
      execute: async ({ squares }) => ({ ok: true as const, count: squares.length }),
    }),
    drawArrows: tool({
      description:
        "Draw arrows from one square to another (a move, a threat, a plan). Up to six arrows; give each a tone.",
      inputSchema: drawArrowsInput,
      execute: async ({ arrows }) => ({ ok: true as const, count: arrows.length }),
    }),
    showLine: tool({
      description:
        "Show a candidate line as numbered arrows, starting from the position in view. Pass SAN moves in order. Illegal lines are rejected with a reason; correct and try again.",
      inputSchema: showLineInput,
      execute: async ({ san }) => validateLine(ctx.fen, san),
    }),
    requestAnalysis: tool({
      description:
        "Ask the player's engine for the top lines of the position in view. Call this once before judging any move or claiming an evaluation; it runs in the player's browser and may report engine-busy.",
      inputSchema: requestAnalysisInput,
      outputSchema: requestAnalysisOutput,
    }),
  };
}

export type TutorTools = ReturnType<typeof createTutorTools>;
export type TutorUITools = InferUITools<TutorTools>;

/**
 * What the route stamps on an answer: the ply it was ABOUT.
 *
 * Without it a tutor bubble read from the ply currently in view, so scrolling the
 * board back after an answer re-labelled an old answer with a new position. The
 * route sets it with `messageMetadata`; the panel falls back to the ply in view when
 * it is absent (a scripted harness message, or a message from an older stream).
 */
export interface TutorMessageMetadata {
  ply?: number;
}

export type TutorUIMessage = UIMessage<TutorMessageMetadata, UIDataTypes, TutorUITools>;

export type ShowLineResult =
  | { ok: true; steps: { from: string; to: string; san: string }[] }
  | { ok: false; reason: string; legalUpTo: number };

/** Plays `san` from `fen` with chess.js and returns the from/to squares per step. */
export function validateLine(fen: string, san: string[]): ShowLineResult {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return { ok: false, reason: "The position could not be read.", legalUpTo: 0 };
  }
  const steps: { from: string; to: string; san: string }[] = [];
  for (const [index, move] of san.entries()) {
    try {
      const played = chess.move(move);
      steps.push({ from: played.from, to: played.to, san: played.san });
    } catch {
      return {
        ok: false,
        reason: `${move} is not legal at step ${index + 1} from this position.`,
        legalUpTo: index,
      };
    }
  }
  return { ok: true, steps };
}
