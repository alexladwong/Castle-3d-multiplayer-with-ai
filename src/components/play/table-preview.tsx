"use client";
// src/components/play/table-preview.tsx  [U5]
// The lobby's one theatrical element (UI_UPGRADE_2 §3.3): the player's own board,
// in the player's own room, from the seat they are about to take. A nameplate
// above it, the room row beneath it, and no frame anywhere — DESIGN.md: "Don't
// frame the 3D board with a border, card or box; its light is its edge."
//
// Three states, in the order the landing hero established:
//   * WebGL2 available   → Board3DLoader in showcase mode, faded in on first frame.
//   * WebGL2 unavailable → MiniBoard at 320, painted in the room's own squares.
//   * client not ready   → a placeholder of exactly the same size; the canvas must
//     not mount during SSR or the hydrating render, and nothing may shift.
//
// The render loop pauses two ways: `pauseWhenOffscreen` drops the canvas to
// `frameloop="demand"` once it scrolls out of view, and a hidden tab stops
// serving animation frames at all, so the loop idles there without a flag.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Board3DLoader } from "@/components/board3d/board-3d-loader";
import type { Board3DShowcase } from "@/components/board3d/showcase";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniBoard } from "@/components/ui-kit";
import { DEFAULT_FEN } from "@/lib/constants";
import { piecesFromFen } from "@/lib/chess";
import { formatRating } from "@/lib/format";
import { ROOMS, resolveRoom } from "@/lib/rooms";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn, initials, useReducedMotion } from "@/lib/ui";
import { probeWebgl } from "@/lib/webgl";
import type {
  BoardPiece,
  BoardViewProps,
  Colour,
  RoomColors,
  RoomPresetId,
} from "@/lib/types";
import { RoomRow } from "./room-row";

const NOOP = () => {};

/** The opening position, with ids stable enough for a board that never moves. */
const START_POSITION: BoardPiece[] = piecesFromFen(DEFAULT_FEN).map((piece) => ({
  ...piece,
  id: `${piece.colour}${piece.type}-${piece.square}`,
}));

export interface TablePreviewProps {
  /** null while `players.me` is in flight. */
  username: string | null;
  avatarUrl?: string | null;
  rating: number | null;
  roomPreset: RoomPresetId;
  roomColors?: RoomColors | null;
  /** The seat the player is taking — "Random" shows White (§3.3). */
  orientation: Colour;
  onSelectRoom(room: Exclude<RoomPresetId, "custom">): void;
  onPreviewRoom?(room: Exclude<RoomPresetId, "custom">): void;
  roomBusy?: boolean;
  /** Harness only: render the 2D fallback without probing or mounting a canvas. */
  force2d?: boolean;
  className?: string;
}

