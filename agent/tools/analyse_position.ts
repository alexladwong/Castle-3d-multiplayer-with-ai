// agent/tools/analyse_position.ts — §F.5
//
// Tool name = filename slug -> "analyse_position".
//
// Candidates are computed by the player's browser Stockfish worker (SF18 lite-single
// by default) and handed to the model through `clientContext`, so this tool is the
// "candidates were empty" escape hatch named in instructions.md plus a legality/ranking
// check. It must NEVER load an engine on the server: a Node Stockfish would add 128 MB
// per invocation and, more importantly, one tool round-trip costs ~2-2.5 s, which alone
// blows FR-38 (eve-agent.md A.7/A.12).
//
// That is why `depth` and `multiPv` are ADVISORY inputs (FR-35 asks for that interface;
// the search they describe already happened in the browser). `depth` is echoed back so
// the model can see what it asked for versus the depth the client actually reached;
// `multiPv` caps how many candidates come back.
//
// `clientContext` is delivered to the MODEL, not to tools, so `candidates` is an
// optional INPUT here: the model echoes back what it was given and gets a legality
// check plus a stable ranking for free (eve-agent.md §2.1, "Recommended minimal path").
import { defineTool } from "eve/tools";
import { z } from "zod";
import { Chess } from "chess.js";

const candidateSchema = z.object({
  san: z.string(),
  uci: z.string().default(""),
  scoreCp: z
    .number()
    .nullable()
    .default(null)
    .describe("Centipawns from the side to move's point of view; null when the line is a mate"),
  mateIn: z
    .number()
    .nullable()
    .default(null)
    .describe("Positive = the side to move mates in N; negative = the side to move gets mated"),
  depth: z.number().int().default(0),
  pv: z.array(z.string()).default([]),
});

const rankedCandidateSchema = candidateSchema.extend({
  rank: z.number().int().describe("1 = best by evaluation"),
});

/** `score mate 0` = the side to move is ALREADY mated: the worst value there is. */
const MATED_NOW = -1_000_001;

/**
 * A single comparable number per candidate, best first, or null when the candidate
 * carries no engine evaluation at all (the engine-less legal-move fallback).
 * Mates dominate centipawns: mate in 1 beats mate in 5 beats any cp score, and being
 * mated is worse than any cp score (mated in 8 is "better" than mated in 1).
 *
 * Zero is checked FIRST because it is not a mate the side to move delivers: Stockfish
 * emits `score mate 0` for a position that is already checkmate, and `parse-uci.ts`
 * passes the raw value through, so a `> 0` test would have scored it 1,000,000 — above
 * mate in 1 and above every cp score, the exact inverse of the truth.
 */
function rankValue(candidate: { scoreCp: number | null; mateIn: number | null }): number | null {
  if (candidate.mateIn !== null) {
    if (candidate.mateIn === 0) return MATED_NOW;
    return candidate.mateIn > 0 ? 1_000_000 - candidate.mateIn : -1_000_000 - candidate.mateIn;
  }
  return candidate.scoreCp;
}

export default defineTool({
  description:
    "Analyse a chess position. Returns every legal move in the FEN as SAN and, when you pass " +
    "back the candidate list you were given, the legal ones ranked best-first with their " +
    "evaluations (scoreCp / mateIn / depth / pv). No engine runs here — `depth` and `multiPv` " +
    "are advisory: the search already happened in the player's browser. Call this at most once " +
    "per turn, and only when you were given neither candidates nor legalMoves.",
  inputSchema: z.object({
    fen: z.string().min(10).describe("Position in Forsyth-Edwards Notation"),
    depth: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe("Advisory only: the search depth you would like. Echoed back, never acted on."),
    multiPv: z
      .number()
      .int()
      .min(1)
      .max(8)
      .default(4)
      .describe("Advisory: how many ranked candidates to return (caps the list)"),
    candidates: z
      .array(candidateSchema)
      .default([])
      .describe("Optional: the candidate list you were given, to be legality-checked and ranked"),
  }),
  outputSchema: z.object({
    fen: z.string(),
    legalMoves: z.array(z.string()),
    candidates: z.array(rankedCandidateSchema),
    source: z
      .enum(["client", "none"])
      .describe("`client` = evaluations from the player's engine; `none` = legal moves only"),
    requestedDepth: z.number().int().nullable(),
    /** The best depth actually reached by the client search, 0 when unknown. */
    reachedDepth: z.number().int(),
    inCheck: z.boolean(),
    turn: z.enum(["w", "b"]),
  }),
  execute({ fen, depth, multiPv, candidates }) {
    // Throws on an invalid FEN, which eve surfaces to the model as a tool error.
    const chess = new Chess(fen);
    const legalMoves = chess.moves();
    const legal = new Set(legalMoves);

    const filtered = candidates.filter((candidate) => legal.has(candidate.san));
    // Stable rank: evaluated candidates first (best first), unevaluated ones after in
    // the order they arrived. `sort` is stable in every runtime eve targets (ES2019+).
    const ranked = filtered
      .map((candidate, index) => ({ candidate, index, value: rankValue(candidate) }))
      .sort((a, b) => {
        if (a.value === null && b.value === null) return a.index - b.index;
        if (a.value === null) return 1;
        if (b.value === null) return -1;
        return b.value - a.value;
      })
      .slice(0, multiPv)
      .map(({ candidate }, index) => ({ ...candidate, rank: index + 1 }));

    return {
      fen,
      legalMoves,
      candidates: ranked,
      source: ranked.length > 0 ? ("client" as const) : ("none" as const),
      requestedDepth: depth ?? null,
      reachedDepth: ranked.reduce((best, candidate) => Math.max(best, candidate.depth), 0),
      inCheck: chess.inCheck(),
      turn: chess.turn(),
    };
  },
});
