// src/lib/stores/tutor-store.ts
// What the tutor is currently drawing on the board, and whether its panel is open.
// The panel writes; `useGameController` (and the mock controller) read `annotations`
// into `BoardViewProps`, so both boards stay pure functions of their props.
import { create } from "zustand";
import type { BoardAnnotations } from "../tutor/annotations";
import { drawingHasExpired } from "../tutor/position-context";

export interface TutorState {
  /** The drawing on the board right now, or null for a clean board. */
  annotations: BoardAnnotations | null;
  /** Which message / chip put it there, so the panel can show the active toggle. */
  sourceId: string | null;
  /** Desktop column open (≥1280) or the overlay/sheet open below that. */
  panelOpen: boolean;
  originMoves: string[] | null;
  automaticKey: string | null;
  expiredMessageId: string | null;
  setAnnotations(annotations: BoardAnnotations | null, sourceId?: string | null, moves?: string[]): void;
  showAutomatic(annotations: BoardAnnotations, sourceId: string, key: string, origin: string[], moves: string[]): void;
  reconcileMoves(moves: string[]): void;
  clearAnnotations(): void;
  setPanelOpen(open: boolean): void;
}

export const useTutorStore = create<TutorState>()((set, get) => ({
  annotations: null,
  sourceId: null,
  panelOpen: true,
  originMoves: null,
  automaticKey: null,
  expiredMessageId: null,
  setAnnotations: (annotations, sourceId = null, moves) => set({ annotations, sourceId, originMoves: moves ? [...moves] : null }),
  showAutomatic: (annotations, sourceId, key, origin, moves) => {
    const state = get();
    if (state.automaticKey === key || state.expiredMessageId === sourceId) return;
    set({ automaticKey: key });
    if (drawingHasExpired(annotations, origin, moves)) {
      set({ annotations: null, sourceId: null, originMoves: null, expiredMessageId: sourceId });
      return;
    }
    set({ annotations, sourceId, originMoves: [...origin], expiredMessageId: null });
  },
  reconcileMoves: (moves) => {
    const { annotations, sourceId, originMoves } = get();
    if (annotations && originMoves && drawingHasExpired(annotations, originMoves, moves)) {
      set({ annotations: null, sourceId: null, originMoves: null, expiredMessageId: sourceId?.split("#")[0] ?? null });
    }
  },
  clearAnnotations: () => set({ annotations: null, sourceId: null, originMoves: null }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
}));
