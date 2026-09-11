// @vitest-environment node
// src/lib/engine/__tests__/stockfish-client.test.ts
//
// The wrapper itself (worker lifecycle, UCI sequencing, the SF18 progress port and the
// refcounted shared instance) against a fake Worker that speaks the same protocol both
// shipped builds speak. The REAL engines are exercised separately: both
// stockfish@18.0.8 lite-single and stockfish@11.0.0 were driven through this exact
// command sequence in Node and their output parsed by `parse-uci.ts` (see the §I-1
// note in docs/ARCHITECTURE.md).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  StockfishEngine,
  acquireEngine,
  onSharedEngineChange,
  peekSharedEngine,
  releaseEngine,
  disposeSharedEngine,
  swapSharedEngine,
} from "../stockfish-client";
import { detectEngineBuild, hasWasmSimd, resetEngineBuildDetection } from "../engine-build";
import { STOCKFISH_WORKER_URLS } from "../../constants";

/** Minimal stand-in for the two engine glues: plain-string lines, one command per post. */
class FakeWorker {
  static last: FakeWorker | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly commands: string[] = [];
  progressPort: MessagePort | null = null;
  terminated = false;

  constructor(readonly url: string) {
    FakeWorker.last = this;
  }

  postMessage(data: unknown, transfer?: unknown[]): void {
    void transfer;
    if (typeof data === "object" && data !== null && "progressPort" in data) {
      this.progressPort = (data as { progressPort: MessagePort }).progressPort;
      return;
    }
    const command = String(data);
    this.commands.push(command);
    if (command === "uci") {
      this.emit("id name Fake Stockfish");
      this.emit("uciok");
    } else if (command === "isready") {
      this.emit("readyok");
    } else if (command.startsWith("go ")) {
      this.emit(
        "info depth 6 seldepth 8 multipv 1 score cp -26 nodes 100 nps 1000 time 5 pv e7e6 d2d4",
      );
      this.emit("bestmove e7e6 ponder d2d4");
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  private emit(line: string): void {
    queueMicrotask(() => {
      this.onmessage?.({ data: line } as MessageEvent<unknown>);
    });
  }
}

const START_BLACK = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

beforeEach(() => {
  FakeWorker.last = null;
  (globalThis as { Worker?: unknown }).Worker = FakeWorker;
});

afterEach(() => {
  disposeSharedEngine();
  delete (globalThis as { Worker?: unknown }).Worker;
  resetEngineBuildDetection();
  vi.useRealTimers();
});

describe("engine build detection", () => {
  it("validates the wasm-feature-detect SIMD probe on a SIMD-capable runtime", () => {
    // Node 24 has WASM SIMD, so the byte sequence copied from wasm-feature-detect
    // must validate — the same probe returns false on a browser without SIMD.
    expect(hasWasmSimd()).toBe(true);
    expect(detectEngineBuild()).toBe("sf18");
  });

  it("falls back to sf11 when WebAssembly.validate is unavailable", () => {
    const original = WebAssembly.validate;
    try {
      resetEngineBuildDetection();
      // @ts-expect-error — deliberately breaking the global for the fallback path.
      WebAssembly.validate = undefined;
      expect(hasWasmSimd()).toBe(false);
      expect(detectEngineBuild()).toBe("sf11");
    } finally {
      WebAssembly.validate = original;
      resetEngineBuildDetection();
    }
  });

  it("maps each build to its committed worker URL", () => {
    expect(STOCKFISH_WORKER_URLS.sf18).toBe("/stockfish/sf18/stockfish-18-lite-single.js");
    expect(STOCKFISH_WORKER_URLS.sf11).toBe("/stockfish/sf11/stockfish.js");
    expect(new StockfishEngine("sf18").url).toBe(STOCKFISH_WORKER_URLS.sf18);
    expect(new StockfishEngine("sf11").url).toBe(STOCKFISH_WORKER_URLS.sf11);
  });
});

describe("StockfishEngine handshake", () => {
  it("completes uci -> isready -> ucinewgame -> isready and reports ready", async () => {
    const engine = new StockfishEngine("sf18");
    const seen: string[] = [];
    engine.onStatus((status) => seen.push(status));
    await engine.init();
    expect(FakeWorker.last?.commands).toEqual(["uci", "isready", "ucinewgame", "isready"]);
    expect(engine.getStatus()).toBe("ready");
    expect(seen).toEqual(["loading", "ready"]);
    engine.dispose();
    expect(FakeWorker.last?.terminated).toBe(true);
  });

  it("is idempotent — a second init reuses the same worker", async () => {
    const engine = new StockfishEngine("sf11");
    await engine.init();
    const worker = FakeWorker.last;
    await engine.init();
    expect(FakeWorker.last).toBe(worker);
    engine.dispose();
  });
});

describe("newGame (review AI-8)", () => {
  it("sends ucinewgame + isready and re-applies the search options afterwards", async () => {
    const engine = new StockfishEngine("sf18");
    await engine.init();
    await engine.search({ fen: START_BLACK, depth: 6, multiPv: 3, skillLevel: 20, timeoutMs: 500 });
    const worker = FakeWorker.last;
    expect(worker?.commands).toContain("setoption name MultiPV value 3");

    // Same options again inside one game: not re-sent.
    worker!.commands.length = 0;
    await engine.search({ fen: START_BLACK, depth: 6, multiPv: 3, skillLevel: 20, timeoutMs: 500 });
    expect(worker?.commands.filter((c) => c.startsWith("setoption"))).toEqual([]);

    // A NEW game clears the transposition table and the cached option values, so the
    // next search re-sends them (stockfish.md §9 rule 4).
    worker!.commands.length = 0;
    await engine.newGame();
    expect(worker?.commands).toEqual(["ucinewgame", "isready"]);

    worker!.commands.length = 0;
    await engine.search({ fen: START_BLACK, depth: 6, multiPv: 3, skillLevel: 20, timeoutMs: 500 });
    expect(worker?.commands).toContain("setoption name MultiPV value 3");
    expect(worker?.commands).toContain("setoption name Skill Level value 20");
    engine.dispose();
  });

  it("queues behind an in-flight search instead of interleaving commands", async () => {
    const engine = new StockfishEngine("sf18");
    await engine.init();
    const worker = FakeWorker.last!;
    worker.commands.length = 0;
    const search = engine.search({
      fen: START_BLACK,
      depth: 6,
      multiPv: 1,
      skillLevel: 20,
      timeoutMs: 500,
    });
    const fresh = engine.newGame();
    await Promise.all([search, fresh]);
    // `ucinewgame` must land AFTER `go`, never between `position` and `go`.
    expect(worker.commands.indexOf("ucinewgame")).toBeGreaterThan(
      worker.commands.findIndex((c) => c.startsWith("go ")),
    );
    engine.dispose();
  });
});

describe("search options (review AI-10)", () => {
  it("sends the requested Skill Level, so a weakened raw fallback is possible", async () => {
    const engine = new StockfishEngine("sf18");
    await engine.init();
    const worker = FakeWorker.last!;
    worker.commands.length = 0;
    const result = await engine.search({
      fen: START_BLACK,
      depth: 2,
      multiPv: 1,
      skillLevel: 1, // Beginner, PRD §3.8
      timeoutMs: 500,
    });
    expect(worker.commands).toContain("setoption name Skill Level value 1");
    expect(worker.commands).toContain("setoption name MultiPV value 1");
    expect(worker.commands).toContain(`position fen ${START_BLACK}`);
    expect(worker.commands).toContain("go depth 2");
    expect(result.bestmove).toBe("e7e6");
    expect(result.lines[0]).toMatchObject({ multipv: 1, depth: 6, scoreCp: -26 });
    engine.dispose();
  });

  it("clamps out-of-range option values", async () => {
    const engine = new StockfishEngine("sf11");
    await engine.init();
    const worker = FakeWorker.last!;
    worker.commands.length = 0;
    await engine.search({
      fen: START_BLACK,
      depth: 6,
      multiPv: 9_999,
      skillLevel: 99,
      timeoutMs: 500,
    });
    expect(worker.commands).toContain("setoption name MultiPV value 500");
    expect(worker.commands).toContain("setoption name Skill Level value 20");
    engine.dispose();
  });
});

describe("download progress (SF18 only)", () => {
  it("wires a MessagePort for sf18 and scales the 0..1 fraction to 0..100", async () => {
    const engine = new StockfishEngine("sf18");
    const seen: number[] = [];
    engine.onProgress((progress) => seen.push(progress.percent));
    await engine.init();
    const port = FakeWorker.last?.progressPort;
    expect(port).toBeDefined();

    await new Promise<void>((resolve) => {
      engine.onProgress(() => resolve());
      port!.postMessage({ percent: 0.5, loaded: 3_647_705, total: 7_295_411 });
    });
    expect(seen).toEqual([50]);
    expect(engine.getProgress()).toMatchObject({ percent: 50, totalBytes: 7_295_411 });
    engine.dispose();
  });

  it("never asks sf11 for progress (its glue has no such channel)", async () => {
    const engine = new StockfishEngine("sf11");
    await engine.init();
    expect(FakeWorker.last?.progressPort).toBeNull();
    expect(engine.getProgress()).toBeNull();
    engine.dispose();
  });
});

describe("refcounted shared engine (review AI-7)", () => {
  it("reports the consumers still holding the engine so only the last one resets status", () => {
    const first = acquireEngine();
    const second = acquireEngine();
    expect(second).toBe(first);
    // The hint button unmounts while the AI turn hook keeps playing: the engine must
    // stay alive AND the caller must be told not to reset the shared status.
    expect(releaseEngine()).toBe(1);
    expect(peekSharedEngine()).toBe(first);
    expect(releaseEngine()).toBe(0);
  });

  it("never drops below zero and hands out a fresh engine after disposal", () => {
    acquireEngine();
    expect(releaseEngine()).toBe(0);
    expect(releaseEngine()).toBe(0);
    const before = peekSharedEngine();
    disposeSharedEngine();
    const after = acquireEngine();
    expect(after).not.toBe(before);
  });

  it("keeps the booted worker alive across a release/re-acquire inside the grace window", async () => {
    const engine = acquireEngine();
    await engine.init();
    const worker = FakeWorker.last;
    expect(releaseEngine()).toBe(0);
    // Re-acquired before ENGINE_DISPOSE_DELAY_MS elapses (StrictMode remount).
    expect(acquireEngine()).toBe(engine);
    expect(worker?.terminated).toBe(false);
    expect(engine.getStatus()).toBe("ready");
  });

  it("pins the build when it has to CREATE the shared engine, and ignores it otherwise", () => {
    // The sf18 -> sf11 downgrade needs to say which binary to boot; a second consumer
    // must still get the one live engine rather than a second worker.
    const engine = acquireEngine("sf11");
    expect(engine.build).toBe("sf11");
    expect(acquireEngine("sf18")).toBe(engine);
    expect(engine.build).toBe("sf11");
  });
});

describe("sf18 -> sf11 downgrade (swapSharedEngine)", () => {
  it("replaces the shared engine, disposes the old worker and notifies consumers", async () => {
    const dead = acquireEngine("sf18");
    acquireEngine(); // a second consumer (the hint button) holding the same engine
    await dead.init();
    const deadWorker = FakeWorker.last;

    const seen: StockfishEngine[] = [];
    const unsubscribe = onSharedEngineChange((engine) => seen.push(engine));
    const next = swapSharedEngine("sf11");
    unsubscribe();

    expect(next).not.toBe(dead);
    expect(next.build).toBe("sf11");
    expect(next.url).toBe(STOCKFISH_WORKER_URLS.sf11);
    expect(peekSharedEngine()).toBe(next);
    expect(deadWorker?.terminated).toBe(true);
    // Every mounted consumer is told once, so nobody keeps searching the dead worker.
    expect(seen).toEqual([next]);
  });

  it("carries the refcount over, so the replacement outlives the other consumer's release", () => {
    acquireEngine("sf18");
    acquireEngine();
    const next = swapSharedEngine("sf11");
    // Two consumers still hold it: the first release must NOT schedule a dispose.
    expect(releaseEngine()).toBe(1);
    expect(peekSharedEngine()).toBe(next);
    expect(releaseEngine()).toBe(0);
  });

  it("stops notifying after unsubscribe", () => {
    acquireEngine("sf18");
    let calls = 0;
    const unsubscribe = onSharedEngineChange(() => {
      calls += 1;
    });
    unsubscribe();
    swapSharedEngine("sf11");
    expect(calls).toBe(0);
  });
});
