// src/lib/engine/stockfish-client.ts
//
// Browser-only wrapper around BOTH shipped Stockfish builds, running in a CLASSIC
// worker loaded by URL string from /public (constants.STOCKFISH_WORKER_URLS):
//
//   sf18 (default) — stockfish@18.0.8 `lite-single`, needs WASM SIMD
//   sf11 (fallback) — stockfish@11.0.0, for browsers without WASM SIMD
//
// One wrapper serves both because the parts this file uses are identical: plain-string
// output lines, `MultiPV`, `Skill Level` 0..20, `ucinewgame`, `position fen`, `go depth`,
// `stop` -> `bestmove`. We never send `UCI_Elo`/`UCI_LimitStrength` (SF11 has neither and
// on SF18 it would override `Skill Level`), and never `Threads`/`Hash` (pinned on both).
//
// Never `new Worker(new URL(...))`: under Turbopack that appends a `#params=[...]`
// fragment, and BOTH glues treat `self.location.hash` as the override path for the
// sibling `.wasm` (stockfish.md §3.2 and §11.3 + nextjs16-shadcn.md §4b). The `.wasm` is
// resolved automatically as the sibling of the `.js`, so nothing else needs configuring.
//
// Per-build differences this file handles:
//   * SF18 exposes a download-progress `MessagePort` (`postMessage({progressPort})`,
//     stockfish.md §4) — wired to `onProgress` so the 5.6 MB first load shows real
//     progress. SF11 has no such channel and stays indeterminate.
//   * SF18's glue queues `go`/`setoption` internally; SF11's does not. Searches are
//     serialised here either way, which satisfies both.
// Relative, not "@/…": these are VALUE imports and the vitest node runner has no
// path-alias resolver (type-only "@/…" imports are erased and stay fine).
import { STOCKFISH_WORKER_URLS, type EngineBuild } from "../constants";
import type { EngineStatus } from "../types";
import { detectEngineBuild } from "./engine-build";
import { PvCollector, isBestMove, isReadyOk, isUciOk, parseBestMove, type PvLine } from "./parse-uci";

/** Handshake budget. Cold load measured at ~108 ms (SF11) / ~350 ms (SF18, warm). */
export const ENGINE_INIT_TIMEOUT_MS = 20_000;
const READY_TIMEOUT_MS = 10_000;
/** `stop` -> `bestmove` was measured at ~180 ms; 4 s is a generous ceiling. */
const BESTMOVE_GRACE_MS = 4_000;
/** How long a released engine lingers before `terminate()` (StrictMode remount). */
export const ENGINE_DISPOSE_DELAY_MS = 400;

export interface SearchRequest {
  fen: string;
  /** UCI `go depth`. */
  depth: number;
  /** UCI `MultiPV` (1..500). */
  multiPv: number;
  /** UCI `Skill Level` (0..20). Pass 20 for honest candidate ranking. */
  skillLevel?: number;
  /** Client-side hard `stop` timer. */
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface SearchResult {
  /** UCI long algebraic, or null for `bestmove (none)` (mate/stalemate). */
  bestmove: string | null;
  ponder: string | null;
  lines: PvLine[];
  elapsedMs: number;
  /** True when the client-side timer (or an abort) cut the search short. */
  stopped: boolean;
}

/** Download progress for the wasm, normalised for the UI. */
export interface EngineProgress {
  /** 0..100. The glue reports a 0..1 fraction; it is scaled here. */
  percent: number;
  loadedBytes: number;
  totalBytes: number;
}

export class EngineUnavailableError extends Error {
  constructor(message = "engine-unavailable") {
    super(message);
    this.name = "EngineUnavailableError";
  }
}

type LineListener = (line: string) => void;
type StatusListener = (status: EngineStatus) => void;
type ProgressListener = (progress: EngineProgress) => void;
interface Pending {
  fail(error: Error): void;
}

export class StockfishEngine {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly lineListeners = new Set<LineListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly progressListeners = new Set<ProgressListener>();
  private readonly pending = new Set<Pending>();
  private currentStatus: EngineStatus = "idle";
  private lastProgress: EngineProgress | null = null;
  private disposed = false;
  private appliedMultiPv: number | null = null;
  private appliedSkillLevel: number | null = null;
  readonly url: string;

