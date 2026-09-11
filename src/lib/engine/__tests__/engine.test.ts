// @vitest-environment node
// src/lib/engine/__tests__/engine.test.ts
//
// Every `info` line below is VERBATIM output from an engine this app ships
// (stockfish@11.0.0 — now the no-SIMD fallback — via node_modules/stockfish11/src/stockfish.js,
// captured on Node 24.14.1). Note the trailing `bmc <float>` token, which is specific to the
// ddugovic/chess.com fork and is not mentioned in docs/research/stockfish.md §5. The default
// build (stockfish@18.0.8 lite-single) emits `hashfull` and no `bmc`; both shapes were driven
// through this parser live on 2026-09-09 (see §I-1).
import { describe, expect, it } from "vitest";
import {
  PvCollector,
  isUciMove,
  parseBestMove,
  parseInfoLine,
  type PvLine,
} from "../parse-uci";
import {
  candidatesFromLegalMoves,
  isCaptureSan,
  linesToCandidates,
  normaliseMove,
  selectCandidate,
  uciToSan,
} from "../candidates";
import { asAiStreamFrame, encodeFrame, readNdjson } from "../ai-stream";
import { FALLBACK_MIN_BUDGET_MS, fallbackEngineMove, fallbackSearchBudgetMs } from "../fallback-move";
import type { SearchRequest, SearchResult } from "../stockfish-client";
import { DIFFICULTIES } from "../../difficulty";
import type { AiMoveResult, Candidate } from "@/lib/types";

const START_BLACK = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

const LIVE_LINES = [
  "info depth 12 seldepth 16 multipv 1 score cp -29 nodes 225728 nps 2303346 time 98 pv c7c5 b1c3 b8c6 g1f3 e7e6 d2d4 c5d4 f3d4 g8e7 d4f3 d7d6 f1c4 bmc 5.09171",
  "info depth 12 seldepth 17 multipv 2 score cp -30 nodes 225728 nps 2303346 time 98 pv e7e6 b1c3 g8e7 d2d4 d7d5 g1f3 b8c6 f1d3 d5e4 d3e4 e7f5 bmc 5.09171",
  "info depth 12 seldepth 18 multipv 3 score cp -50 nodes 225728 nps 2303346 time 98 pv e7e5 b1c3 g8f6 g1f3 d8e7 d2d4 e5d4 d1d4 b8c6 d4e3 a7a6 h2h3 e7b4 bmc 5.09171",
];

describe("parse-uci", () => {
  it("parses a live MultiPV info line and stops the pv at `bmc`", () => {
    const line = parseInfoLine(LIVE_LINES[0]);
    expect(line).not.toBeNull();
    expect(line).toMatchObject({ multipv: 1, depth: 12, seldepth: 16, scoreCp: -29, mateIn: null });
    expect(line?.pv[0]).toBe("c7c5");
    expect(line?.pv).toHaveLength(12);
    expect(line?.pv.every(isUciMove)).toBe(true);
  });

  it("parses a mate score (live line from a back-rank position)", () => {
    const line = parseInfoLine(
      "info depth 1 seldepth 2 multipv 1 score mate 1 nodes 57 nps 28500 time 2 pv a1a8 bmc 5",
    );
    expect(line).toMatchObject({ multipv: 1, scoreCp: null, mateIn: 1, pv: ["a1a8"] });
  });

  it("defaults multipv to 1 when the token is absent", () => {
    const line = parseInfoLine("info depth 8 score cp 43 nodes 21336 time 20 pv g1f3 d7d5");
    expect(line?.multipv).toBe(1);
  });

  it("skips info string, bound lines and pv-less lines", () => {
    expect(parseInfoLine("info string NNUE evaluation using nn-9067e33176e8.nnue")).toBeNull();
    expect(
      parseInfoLine(
        "info depth 8 seldepth 14 multipv 2 score cp 34 upperbound nodes 21336 time 20 pv d2d4 e5d4",
      ),
    ).toBeNull();
    expect(parseInfoLine("info depth 12 currmove c7c5 currmovenumber 1")).toBeNull();
    expect(parseInfoLine("bestmove c7c5 ponder b1c3")).toBeNull();
  });

  it("parses bestmove, ponder and `(none)`", () => {
    expect(parseBestMove("bestmove c7c5 ponder b1c3")).toEqual({
      bestmove: "c7c5",
      ponder: "b1c3",
    });
    expect(parseBestMove("bestmove e7e8q")).toEqual({ bestmove: "e7e8q", ponder: null });
    expect(parseBestMove("bestmove (none)")).toEqual({ bestmove: null, ponder: null });
    expect(parseBestMove("readyok")).toBeNull();
  });

  it("keeps the deepest line per rank and never lets a late shallow line win", () => {
    const collector = new PvCollector();
    for (const line of LIVE_LINES) expect(collector.accept(line)).toBe(true);
    // A post-`stop` depth-9 line for rank 1 must not overwrite the depth-12 one.
    expect(
      collector.accept(
        "info depth 9 seldepth 11 multipv 1 score cp -80 nodes 10 nps 10 time 1 pv a7a6",
      ),
    ).toBe(false);
    const lines = collector.lines();
    expect(lines.map((l) => l.multipv)).toEqual([1, 2, 3]);
    expect(lines[0].pv[0]).toBe("c7c5");
  });
});

