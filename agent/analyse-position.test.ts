// @vitest-environment node
// agent/analyse-position.test.ts
//
// The ranking half of the tool (§F.5). No engine and no eve runtime are involved:
// `defineTool` hands back the plain `{description, inputSchema, outputSchema, execute}`
// object, so `execute` is callable directly with already-parsed input.
//
// PLACEMENT: this file deliberately sits loose in the agent root rather than in a
// `__tests__/` directory like every other suite in the repo. eve's discovery treats
// EVERY entry under `agent/tools/` as a tool and validates the basename against
// TOOL_SLUG_PATTERN (`/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/`, dist/src/discover/grammar.js),
// so `agent/tools/__tests__/` is a hard discovery ERROR that stops `next dev` booting;
// `agent/__tests__/` downgrades it to an "unsupported directory" warning on every
// dev/build. A loose non-directory file in the agent root is ignored silently, so this
// is the only placement that keeps `eve info` at 0 errors / 0 warnings. Verified on
// eve 0.52.4. vitest still picks it up via the `agent/**` include in vitest.config.mts.
import { describe, expect, it } from "vitest";
import analysePosition from "./tools/analyse_position";

/** After 1. e4 — Black to move, so every candidate below is one of Black's. */
const START_BLACK = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
/** Black is checkmated (Fool's mate delivered): `score mate 0` territory. */
const MATED = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";

type ExecuteInput = Parameters<typeof analysePosition.execute>[0];
type ExecuteContext = Parameters<typeof analysePosition.execute>[1];
type Candidate = ExecuteInput["candidates"][number];
/** `execute` is declared as sync | Promise | AsyncIterable; this one is sync. */
type Result = Extract<
  Awaited<ReturnType<typeof analysePosition.execute>>,
  { legalMoves: string[] }
>;

function candidate(san: string, patch: Partial<Candidate> = {}): Candidate {
  return { san, uci: "", scoreCp: null, mateIn: null, depth: 12, pv: [], ...patch };
}

function run(input: Partial<ExecuteInput> & { fen: string }): Result {
  // No engine, no eve session: the tool is a pure function of its parsed input, so the
  // context argument is never touched.
  return analysePosition.execute(
    { multiPv: 4, candidates: [], ...input },
    {} as ExecuteContext,
  ) as Result;
}

describe("analyse_position ranking", () => {
  it("sorts mates above centipawns and mated-in-N below everything", () => {
    const result = run({
      fen: START_BLACK,
      candidates: [
        candidate("e5", { scoreCp: 30 }),
        candidate("Nf6", { mateIn: -3 }), // Black gets mated in 3
        candidate("c5", { mateIn: 2 }), // Black mates in 2
        candidate("d5", { mateIn: -1 }), // Black gets mated next move: worse than -3
      ],
    });
    expect(result.candidates.map((c) => c.san)).toEqual(["c5", "e5", "Nf6", "d5"]);
    expect(result.candidates.map((c) => c.rank)).toEqual([1, 2, 3, 4]);
    expect(result.source).toBe("client");
  });

  it("ranks `mate 0` (already mated) last, not first", () => {
    // Stockfish emits `score mate 0` when the side to move is ALREADY mated, and
    // `parse-uci.ts` passes the raw value through, so a model echoing that candidate
    // back used to be handed it as rank 1 — the exact inverse of the truth.
    const result = run({
      fen: START_BLACK,
      candidates: [
        candidate("e5", { mateIn: 0 }),
        candidate("c5", { scoreCp: -400 }),
        candidate("Nf6", { mateIn: 1 }),
        candidate("d5", { mateIn: -1 }),
      ],
    });
    expect(result.candidates.map((c) => c.san)).toEqual(["Nf6", "c5", "d5", "e5"]);
    expect(result.candidates.at(-1)).toMatchObject({ san: "e5", rank: 4 });
  });

  it("keeps unevaluated candidates after evaluated ones, in arrival order", () => {
    const result = run({
      fen: START_BLACK,
      candidates: [candidate("a6"), candidate("h6"), candidate("e5", { scoreCp: -10 })],
    });
    expect(result.candidates.map((c) => c.san)).toEqual(["e5", "a6", "h6"]);
  });

  it("drops illegal candidates and reports the position", () => {
    const result = run({
      fen: MATED,
      depth: 18,
      candidates: [candidate("e4", { mateIn: 0 })], // no legal move exists here
    });
    expect(result.legalMoves).toEqual([]);
    expect(result.candidates).toEqual([]);
    expect(result.source).toBe("none");
    expect(result.requestedDepth).toBe(18);
    expect(result.reachedDepth).toBe(0);
    expect(result.turn).toBe("w");
  });
});