  constructor(
    /** Which shipped binary to boot. Defaults to the WASM-SIMD probe's answer. */
    readonly build: EngineBuild = detectEngineBuild(),
    url: string = STOCKFISH_WORKER_URLS[build],
  ) {
    this.url = url;
  }

  getStatus(): EngineStatus {
    return this.currentStatus;
  }

  /** Last download-progress snapshot, or null (SF11, or nothing reported yet). */
  getProgress(): EngineProgress | null {
    return this.lastProgress;
  }

  /** Subscribe to status transitions. Returns the unsubscribe function. */
  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /**
   * Subscribe to wasm download progress. SF18 only — SF11's glue has no progress
   * channel, so the listener simply never fires and the UI stays indeterminate.
   */
  onProgress(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    return () => {
      this.progressListeners.delete(listener);
    };
  }

  /**
   * Boot the worker and complete the UCI handshake. Idempotent; concurrent callers
   * share one promise. A failed init clears the promise so `init()` retries cleanly.
   */
  init(): Promise<void> {
    if (this.disposed) return Promise.reject(new EngineUnavailableError("engine-disposed"));
    if (this.readyPromise !== null) return this.readyPromise;
    if (typeof Worker === "undefined") {
      this.setStatus("error");
      return Promise.reject(new EngineUnavailableError("worker-unsupported"));
    }

    this.setStatus("loading");
    const promise = (async () => {
      const worker = new Worker(this.url);
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<unknown>) => {
        const line = String(event.data);
        for (const listener of [...this.lineListeners]) listener(line);
      };
      worker.onerror = () => {
        this.failAll(new EngineUnavailableError("worker-error"));
      };
      this.attachProgressPort(worker);
      try {
        await this.expect(isUciOk, () => this.send("uci"), ENGINE_INIT_TIMEOUT_MS);
        await this.expect(isReadyOk, () => this.send("isready"), READY_TIMEOUT_MS);
        this.send("ucinewgame");
        await this.expect(isReadyOk, () => this.send("isready"), READY_TIMEOUT_MS);
        this.appliedMultiPv = null;
        this.appliedSkillLevel = null;
        this.setStatus("ready");
      } catch (error) {
        this.teardownWorker();
        this.readyPromise = null;
        this.setStatus("error");
        throw error instanceof Error ? error : new EngineUnavailableError();
      }
    })();
    this.readyPromise = promise;
    return promise;
  }

  /**
   * `ucinewgame` + `isready`. Clears the transposition table between games so
   * evals from the previous game cannot leak into this one (stockfish.md §9
   * rule 4). Enqueued synchronously — `init()` is awaited INSIDE the queued task
   * so a `search()` issued in the same tick can never overtake it.
   */
  newGame(): Promise<void> {
    return this.enqueue(async () => {
      await this.init();
      this.send("ucinewgame");
      await this.expect(isReadyOk, () => this.send("isready"), READY_TIMEOUT_MS);
      this.appliedMultiPv = null;
      this.appliedSkillLevel = null;
    });
  }

  /**
   * One search at a time. Sends `setoption` (only when the value changed),
   * `position fen`, then `go depth N` with a client-side `stop` timer.
   */
  search(request: SearchRequest): Promise<SearchResult> {
    return this.enqueue(() => this.runSearch(request));
  }

  /** Ask a running search to finish now; `bestmove` follows within ~200 ms. */
  stop(): void {
    if (this.worker !== null) this.send("stop");
  }

  /** Terminate the worker (NFR-3: never leave the engine resident after unmount). */
  dispose(): void {
    this.disposed = true;
    this.failAll(new EngineUnavailableError("engine-disposed"));
    this.teardownWorker();
    this.readyPromise = null;
    this.lineListeners.clear();
    this.lastProgress = null;
    // Only here — with the worker actually terminated — is "idle" the truth. A
    // consumer that merely unmounts must NOT reset the status while other
    // consumers still hold the shared engine (review AI-7); `releaseEngine()`
    // returns the remaining refcount so `use-stockfish` can tell the difference.
    this.setStatus("idle");
    this.statusListeners.clear();
    this.progressListeners.clear();
  }

  /* --------------------------------------------------------------- internals */

