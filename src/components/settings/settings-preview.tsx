"use client";
// src/components/settings/settings-preview.tsx  [U4]
// The sticky live preview beside the settings sections (UI_REDESIGN §6): the
// real Board3D in showcase mode (§10.4), non-interactive, reflecting the current
// room, colours and quality tier the instant a control changes — every control
// writes to the ui-store synchronously, and this reads the same store.
//
// Note the tension with §I-8: /settings deliberately shipped no canvas so a
// visitor who came for one toggle did not pay ~8 MB for it. The spec now asks
// for a live preview here, so the canvas mounts — but only once the store has
// hydrated and only when WebGL2 is actually usable; without it the preview falls
// back to a flat board painted in the room's own square colours.
import { useMemo } from "react";
import { Board3DLoader, type Board3DShowcase } from "@/components/board3d/board-3d-loader";
import { MiniBoard, piecesFromFenPlacement } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiStore } from "@/lib/stores/ui-store";
import { DEFAULT_FEN } from "@/lib/constants";
import { resolveRoom } from "@/lib/rooms";
import { useReducedMotion } from "@/lib/ui";
import type { BoardPiece, BoardViewProps } from "@/lib/types";

const NOOP = () => {};

/** The opening position, with ids the 3D scene can key its meshes off. */
const PREVIEW_POSITION: BoardPiece[] = piecesFromFenPlacement(DEFAULT_FEN).map((piece) => ({
  id: `${piece.colour}${piece.type}${piece.square}`,
  square: piece.square,
  type: piece.type,
  colour: piece.colour,
}));

const PREVIEW_BOARD: BoardViewProps = {
  fen: DEFAULT_FEN,
  position: PREVIEW_POSITION,
  orientation: "w",
  turn: "w",
  interactive: false,
  animate: false,
  selectedSquare: null,
  legalTargets: [],
  lastMove: null,
  checkSquare: null,
  captured: { w: [], b: [] },
  promotion: null,
  reviewPly: null,
  onSquareSelect: NOOP,
  onMove: NOOP,
  onPromotionChoice: NOOP,
  onDeselect: NOOP,
};

export function SettingsPreview({ className }: { className?: string }) {
  const hydrated = useUiStore((s) => s.hydrated);
  const roomPreset = useUiStore((s) => s.roomPreset);
  const roomColors = useUiStore((s) => s.roomColors);
  const resolvedTier = useUiStore((s) => s.resolvedTier);
  const postFxEnabled = useUiStore((s) => s.postFxEnabled);
  const webglAvailable = useUiStore((s) => s.webglAvailable);
  const reducedMotion = useReducedMotion();

  const room = resolveRoom(roomPreset, roomColors);

  const showcase = useMemo<Board3DShowcase>(
    () => ({
      roomPreset,
      roomColors,
      // §1.3: no auto-orbit when the OS asks for reduced motion.
      cameraPreset: reducedMotion ? "white" : "cinematic",
      tier: resolvedTier,
      postFx: postFxEnabled,
      hideControls: true,
      pauseWhenOffscreen: true,
      maxDpr: 1.5,
    }),
    [roomPreset, roomColors, reducedMotion, resolvedTier, postFxEnabled],
  );

  return (
    <div className={className}>
      <div className="grid gap-2 rounded-xl border border-border bg-card p-3">
        <div
          className="aspect-square w-full overflow-hidden rounded-lg bg-bg-sunken"
          style={
            {
              "--board-light": room.board.lightSquare,
              "--board-dark": room.board.darkSquare,
            } as React.CSSProperties
          }
        >
          {!hydrated ? (
            <Skeleton className="size-full rounded-lg" />
          ) : webglAvailable === false ? (
            <div className="grid size-full place-items-center p-4">
              <MiniBoard
                fen={DEFAULT_FEN}
                size={280}
                label="Preview of your board colours"
                className="max-w-full"
              />
            </div>
          ) : (
            <Board3DLoader {...PREVIEW_BOARD} showcase={showcase} />
          )}
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1 pb-1">
          <p className="text-sm font-medium text-foreground">{room.label}</p>
          <p className="text-[12px] text-muted-foreground">
            {webglAvailable === false
              ? "Flat preview — this browser has no WebGL2."
              : "Live preview. Nobody else sees your room."}
          </p>
        </div>
      </div>
    </div>
  );
}
