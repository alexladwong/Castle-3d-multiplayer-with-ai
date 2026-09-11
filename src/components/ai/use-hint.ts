"use client";
// src/components/ai/use-hint.ts  [U2]
// FR-40's request pipeline, lifted out of the old <HintButton /> so the Chat
// composer (UI_REDESIGN §5.1) and the action bar can both fire it while the
// three-per-game cap is still charged server-side by /api/ai/hint.
//
// Nothing here renders: the shell owns the button, this owns the round trip
// (shallow local search → POST → ai-store).
import { useCallback } from "react";
import { toast } from "sonner";
import { MAX_HINTS_PER_GAME } from "@/lib/constants";
import { postAiHint } from "@/lib/engine/ai-client";
import { linesToCandidates } from "@/lib/engine/candidates";
import { useStockfish } from "@/lib/engine/use-stockfish";
import { useAiStore } from "@/lib/stores/ai-store";
import type { Candidate, GameId } from "@/lib/types";

/** A hint search is shallower than a real AI turn — it must feel instant. */
const HINT_DEPTH = 12;
const HINT_MULTI_PV = 3;
const HINT_SEARCH_TIMEOUT_MS = 1_500;

export interface UseHintOptions {
  gameId: GameId;
  /** Position to advise on — the LIVE fen, never a reviewed one. */
  fen: string;
  /** Mount the engine only where hints are actually offered. */
  enabled: boolean;
}

export interface HintApi {
  pending: boolean;
  request(): void;
}

export function useHint({ gameId, fen, enabled }: UseHintOptions): HintApi {
  const { search } = useStockfish(enabled);
  const pending = useAiStore((s) => s.hintPending);

  const request = useCallback(() => {
    const store = useAiStore.getState();
    if (store.hintPending) return;
    store.setHintPending(true);
    store.setHint(null);

    void (async () => {
      try {
        let candidates: Candidate[] = [];
        try {
          const result = await search({
            fen,
            depth: HINT_DEPTH,
            multiPv: HINT_MULTI_PV,
            skillLevel: 20,
            timeoutMs: HINT_SEARCH_TIMEOUT_MS,
          });
          candidates = linesToCandidates(fen, result.lines);
        } catch {
          // No engine: the route falls back to the legal-move list.
        }
        const result = await postAiHint({ gameId, candidates });
        useAiStore.getState().setHint(result);
      } catch (error) {
        useAiStore.getState().setHint(null);
        toast.error(hintErrorMessage(error));
      } finally {
        useAiStore.getState().setHintPending(false);
      }
    })();
  }, [fen, gameId, search]);

  return { pending, request };
}

export function hintErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  if (raw.includes("hint-limit")) return `No hints left — ${MAX_HINTS_PER_GAME} per game.`;
  if (raw.includes("hints-unavailable")) return "Hints are only available on Beginner and Casual.";
  if (raw.includes("game-not-active")) return "This game has finished.";
  if (raw.includes("not-your-turn")) return "Wait for your turn to ask for a hint.";
  return "Could not fetch a hint. Try again.";
}