  /**
   * SF18 only: hand the glue one end of a `MessageChannel` and it streams
   * `{percent, loaded, total, …}` objects while it fetches the 7.3 MB wasm
   * (stockfish.md §4; `percent` is a 0..1 FRACTION — verified in the shipped glue:
   * `{percent: e/n, loaded: e, total: n, …}` — and the port self-closes at 1).
   * Posted immediately after `new Worker` so it is the first message the glue sees.
   */
  private attachProgressPort(worker: Worker): void {
    if (this.build !== "sf18") return;
    if (typeof MessageChannel === "undefined") return;
    try {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event: MessageEvent<unknown>) => {
        const progress = toProgress(event.data);
        if (progress === null) return;
        this.lastProgress = progress;
        for (const listener of [...this.progressListeners]) listener(progress);
      };
      worker.postMessage({ progressPort: channel.port2 }, [channel.port2]);
    } catch {
      // A browser that refuses the transfer just means no progress bar.
    }
  }

  private async runSearch(request: SearchRequest): Promise<SearchResult> {
    await this.init();
    throwIfAborted(request.signal);

    const multiPv = clamp(Math.trunc(request.multiPv), 1, 500);
    const skillLevel = clamp(Math.trunc(request.skillLevel ?? 20), 0, 20);
    let optionsChanged = false;
    if (this.appliedMultiPv !== multiPv) {
      this.send(`setoption name MultiPV value ${multiPv}`);
      this.appliedMultiPv = multiPv;
      optionsChanged = true;
    }
    if (this.appliedSkillLevel !== skillLevel) {
      this.send(`setoption name Skill Level value ${skillLevel}`);
      this.appliedSkillLevel = skillLevel;
      optionsChanged = true;
    }
    if (optionsChanged) {
      await this.expect(isReadyOk, () => this.send("isready"), READY_TIMEOUT_MS);
    }

    const collector = new PvCollector();
    const collect: LineListener = (line) => {
      collector.accept(line);
    };
    this.lineListeners.add(collect);

    let stopped = false;
    const startedAt = Date.now();
    const requestStop = () => {
      if (stopped) return;
      stopped = true;
      this.send("stop");
    };
    const stopTimer = setTimeout(requestStop, Math.max(50, request.timeoutMs));
    request.signal?.addEventListener("abort", requestStop, { once: true });

    try {
      this.send(`position fen ${request.fen}`);
      const line = await this.expect(
        isBestMove,
        () => this.send(`go depth ${Math.max(1, Math.trunc(request.depth))}`),
        Math.max(50, request.timeoutMs) + BESTMOVE_GRACE_MS,
      );
      const parsed = parseBestMove(line);
      return {
        bestmove: parsed?.bestmove ?? null,
        ponder: parsed?.ponder ?? null,
        lines: collector.lines(),
        elapsedMs: Date.now() - startedAt,
        stopped,
      };
    } finally {
      clearTimeout(stopTimer);
      request.signal?.removeEventListener("abort", requestStop);
      this.lineListeners.delete(collect);
    }
  }

  /** Serialises every command sequence; the SF11 glue does no queueing of its own. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private send(command: string): void {
    this.worker?.postMessage(command);
  }

  private expect(
    match: (line: string) => boolean,
    run: () => void,
    timeoutMs: number,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const entry: Pending = {
        fail: (error) => {
          finish();
          reject(error);
        },
      };
      const listener: LineListener = (line) => {
        if (!match(line)) return;
        finish();
        resolve(line);
      };
      const timer = setTimeout(() => {
        entry.fail(new EngineUnavailableError(`stockfish-timeout:${timeoutMs}ms`));
      }, timeoutMs);
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.lineListeners.delete(listener);
        this.pending.delete(entry);
      };

      this.lineListeners.add(listener);
      this.pending.add(entry);
      try {
        run();
      } catch (error) {
        entry.fail(error instanceof Error ? error : new EngineUnavailableError());
      }
    });
  }

  private failAll(error: Error): void {
    for (const entry of [...this.pending]) entry.fail(error);
    if (!this.disposed) this.setStatus("error");
  }

  private teardownWorker(): void {
    const worker = this.worker;
    this.worker = null;
    this.appliedMultiPv = null;
    this.appliedSkillLevel = null;
    if (worker === null) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }

  private setStatus(status: EngineStatus): void {
    if (this.currentStatus === status) return;
    this.currentStatus = status;
    for (const listener of [...this.statusListeners]) listener(status);
  }
}

/* ------------------------------------------------- refcounted shared instance */
// One worker for the whole app: creating a second costs another 64 MB of wasm
// memory for no benefit (only one search can run at a time anyway). Release is
// deferred by ENGINE_DISPOSE_DELAY_MS so React StrictMode's mount/unmount/mount
// and a fast route change reuse the same booted engine instead of paying for a
// second cold start.

