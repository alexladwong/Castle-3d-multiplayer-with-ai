// src/components/board3d/frame-key.ts
// A one-line fingerprint of everything the 3D scene draws.
//
// Why it exists: r3f only guarantees a redraw for a `frameloop="always"` root whose loop
// is actually running. A root that has dropped to "demand" (the §10.4 offscreen pause),
// or whose shared render loop has stalled (see the long note in frame-signals.tsx),
// renders exactly the frames it is asked for — and nobody asks on its behalf. Feeding
// this key to <FrameloopGate> turns "what is on the board changed" into an explicit
// request for a frame, so a new position reaches the screen without the player moving
// the pointer to make it happen.
//
// Pure and free of three/fiber, so it can be unit-tested without a WebGL context.
import { annotationsKey } from "@/lib/tutor/annotations";
import type { BoardViewProps, CameraPresetId, RoomColors } from "@/lib/types";

/**
 * The per-viewer view settings that change what the scene looks like without changing
 * the position: the room and its colours, the quality tier, post-processing, and where
 * the camera is being sent. Passed separately from `BoardViewProps` because the board
 * contract (§D.11) deliberately knows nothing about them — Board3D reads them from the
 * ui-store, or from the showcase prop.
 */
export interface BoardViewSettings {
  roomPreset: string;
  roomColors: RoomColors | null;
  roomImageUrl?: string;
  tier: string;
  postFx: boolean;
  cameraPreset: CameraPresetId;
  cinematic: boolean;
  reducedMotion: boolean;
}

/**
 * Cheap on purpose — it runs on every render of the board. The FEN already covers piece
 * placement and the side to move, so the board half only needs the things the FEN cannot
 * see: which square is lit, which markers are down, whether the promotion overlay has
 * taken the board out of play, and which way round it is.
 *
 * `legalTargets` is folded to its length rather than its contents: it is derived from
 * `selectedSquare`, which is in the key already, so the count is enough to notice a
 * change without walking the array on every frame.
 */
export function boardFrameKey(board: BoardViewProps, view?: BoardViewSettings): string {
  const { lastMove, promotion } = board;
  const parts: (string | number)[] = [
    board.fen,
    board.orientation,
    board.selectedSquare ?? "-",
    board.legalTargets.length,
    lastMove ? `${lastMove.from}${lastMove.to}${lastMove.promotion ?? ""}` : "-",
    board.checkSquare ?? "-",
    board.captured.w.length,
    board.captured.b.length,
    promotion ? `${promotion.from}${promotion.to}` : "-",
    board.interactive ? "i" : "-",
    board.animate ? "a" : "-",
    // The tutor's drawings are part of what the scene shows (PRO_TUTOR §4), and a new
    // drawing arrives without the position changing — so the FEN cannot stand in for
    // it. `annotationsKey` is that fingerprint, and "-" when the board is clean.
    annotationsKey(board.annotations),
  ];

  if (view) {
    const { roomColors: colours } = view;
    parts.push(
      view.roomPreset,
      colours ? `${colours.background}${colours.lightSquare}${colours.darkSquare}` : "-",
      view.roomImageUrl ?? "-",
      view.tier,
      view.postFx ? "fx" : "-",
      view.cameraPreset,
      view.cinematic ? "orbit" : "-",
      view.reducedMotion ? "still" : "-",
    );
  }

  return parts.join("|");
}
