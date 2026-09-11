"use client";
// src/components/landing/hero-board.tsx  [U1]
// The signature of the whole redesign (§1.4): the Opera Game replaying on a real
// 3D board in the room the visitor is pointing at. One Canvas on the page, and it
// is this one.
//
// Three states, in order of preference:
//   * WebGL2 available   → Board3D in showcase mode (§10.4), faded in over 800ms
//     once it reports its first frame (§1.3).
//   * WebGL2 unavailable → the 2D MiniBoard at hero size, driven by the SAME
//     replay, so the section never blanks (§3).
//   * client not ready   → a quiet placeholder of exactly the same size; the canvas
//     must not mount during SSR or the hydrating render, and nothing may shift.
import { useCallback, useEffect, useState } from "react";
import { Board3DLoader } from "@/components/board3d/board-3d-loader";
import type { Board3DShowcase } from "@/components/board3d/showcase";
import { MiniBoard } from "@/components/ui-kit";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn, useReducedMotion } from "@/lib/ui";
import { probeWebgl } from "@/lib/webgl";
import type {
  BoardViewProps,
  ResolvedQualityTier,
  RoomPresetId,
} from "@/lib/types";
import type { ShowcaseGame } from "./use-showcase-game";

const NOOP = () => {};

export interface HeroBoardProps {
  game: ShowcaseGame;
  room: RoomPresetId;
  /** "low" on phones, "medium" everywhere else (§3). */
  tier: ResolvedQualityTier;
  className?: string;
}

export function HeroBoard({ game, room, tier, className }: HeroBoardProps) {
  const reducedMotion = useReducedMotion();
  const webglAvailable = useUiStore((state) => state.webglAvailable);
  const [failed, setFailed] = useState(false);
  const [firstFrame, setFirstFrame] = useState(false);

  // §E.10.1: probe BEFORE anything mounts a <Canvas>. Board3D carries its own probe,
  // but running it here means the 2D fallback is chosen without ever loading the 3D
  // chunk — and without the FR-19 toast, which belongs on the game screen rather than
  // on a marketing page. `setWebglAvailable` is a zustand action, so calling it from
  // an effect is allowed (§D.12 rule 6).
  useEffect(() => {
    if (useUiStore.getState().webglAvailable !== null) return;
    useUiStore.getState().setWebglAvailable(probeWebgl().ok);
  }, []);

  const onRenderFailure = useCallback(() => {
    // Quietly: the visitor did not ask for a 3D board, so they are not told that the
    // one they got is the second choice. The position keeps playing either way.
    setFailed(true);
  }, []);

  const onFirstFrame = useCallback(() => setFirstFrame(true), []);

  const board: BoardViewProps = {
    fen: game.fen,
    position: game.position,
    orientation: "w",
    turn: game.turn,
    interactive: false,
    animate: !reducedMotion,
    selectedSquare: null,
    legalTargets: [],
    lastMove: game.lastMove,
    checkSquare: game.checkSquare,
    captured: game.captured,
    promotion: null,
    reviewPly: null,
    onSquareSelect: NOOP,
    onMove: NOOP,
    onPromotionChoice: NOOP,
    onDeselect: NOOP,
    onRenderFailure,
  };

  const showcase: Board3DShowcase = {
    roomPreset: room,
    cameraPreset: "cinematic",
    tier,
    postFx: false,
    hideControls: true,
    pauseWhenOffscreen: true,
    maxDpr: 1.5,
  };

  const show3D = webglAvailable === true && !failed;
  const showFallback = webglAvailable === false || failed;

  return (
    <div className={cn("relative h-full w-full", className)}>
      {/* The one gradient the system allows (§1.1). */}
      <div aria-hidden className="hero-vignette pointer-events-none absolute inset-0" />

      {/* Under the canvas until it has a frame to show: the probe tick, the 1.2 MB
          chunk, and the HDRI. Same shape as Board3DLoader's own skeleton. */}
      {!showFallback && !firstFrame ? (
        <div aria-hidden className="absolute inset-0 grid place-items-center p-2">
          <div className="hero-canvas-blend h-full w-full max-w-[min(100%,720px)] bg-card/40" />
        </div>
      ) : null}

      {show3D ? (
        <div
          className="hero-canvas-blend absolute inset-0 transition-opacity ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            opacity: firstFrame ? 1 : 0,
            transitionDuration: reducedMotion ? "0ms" : "var(--dur-canvas)",
          }}
        >
          <Board3DLoader {...board} showcase={showcase} onFirstFrame={onFirstFrame} />
        </div>
      ) : null}

      {showFallback ? (
        <div className="hero-canvas-blend absolute inset-0 grid place-items-center p-2">
          <MiniBoard
            fen={game.fen}
            lastMove={game.lastMove}
            size={640}
            label="The Opera Game, replaying move by move"
            className="h-full max-h-full w-auto max-w-full rounded-xl shadow-soft"
          />
        </div>
      ) : null}
    </div>
  );
}
