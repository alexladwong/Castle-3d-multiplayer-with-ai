// src/lib/stores/ui-store.ts
"use client";
import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import type {
  BoardView, CameraPresetId, Colour, PlayerSettings, QualityTier,
  ResolvedQualityTier, RoomColors, RoomPresetId,
} from "../types";
import { autoQualityTier, dropTier } from "../camera";
import { DEFAULT_ROOM } from "../rooms";
import { SETTINGS_STORAGE_KEY, type EngineBuild } from "../constants";

/**
 * The game screen's two shapes (UI_REDESIGN §5.2). `focus` hides the header and
 * the sidebar and gives the board the whole viewport; it is chosen per session,
 * never persisted — a reload starts back in the normal layout.
 */
export type LayoutMode = "default" | "focus";

export interface UiState {
  /** True once settings from `players.me` have been merged in — gates the 3D mount
   *  so SSR defaults never cause a hydration mismatch. */
  hydrated: boolean;
  /** null until the WebGL probe has run on the client. */
  webglAvailable: boolean | null;

  // persisted settings (mirrored to Convex `players`)
  boardView: BoardView;
  roomPreset: RoomPresetId;
  roomColors: RoomColors | null;
  boardFlipEnabled: boolean;
  qualityTier: QualityTier;
  postFxEnabled: boolean;

  // session-only view state
  resolvedTier: ResolvedQualityTier;
  cameraPreset: CameraPresetId;
  cinematic: boolean;
  reducedMotion: boolean;
  orientation: Colour;
  historyDrawerOpen: boolean;
  settingsDrawerOpen: boolean;
  /** UI_REDESIGN §5.2 board-focus layout. Session-only: NOT in `partialize`. */
  layoutMode: LayoutMode;
  /** FR-21k: signed Convex storage URL for the player's uploaded backdrop, mirrored from
   *  `players.me`. Session-only — the URL expires, so it never goes to localStorage. */
  roomImageUrl: string | null;
  /** Which Stockfish binary the worker booted from ("sf18" by default, "sf11" on a
   *  browser without WASM SIMD), or null before an AI game has mounted the engine.
   *  Session-only and NOT a user setting — it is detected, shown in the AI-move
   *  source badge, and never persisted. */
  engineBuild: EngineBuild | null;

  hydrateFromServer(settings: PlayerSettings): void;
  markHydrated(): void;
  setWebglAvailable(ok: boolean): void;
  setBoardView(view: BoardView): void;
  setRoomPreset(preset: RoomPresetId): void;
  setRoomColors(colors: RoomColors | null): void;
  setBoardFlipEnabled(on: boolean): void;
  setQualityTier(tier: QualityTier): void;
  setPostFxEnabled(on: boolean): void;
  setCameraPreset(preset: CameraPresetId): void;
  setCinematic(on: boolean): void;
  setReducedMotion(on: boolean): void;
  setOrientation(colour: Colour): void;
  setRoomImageUrl(url: string | null): void;
  setEngineBuild(build: EngineBuild | null): void;
  autoDetectTier(input: Parameters<typeof autoQualityTier>[0]): void;
  degradeTier(): void;
  setHistoryDrawerOpen(open: boolean): void;
  setSettingsDrawerOpen(open: boolean): void;
  setLayoutMode(mode: LayoutMode): void;
}

export const useUiStore = create<UiState>()(
  devtools(
    persist(
      (set, get) => ({
        hydrated: false,
        webglAvailable: null,

        boardView: "3d",
        roomPreset: DEFAULT_ROOM,
        roomColors: null,
        boardFlipEnabled: true,
        qualityTier: "auto",
        postFxEnabled: true,

        resolvedTier: "medium",
        cameraPreset: "white",
        cinematic: false,
        reducedMotion: false,
        orientation: "w",
        historyDrawerOpen: false,
        settingsDrawerOpen: false,
        layoutMode: "default",
        roomImageUrl: null,
        engineBuild: null,

        // Convex wins over anything rehydrated from localStorage.
        hydrateFromServer: (s) =>
          set({
            ...s,
            hydrated: true,
            // keep the resolved tier in step with an explicit server-side choice;
            // "auto" is left to autoDetectTier() once the GPU probe has run.
            ...(s.qualityTier === "auto" ? {} : { resolvedTier: s.qualityTier }),
          }),
        markHydrated: () => set({ hydrated: true }),
        setWebglAvailable: (ok) =>
          set((st) => ({ webglAvailable: ok, boardView: ok ? st.boardView : "2d" })),
        setBoardView: (boardView) => set({ boardView }),
        setRoomPreset: (roomPreset) => set({ roomPreset }),
        setRoomColors: (roomColors) => set({ roomColors }),
        setBoardFlipEnabled: (boardFlipEnabled) => set({ boardFlipEnabled }),
        setQualityTier: (qualityTier) =>
          set({ qualityTier, ...(qualityTier === "auto" ? {} : { resolvedTier: qualityTier }) }),
        setPostFxEnabled: (postFxEnabled) => set({ postFxEnabled }),
        setCameraPreset: (cameraPreset) =>
          set({ cameraPreset, cinematic: cameraPreset === "cinematic" }),
        setCinematic: (cinematic) => set({ cinematic }),
        setReducedMotion: (reducedMotion) => set({ reducedMotion }),
        setOrientation: (orientation) => set({ orientation }),
        setRoomImageUrl: (roomImageUrl) => set({ roomImageUrl }),
        setEngineBuild: (engineBuild) => set({ engineBuild }),
        autoDetectTier: (input) => {
          if (get().qualityTier !== "auto") return;
          set({ resolvedTier: autoQualityTier(input) });
        },
        degradeTier: () => set((st) => ({ resolvedTier: dropTier(st.resolvedTier) })),
        setHistoryDrawerOpen: (historyDrawerOpen) => set({ historyDrawerOpen }),
        setSettingsDrawerOpen: (settingsDrawerOpen) => set({ settingsDrawerOpen }),
        setLayoutMode: (layoutMode) => set({ layoutMode }),
      }),
      {
        name: SETTINGS_STORAGE_KEY,
        version: 1,
        storage: createJSONStorage(() => localStorage),
        skipHydration: true, // nothing reads storage until StoreHydrator says so
        partialize: (s) => ({
          boardView: s.boardView,
          roomPreset: s.roomPreset,
          roomColors: s.roomColors,
          boardFlipEnabled: s.boardFlipEnabled,
          qualityTier: s.qualityTier,
          postFxEnabled: s.postFxEnabled,
        }),
        // NOT a React setState — safe under react-hooks/set-state-in-effect.
        onRehydrateStorage: () => (state, error) => {
          if (error) console.error("[ui-store] rehydrate failed", error);
          // On failure zustand calls back as `(undefined, error)` — e.g. the stored
          // JSON is malformed — so `state?.` would skip the flag and leave /settings
          // (and the 3D mount) stuck on their skeletons forever. The flag means
          // "storage has been consulted", not "storage had something", so set it
          // through the store itself, which is always there by the time this runs.
          (state ?? useUiStore.getState()).markHydrated();
        },
      },
    ),
    { name: "ui", enabled: process.env.NODE_ENV !== "production" },
  ),
);

/** Convenience selector for the Convex write-back in use-settings-sync. */
export function selectPersistedSettings(s: UiState): PlayerSettings {
  return {
    boardView: s.boardView,
    roomPreset: s.roomPreset,
    roomColors: s.roomColors,
    boardFlipEnabled: s.boardFlipEnabled,
    qualityTier: s.qualityTier,
    postFxEnabled: s.postFxEnabled,
  };
}