describe("candidates", () => {
  it("converts UCI to SAN, including promotions and castling", () => {
    expect(uciToSan(START_BLACK, "c7c5")).toBe("c5");
    expect(uciToSan("4k3/1P6/8/8/8/8/8/4K3 w - - 0 1", "b7b8q")).toBe("b8=Q+");
    expect(uciToSan("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "e1g1")).toBe("O-O");
    expect(uciToSan(START_BLACK, "e2e4")).toBeNull(); // white's move, black to play
    expect(uciToSan(START_BLACK, "zzzz")).toBeNull();
  });

  it("normalises SAN and LAN, rejecting illegal moves", () => {
    expect(normaliseMove(START_BLACK, "c5")).toBe("c5");
    expect(normaliseMove(START_BLACK, "c7c5")).toBe("c5"); // the model often emits LAN
    expect(normaliseMove(START_BLACK, " e5 ")).toBe("e5");
    expect(normaliseMove(START_BLACK, "Qh4")).toBeNull();
    expect(normaliseMove(START_BLACK, "")).toBeNull();
  });

  it("turns live PV lines into best-first candidates", () => {
    const lines = LIVE_LINES.map(parseInfoLine).filter((l): l is PvLine => l !== null);
    const candidates = linesToCandidates(START_BLACK, lines);
    expect(candidates.map((c) => c.san)).toEqual(["c5", "e6", "e5"]);
    expect(candidates[0]).toMatchObject({ uci: "c7c5", scoreCp: -29, mateIn: null, depth: 12 });
  });

  it("drops illegal heads and de-duplicates by SAN", () => {
    const lines: PvLine[] = [
      { multipv: 1, depth: 8, seldepth: null, scoreCp: 10, mateIn: null, pv: ["c7c5"] },
      { multipv: 2, depth: 8, seldepth: null, scoreCp: 5, mateIn: null, pv: ["e2e4"] }, // illegal
      { multipv: 3, depth: 8, seldepth: null, scoreCp: 0, mateIn: null, pv: ["c7c5"] }, // dupe
    ];
    expect(linesToCandidates(START_BLACK, lines).map((c) => c.san)).toEqual(["c5"]);
  });

  it("builds engine-less candidates from the legal move list", () => {
    const candidates = candidatesFromLegalMoves(START_BLACK, 3);
    expect(candidates).toHaveLength(3);
    expect(candidates.every((c) => c.scoreCp === null && c.depth === 0)).toBe(true);
    expect(candidatesFromLegalMoves("not a fen", 3)).toEqual([]);
  });

  it("detects captures from SAN", () => {
    expect(isCaptureSan("exd5")).toBe(true);
    expect(isCaptureSan("Nxe4+")).toBe(true);
    expect(isCaptureSan("Nf3")).toBe(false);
    expect(isCaptureSan("O-O")).toBe(false);
  });
});

/** rank order: quiet best, capture, quiet, quiet, quiet. */
function candidateList(): Candidate[] {
  return ["Nf3", "Nxe5", "d4", "c4", "g3"].map((san, i) => ({
    san,
    uci: "a1a2",
    scoreCp: 30 - i * 10,
    mateIn: null,
    depth: 12,
    pv: [],
  }));
}

/** Deterministic RNG cycling through the supplied values. */
function seeded(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("selectCandidate", () => {
  const list = candidateList();

  it("always plays rank 1 at advanced and grandmaster", () => {
    for (const difficulty of ["advanced", "grandmaster"] as const) {
      for (const r of [0, 0.5, 0.99]) {
        expect(selectCandidate(difficulty, list, seeded([r]))?.san).toBe("Nf3");
      }
    }
  });

  it("splits 70/30 between rank 1 and rank 2 at intermediate", () => {
    expect(selectCandidate("intermediate", list, seeded([0.1]))?.san).toBe("Nf3");
    expect(selectCandidate("intermediate", list, seeded([0.69]))?.san).toBe("Nf3");
    expect(selectCandidate("intermediate", list, seeded([0.7]))?.san).toBe("Nxe5");
    expect(selectCandidate("intermediate", list, seeded([0.99]))?.san).toBe("Nxe5");
  });

  it("picks randomly from the top 3 at casual", () => {
    expect(selectCandidate("casual", list, seeded([0]))?.san).toBe("Nf3");
    expect(selectCandidate("casual", list, seeded([0.5]))?.san).toBe("Nxe5");
    expect(selectCandidate("casual", list, seeded([0.99]))?.san).toBe("d4");
  });

  it("picks from the top 5 at beginner, preferring quiet moves half the time", () => {
    // random() < 0.5 -> quiet-only pool ["Nf3","d4","c4","g3"], second call indexes it.
    expect(selectCandidate("beginner", list, seeded([0.2, 0.99]))?.san).toBe("g3");
    expect(selectCandidate("beginner", list, seeded([0.2, 0]))?.san).toBe("Nf3");
    // random() >= 0.5 -> full top-5 pool.
    expect(selectCandidate("beginner", list, seeded([0.8, 0.2]))?.san).toBe("Nxe5");
  });

  it("always takes a rank-1 forced mate, whatever the difficulty", () => {
    const mating: Candidate[] = [
      { san: "Qh7#", uci: "a1a2", scoreCp: null, mateIn: 1, depth: 12, pv: [] },
      ...list,
    ];
    for (const difficulty of ["beginner", "casual", "intermediate"] as const) {
      expect(selectCandidate(difficulty, mating, seeded([0.99, 0.99]))?.san).toBe("Qh7#");
    }
  });

  it("excludes lines that walk into mate while a safe option exists", () => {
    const risky: Candidate[] = [
      { san: "Kg1", uci: "a1a2", scoreCp: null, mateIn: -2, depth: 12, pv: [] },
      { san: "Rf1", uci: "a1a2", scoreCp: -50, mateIn: null, depth: 12, pv: [] },
      { san: "Bd2", uci: "a1a2", scoreCp: null, mateIn: -1, depth: 12, pv: [] },
    ];
    for (const r of [0, 0.4, 0.99]) {
      expect(selectCandidate("casual", risky, seeded([r]))?.san).toBe("Rf1");
    }
  });

  it("returns null for an empty list", () => {
    expect(selectCandidate("casual", [], seeded([0.5]))).toBeNull();
  });
});

describe("fallbackEngineMove (review AI-10)", () => {
  const emptyResult: SearchResult = {
    bestmove: "c7c5",
    ponder: null,
    lines: [],
    elapsedMs: 12,
    stopped: false,
  };

  it("searches at the difficulty's Skill Level and depth, MultiPV 1", async () => {
    const seen: SearchRequest[] = [];
    for (const difficulty of ["beginner", "casual", "intermediate", "advanced", "grandmaster"] as const) {
      const move = await fallbackEngineMove({
        fen: START_BLACK,
        difficulty,
        search: (request) => {
          seen.push(request);
          return Promise.resolve(emptyResult);
        },
      });
      expect(move?.san).toBe("c5");
    }
    expect(seen.map((r) => r.skillLevel)).toEqual([1, 5, 10, 15, 20]);
    expect(seen.map((r) => r.depth)).toEqual([2, 6, 10, 14, 18]);
    expect(seen.every((r) => r.multiPv === 1)).toBe(true);
    expect(seen.map((r) => r.timeoutMs)).toEqual(
      (["beginner", "casual", "intermediate", "advanced", "grandmaster"] as const).map(
        (d) => DIFFICULTIES[d].searchTimeoutMs,
      ),
    );
  });

  it("attaches the eval only when `bestmove` really is the head of a reported line", async () => {
    // Skill Level < 20 makes Stockfish play a randomised move that is usually NOT
    // `multipv 1` (stockfish.md §6), so the score must not be misattributed.
    const withLine = await fallbackEngineMove({
      fen: START_BLACK,
      difficulty: "grandmaster",
      search: () =>
        Promise.resolve({
          ...emptyResult,
          lines: [{ multipv: 1, depth: 18, seldepth: 24, scoreCp: -18, mateIn: null, pv: ["c7c5", "g1f3"] }],
        }),
    });
    expect(withLine).toMatchObject({ san: "c5", scoreCp: -18, depth: 18, pv: ["c7c5", "g1f3"] });

    const mismatched = await fallbackEngineMove({
      fen: START_BLACK,
      difficulty: "beginner",
      search: () =>
        Promise.resolve({
          ...emptyResult,
          bestmove: "a7a6", // the weakened pick
          lines: [{ multipv: 1, depth: 2, seldepth: 4, scoreCp: -18, mateIn: null, pv: ["c7c5"] }],
        }),
    });
    expect(mismatched).toMatchObject({ san: "a6", scoreCp: null, mateIn: null });
  });

  it("returns null (never throws) when the engine is unavailable, mated or illegal", async () => {
    const dead = await fallbackEngineMove({
      fen: START_BLACK,
      difficulty: "casual",
      search: () => Promise.reject(new Error("engine-unavailable")),
    });
    expect(dead).toBeNull();

    const none = await fallbackEngineMove({
      fen: START_BLACK,
      difficulty: "casual",
      search: () => Promise.resolve({ ...emptyResult, bestmove: null }),
    });
    expect(none).toBeNull();

    const illegal = await fallbackEngineMove({
      fen: START_BLACK,
      difficulty: "casual",
      search: () => Promise.resolve({ ...emptyResult, bestmove: "e2e4" }), // white's move
    });
    expect(illegal).toBeNull();
  });

  it("skips the search at Skill Level 20 and caps it with the turn's remaining budget", () => {
    // Grandmaster ran the identical search in step 1 (depth 18, Skill Level 20), so a
    // second one returns the move `candidates[0]` already is — several seconds for
    // nothing on a path that has already blown FR-38.
    expect(fallbackSearchBudgetMs("grandmaster", 60_000)).toBeNull();
    // Below 20 the engine's own weakening is the point, but only inside what is left.
    expect(fallbackSearchBudgetMs("advanced", 60_000)).toBe(DIFFICULTIES.advanced.searchTimeoutMs);
    expect(fallbackSearchBudgetMs("advanced", 900)).toBe(900);
    // A spent budget (the agent route burned AI_ROUTE_TIMEOUT_MS) means no search.
    expect(fallbackSearchBudgetMs("advanced", FALLBACK_MIN_BUDGET_MS - 1)).toBeNull();
    expect(fallbackSearchBudgetMs("beginner", 0)).toBeNull();
    expect(fallbackSearchBudgetMs("casual", -5_000)).toBeNull();
    expect(fallbackSearchBudgetMs("casual", Number.NaN)).toBeNull();
  });

  it("searches inside the caller's budget when one is passed", async () => {
    const seen: SearchRequest[] = [];
    await fallbackEngineMove({
      fen: START_BLACK,
      difficulty: "advanced", // searchTimeoutMs 2400
      timeoutMs: 700,
      search: (request) => {
        seen.push(request);
        return Promise.resolve(emptyResult);
      },
    });
    expect(seen[0].timeoutMs).toBe(700);
  });

  it("gives up on an aborted turn", async () => {
    const controller = new AbortController();
    const move = await fallbackEngineMove({
      fen: START_BLACK,
      difficulty: "advanced",
      signal: controller.signal,
      search: () => {
        controller.abort();
        return Promise.resolve(emptyResult);
      },
    });
    expect(move).toBeNull();
  });
});

describe("ai-stream", () => {
  const result: AiMoveResult = {
    move: "c5",
    commentary: "The Sicilian, of course.",
    source: "eve",
    eveSessionId: "wrun_1",
    persona: "Kasparova",
  };

  it("round-trips every frame kind", () => {
    for (const frame of [
      { t: "status", d: "agent" },
      { t: "delta", d: "hello" },
      { t: "error", d: "boom" },
      { t: "result", d: result },
    ] as const) {
      const encoded = encodeFrame(frame);
      expect(encoded.endsWith("\n")).toBe(true);
      expect(asAiStreamFrame(JSON.parse(encoded))).toEqual(frame);
    }
  });

  it("rejects malformed frames", () => {
    expect(asAiStreamFrame(null)).toBeNull();
    expect(asAiStreamFrame({ t: "nope", d: "x" })).toBeNull();
    expect(asAiStreamFrame({ t: "result", d: { move: "c5" } })).toBeNull();
    expect(asAiStreamFrame({ t: "result", d: { move: "c5", commentary: "", source: "x" } })).toBeNull();
    expect(asAiStreamFrame({ t: "status", d: 3 })).toBeNull();
  });

  it("decodes NDJSON split across chunk boundaries and skips junk lines", async () => {
    const payload =
      encodeFrame({ t: "status", d: "agent" }) +
      "not json\n" +
      encodeFrame({ t: "result", d: result });
    const encoder = new TextEncoder();
    const bytes = encoder.encode(payload);
    // Split mid-line so the decoder has to buffer.
    const cut = Math.floor(bytes.length / 2);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });

    const frames = [];
    for await (const frame of readNdjson(stream)) frames.push(frame);
    expect(frames).toEqual([
      { t: "status", d: "agent" },
      { t: "result", d: result },
    ]);
  });

  it("yields a final frame that arrives without a trailing newline", async () => {
    const body = JSON.stringify({ t: "result", d: result });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    });
    const frames = [];
    for await (const frame of readNdjson(stream)) frames.push(frame);
    expect(frames).toEqual([{ t: "result", d: result }]);
  });
});
