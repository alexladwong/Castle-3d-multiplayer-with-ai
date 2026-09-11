// src/lib/stores/ai-store.ts
"use client";
import { create } from "zustand";
import type { AiPhase, EngineStatus, HintResult } from "../types";

export interface AiState {
  engineStatus: EngineStatus;
  /** 0..100 while the 5.6 MB wasm downloads (first AI game only). */
  downloadPercent: number;
  phase: AiPhase;
  /** Commentary text streamed from /api/ai/move for the CURRENT turn. */
  streamingCommentary: string;
  lastSource: "eve" | "fallback" | null;
  /** ms the last AI turn took, for the "still thinking" hint. */
  lastLatencyMs: number | null;
  hint: HintResult | null;
  hintPending: boolean;
  error: string | null;

  setEngineStatus(status: EngineStatus): void;
  setDownloadPercent(percent: number): void;
  setPhase(phase: AiPhase): void;
  appendCommentary(delta: string): void;
  finishTurn(source: "eve" | "fallback", latencyMs: number): void;
  resetTurn(): void;
  setHint(hint: HintResult | null): void;
  setHintPending(pending: boolean): void;
  setError(error: string | null): void;
}

export const useAiStore = create<AiState>()((set) => ({
  engineStatus: "idle",
  downloadPercent: 0,
  phase: "idle",
  streamingCommentary: "",
  lastSource: null,
  lastLatencyMs: null,
  hint: null,
  hintPending: false,
  error: null,

  setEngineStatus: (engineStatus) => set({ engineStatus }),
  setDownloadPercent: (downloadPercent) => set({ downloadPercent }),
  setPhase: (phase) => set({ phase }),
  appendCommentary: (delta) => set((s) => ({ streamingCommentary: s.streamingCommentary + delta })),
  finishTurn: (lastSource, lastLatencyMs) => set({ phase: "idle", lastSource, lastLatencyMs }),
  resetTurn: () => set({ phase: "idle", streamingCommentary: "", error: null }),
  setHint: (hint) => set({ hint }),
  setHintPending: (hintPending) => set({ hintPending }),
  setError: (error) => set({ error, phase: "idle" }),
}));