/** Pure — the /dev/pages harness renders this with fixed values. */
export function TablePreview({
  username,
  avatarUrl,
  rating,
  roomPreset,
  roomColors = null,
  orientation,
  onSelectRoom,
  onPreviewRoom,
  roomBusy = false,
  force2d = false,
  className,
}: TablePreviewProps) {
  const reducedMotion = useReducedMotion();
  const webglAvailable = useUiStore((state) => state.webglAvailable);
  const [failed, setFailed] = useState(false);
  const [firstFrame, setFirstFrame] = useState(false);

  // Probe BEFORE anything mounts a <Canvas>: choosing the 2D fallback here means
  // the 1.2 MB 3D chunk is never fetched on a machine that cannot use it.
  // `setWebglAvailable` is a zustand action, so calling it from an effect is fine.
  useEffect(() => {
    if (force2d) return;
    if (useUiStore.getState().webglAvailable !== null) return;
    useUiStore.getState().setWebglAvailable(probeWebgl().ok);
  }, [force2d]);

  const onRenderFailure = useCallback(() => setFailed(true), []);
  const onFirstFrame = useCallback(() => setFirstFrame(true), []);

  const room = useMemo(() => resolveRoom(roomPreset, roomColors), [roomPreset, roomColors]);

  const board: BoardViewProps = {
    fen: DEFAULT_FEN,
    position: START_POSITION,
    orientation,
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
    onRenderFailure,
  };

  const showcase: Board3DShowcase = {
    roomPreset,
    roomColors,
    cameraPreset: "cinematic",
    tier: "low",
    postFx: false,
    hideControls: true,
    pauseWhenOffscreen: true,
    maxDpr: 1.5,
  };

  const show3D = !force2d && webglAvailable === true && !failed;
  const showFallback = force2d || webglAvailable === false || failed;
  const roomName = roomPreset === "custom" ? "your own colours" : ROOMS[roomPreset].label;

  return (
    // Capped and pushed to the far edge of its column: the board's right edge
    // then lines up with the page margin, so the two columns frame the page
    // instead of leaving a ragged strip of ground on the right.
    <aside
      aria-labelledby="table-preview-heading"
      // `self-start` matters twice: a grid item stretches to its row by default,
      // which both stretched the board's square box away from the room row below
      // it and made `position: sticky` a no-op (a full-height element has nothing
      // to stick within).
      className={cn(
        "grid w-full max-w-[28rem] content-start gap-4 lg:justify-self-end lg:self-start",
        className,
      )}
    >
      <h2 id="table-preview-heading" className="sr-only">
        Your table
      </h2>

      {/* Nameplate */}
      <div className="flex items-center gap-2.5">
        <Avatar size="sm" className="shrink-0">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback>{initials(username ?? "?")}</AvatarFallback>
        </Avatar>
        {username === null ? (
          <Skeleton className="h-4 w-40" aria-hidden />
        ) : (
          <p className="lobby-data min-w-0 truncate text-foreground">
            {username}
            {rating === null ? null : (
              <span className="text-muted-foreground"> · {formatRating(rating)}</span>
            )}
          </p>
        )}
      </div>

      {/* The board. Never framed: no border, no card, no ring. Capped so the
          sticky column still fits a 768px-tall laptop viewport under the header. */}
      <div className="relative aspect-square w-full overflow-hidden">
        {!showFallback && !firstFrame ? (
          <div aria-hidden className="absolute inset-0 grid place-items-center">
            <div className="size-full bg-card/40" />
          </div>
        ) : null}

        {show3D ? (
          <div
            // The room's light is the board's edge: the canvas dissolves into
            // the page rather than stopping at a rectangle (`.lobby-board-dissolve`
            // in play.css). The 2D fallback below is deliberately NOT masked —
            // its outer files and ranks are information, not atmosphere.
            className="lobby-board-dissolve absolute inset-0 transition-opacity ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{
              opacity: firstFrame ? 1 : 0,
              transitionDuration: reducedMotion ? "0ms" : "var(--dur-canvas)",
            }}
          >
            <Board3DLoader {...board} showcase={showcase} onFirstFrame={onFirstFrame} />
          </div>
        ) : null}

        {showFallback ? (
          <div className="absolute inset-0 grid place-items-center">
            {/* The room's own squares, so the 2D fallback still says which room. */}
            <MiniBoard
              fen={DEFAULT_FEN}
              orientation={orientation}
              size={320}
              label={`Your board, set up in ${roomName}`}
              // 320 is the intrinsic size; the SVG scales to the square box so
              // the fallback occupies exactly the space the canvas would.
              className="size-full rounded-none ring-0"
              style={
                {
                  "--board-light": room.board.lightSquare,
                  "--board-dark": room.board.darkSquare,
                } as React.CSSProperties
              }
            />
          </div>
        ) : null}
      </div>

      <RoomRow
        active={roomPreset}
        onSelect={onSelectRoom}
        onPreview={onPreviewRoom}
        disabled={roomBusy}
      />

      <Link
        prefetch={false}
        href="/settings"
        className={cn(
          "lobby-micro inline-flex h-9 w-fit items-center rounded-[0.625rem] px-2.5 py-2",
          "text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground",
          "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        Board &amp; room settings
      </Link>
    </aside>
  );
}