let sharedEngine: StockfishEngine | null = null;
let refCount = 0;
let disposeTimer: ReturnType<typeof setTimeout> | null = null;
const changeListeners = new Set<(engine: StockfishEngine) => void>();

/**
 * @param build pins the binary for a shared engine that has to be CREATED here
 * (the sf18 -> sf11 downgrade in `use-stockfish`). Ignored when one already
 * exists — use {@link swapSharedEngine} to replace a live engine.
 */
export function acquireEngine(build?: EngineBuild): StockfishEngine {
  if (disposeTimer !== null) {
    clearTimeout(disposeTimer);
    disposeTimer = null;
  }
  sharedEngine ??= new StockfishEngine(build);
  refCount += 1;
  return sharedEngine;
}

/**
 * Subscribe to shared-engine REPLACEMENTS (see {@link swapSharedEngine}). Every
 * mounted consumer must re-point through this: the old instance is disposed, so a
 * consumer that kept its own handle would search a dead worker.
 *
 * @returns the unsubscribe function.
 */
export function onSharedEngineChange(listener: (engine: StockfishEngine) => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

/**
 * Replace the shared engine with one booted from `build` and tell every consumer.
 *
 * This is the recovery path for "the default sf18 build cannot load at all" (a missing
 * or truncated 7.3 MB wasm, a device that cannot allocate it): sf11 ships alongside it
 * and runs everywhere, so a page session that would otherwise have NO engine — no AI
 * moves, no hints — downgrades once instead of failing.
 *
 * The refcount is deliberately CARRIED OVER: every consumer keeps exactly the one hold
 * it already had, so nobody's `releaseEngine()` goes missing and the replacement is not
 * torn down under a consumer that never released.
 */
export function swapSharedEngine(build: EngineBuild): StockfishEngine {
  const previous = sharedEngine;
  const next = new StockfishEngine(build);
  sharedEngine = next;
  previous?.dispose();
  for (const listener of [...changeListeners]) listener(next);
  return next;
}

/**
 * Drop one reference.
 *
 * @returns the number of consumers still holding the engine. `0` means this caller
 * was the last one and the worker is on its way out, so it is the ONLY case in
 * which a consumer may reset the shared engine status to "idle" (review AI-7 — the
 * hint button and the AI turn hook can hold the engine at the same time, and the
 * one that unmounts first used to blank the other's "ready" state).
 */
export function releaseEngine(): number {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0 || disposeTimer !== null) return refCount;
  disposeTimer = setTimeout(() => {
    disposeTimer = null;
    if (refCount > 0) return;
    sharedEngine?.dispose();
    sharedEngine = null;
  }, ENGINE_DISPOSE_DELAY_MS);
  return refCount;
}

/** Test/debug helper: the live shared engine, if any. */
export function peekSharedEngine(): StockfishEngine | null {
  return sharedEngine;
}

/** Drop the shared engine now, without waiting for the dispose timer, and forget
 *  every reference to it. Used by tests; a live downgrade uses {@link swapSharedEngine},
 *  which keeps the refcount instead of zeroing it. */
export function disposeSharedEngine(): void {
  if (disposeTimer !== null) {
    clearTimeout(disposeTimer);
    disposeTimer = null;
  }
  sharedEngine?.dispose();
  sharedEngine = null;
  refCount = 0;
}

/** `{percent, loaded, total}` from the SF18 glue -> a UI-friendly 0..100 percent. */
function toProgress(data: unknown): EngineProgress | null {
  if (typeof data !== "object" || data === null) return null;
  const raw = data as { percent?: unknown; loaded?: unknown; total?: unknown };
  if (typeof raw.loaded !== "number" || typeof raw.total !== "number") return null;
  const fraction =
    typeof raw.percent === "number" && Number.isFinite(raw.percent)
      ? raw.percent
      : raw.total > 0
        ? raw.loaded / raw.total
        : 0;
  return {
    percent: clamp(Math.round(fraction * 100), 0, 100),
    loadedBytes: Math.max(0, raw.loaded),
    totalBytes: Math.max(0, raw.total),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new EngineUnavailableError("aborted");
}
