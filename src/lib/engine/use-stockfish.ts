"use client";
// src/lib/engine/use-stockfish.ts
//
// Owns the Stockfish worker for the lifetime of an AI game. Lazy (nothing is
// fetched until `enabled` is true), shared through the refcounted singleton in
// stockfish-client.ts, and terminated on unmount (NFR-3, §I-1).
//
// Engine status is mirrored into the zustand ai-store rather than React state:
// `react-hooks/set-state-in-effect` is an error in this repo (§D.12 rule 6), and a
// store write from an effect or a worker callback is explicitly allowed.
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAiStore } from "@/lib/stores/ai-store";
import { useUiStore } from "@/lib/stores/ui-store";
import type { EngineStatus } from "@/lib/types";
import {
  acquireEngine,
  onSharedEngineChange,
  peekSharedEngine,
  releaseEngine,
  swapSharedEngine,
  EngineUnavailableError,
  type EngineProgress,
  type SearchRequest,
  type SearchResult,
  type StockfishEngine,
} from "./stockfish-client";

/** The "compatibility engine" notice is per page session, not per mount. */
let fallbackToastShown = false;
/** The sf18 -> sf11 downgrade happens at most ONCE per page session. */
let sf18Failed = false;

/**
 * Warm the wasm, and recover from a dead sf18 build.
 *
 * sf18 is a 7.3 MB asset: if it 404s from a bad deploy, the download is cut off, or the
 * device cannot allocate the NNUE memory, `init()` rejects and — without this — every
 * later `init()` (including the retry button's) would hit the same URL forever, leaving
 * the game with no candidate generation and no hints while sf11 sat unused on disk.
 * The first such failure swaps the SHARED engine to sf11; `onSharedEngineChange` re-points
 * every mounted consumer, which boots the replacement. Never more than one downgrade,
 * and never for sf11 itself — there is nothing left to fall back to.
 */
function bootEngine(engine: StockfishEngine): void {
  void engine.init().catch(() => {
    if (sf18Failed || engine.build !== "sf18") return;
    // A stale handle (the engine was already replaced or disposed) must not resurrect it.
    if (peekSharedEngine() !== engine) return;
    sf18Failed = true;
    swapSharedEngine("sf11");
  });
}

function showFallbackToast(): void {
  if (fallbackToastShown) return;
  fallbackToastShown = true;
  toast("Using the compatibility engine", {
    description: sf18Failed
      ? "The full engine could not load, so a smaller, older Stockfish took over."
      : "This browser has no WebAssembly SIMD, so a smaller, older Stockfish is used.",
  });
}

export interface UseStockfish {
  /** Run one search. Rejects with {@link EngineUnavailableError} when disabled/broken. */
  search(request: SearchRequest): Promise<SearchResult>;
  /** `ucinewgame`: clear the transposition table before a NEW game reuses the
   *  shared worker (stockfish.md §9 rule 4). Resolves even when disabled. */
  newGame(): Promise<void>;
  /** Ask a running search to finish now. */
  stop(): void;
  /** Re-run the UCI handshake after a failed load (the retry button). */
  retry(): void;
  /** Live engine handle, or null when the hook is disabled. */
  engineRef: React.RefObject<StockfishEngine | null>;
}

/**
 * @param enabled true only for `game.mode === "ai"` — never boot the engine for
 *                online, local or spectated games.
 */
export function useStockfish(enabled: boolean): UseStockfish {
  const engineRef = useRef<StockfishEngine | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const publish = (status: EngineStatus) => {
      useAiStore.getState().setEngineStatus(status);
    };
    const publishProgress = (progress: EngineProgress) => {
      useAiStore.getState().setDownloadPercent(progress.percent);
    };

    // Subscribing is per ENGINE INSTANCE, and a failed sf18 load replaces the shared
    // instance mid-flight, so attach/detach are factored out and run again on a swap.
    let detach: (() => void) | null = null;
    const attach = (engine: StockfishEngine) => {
      engineRef.current = engine;
      publish(engine.getStatus());
      useUiStore.getState().setEngineBuild(engine.build);
      const lastProgress = engine.getProgress();
      if (lastProgress !== null) publishProgress(lastProgress);
      const unsubscribe = engine.onStatus(publish);
      // SF18 streams real download progress over a MessagePort; SF11 never fires this
      // and `engine-loading.tsx` stays on its indeterminate bar.
      const unsubscribeProgress = engine.onProgress(publishProgress);
      if (engine.build === "sf11") showFallbackToast();
      detach = () => {
        unsubscribe();
        unsubscribeProgress();
      };
      // Warm the wasm as soon as the AI game mounts so the first move does not pay
      // for the cold load. Failures surface through the status subscription.
      bootEngine(engine);
    };

    attach(acquireEngine());
    // The refcount is carried across a swap, so this must NOT re-acquire or re-release.
    const unsubscribeSwap = onSharedEngineChange((next) => {
      detach?.();
      attach(next);
    });

    return () => {
      unsubscribeSwap();
      detach?.();
      engineRef.current = null;
      // The engine is REFCOUNTED and shared (the hint button holds it too), so only
      // the last consumer out may blank the status — otherwise unmounting one of two
      // consumers would put a perfectly healthy engine back on "Loading…" in the
      // other's UI (review AI-7). A remaining count of 0 means the shared worker is
      // on its way to `dispose()`, which sets "idle" itself if a re-acquire does not
      // cancel it first.
      if (releaseEngine() === 0) {
        useAiStore.getState().setEngineStatus("idle");
        useAiStore.getState().setDownloadPercent(0);
      }
    };
  }, [enabled]);

  const search = useCallback(async (request: SearchRequest): Promise<SearchResult> => {
    const engine = engineRef.current;
    if (engine === null) throw new EngineUnavailableError("engine-not-mounted");
    return await engine.search(request);
  }, []);

  const newGame = useCallback(async (): Promise<void> => {
    const engine = engineRef.current;
    if (engine === null) return;
    // A failed handshake already surfaces through the status subscription, and a
    // game must never fail to start because the TT could not be cleared.
    await engine.newGame().catch(() => undefined);
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  const retry = useCallback(() => {
    const engine = engineRef.current;
    if (engine === null) return;
    // Same handler as the mount warm: a retry that hits a dead sf18 build downgrades
    // instead of re-fetching the same broken 7.3 MB asset.
    bootEngine(engine);
  }, []);

  return { search, newGame, stop, retry, engineRef };
}
