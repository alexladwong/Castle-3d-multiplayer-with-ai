"use client";
// src/components/board2d/board-2d.tsx  [P3]
// The 2D board: one of the two implementations of `BoardViewProps` (the other is
// P4's Board3D). It owns no chess logic, calls no Convex function and reads no
// game state from a store — everything comes in as props from useGameController.
import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { FILES, RANKS, gridPosition, isLightSquare, squareIndices } from "@/lib/constants";
import { resolveRoom } from "@/lib/rooms";
import { useUiStore } from "@/lib/stores/ui-store";
import { isEmptyAnnotations } from "@/lib/tutor/annotations";
import { cn } from "@/lib/utils";
import type { BoardViewProps, Colour, SquareId } from "@/lib/types";
import { Annotations2D } from "./annotations-2d";
import { Piece2D } from "./piece-2d";
import { Square2D } from "./square-2d";
import { pieceName } from "./pieces-svg";

/** Inverse of `gridPosition`: the square drawn at visual row/col. */
function squareAt(row: number, col: number, orientation: Colour): SquareId {
  const rank = orientation === "w" ? 7 - row : row;
  const file = orientation === "w" ? col : 7 - col;
  return `${FILES[file]}${RANKS[rank]}` as SquareId;
}

const ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

export function Board2D(props: BoardViewProps) {
  const {
    position,
    orientation,
    turn,
    interactive,
    animate,
    selectedSquare,
    legalTargets,
    lastMove,
    checkSquare,
    annotations,
    onSquareSelect,
    onDeselect,
  } = props;

  // Room colours are a per-viewer setting, not game state (FR-21l), so reading
  // them here does not violate the "boards never read a store for game state" rule.
  const roomPreset = useUiStore((s) => s.roomPreset);
  const roomColors = useUiStore((s) => s.roomColors);
  const room = useMemo(() => resolveRoom(roomPreset, roomColors), [roomPreset, roomColors]);
  const roomStyle = {
    "--board-select": room.highlight.select,
    "--board-legal": room.highlight.legal,
    "--board-capture": room.highlight.capture,
    "--board-last": room.highlight.last,
    "--board-check": room.highlight.check,
    "--piece-white": room.pieces.white.color,
    "--piece-black": room.pieces.black.color,
    boxShadow: `0 0 0 3px ${room.board.frameColor}, 0 18px 60px #00000038`,
  } as CSSProperties;

  const [cursor, setCursor] = useState<SquareId>("e1");

  const targets = useMemo(() => {
    const map = new Map<SquareId, boolean>();
    for (const t of legalTargets) map.set(t.to, t.isCapture || t.isEnPassant);
    return map;
  }, [legalTargets]);

  const occupied = useMemo(() => {
    const map = new Map<SquareId, (typeof position)[number]>();
    for (const piece of position) map.set(piece.square, piece);
    return map;
  }, [position]);

  const focusSquare = useCallback((square: SquareId, container: HTMLElement | null) => {
    const cell = container?.querySelector<HTMLElement>(`[data-square="${square}"]`);
    cell?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const { row, col } = gridPosition(cursor, orientation);
      let nextRow = row;
      let nextCol = col;
      switch (event.key) {
        case "ArrowUp":
          nextRow = Math.max(0, row - 1);
          break;
        case "ArrowDown":
          nextRow = Math.min(7, row + 1);
          break;
        case "ArrowLeft":
          nextCol = Math.max(0, col - 1);
          break;
        case "ArrowRight":
          nextCol = Math.min(7, col + 1);
          break;
        case "Home":
          nextCol = 0;
          break;
        case "End":
          nextCol = 7;
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          onSquareSelect(cursor);
          return;
        case "Escape":
          onDeselect();
          return;
        default:
          return;
      }
      event.preventDefault();
      const next = squareAt(nextRow, nextCol, orientation);
      setCursor(next);
      focusSquare(next, event.currentTarget);
    },
    [cursor, orientation, onSquareSelect, onDeselect, focusSquare],
  );

  return (
    // The board fills whatever square box its parent gives it. There used to be a
    // `max-w-[min(100%,80vh)]` cap here, which pre-dated the §5.1 shell: that shell
    // now hands both boards an exactly-square, exactly-sized box, so a viewport-based
    // cap only made the 2D board smaller than the 3D one in the focus layout (where
    // the box is close to 100dvh). The single caller — src/components/game/board-surface.tsx
    // — always centres this inside that square box, so `w-full` is the right size.
    //
    // The frame is deliberately HARD-EDGED. DESIGN.md, Shapes: "The board's frame
    // and squares are the only hard-edged rectangles in the system." The 12px
    // `rounded-xl` that used to be here was also eating coordinates: the rank "8"
    // sits 2px/4px into the a8 square and the file "h" the same distance into h1,
    // and with `overflow-hidden` a 12px corner clips everything outside its
    // quarter-circle — (12-4)² + (12-2)² = 164 > 12². Square corners clip nothing
    // and are what the spec asked for; the hairline ring stays.
    <div data-board-room={roomPreset} style={roomStyle} className="relative aspect-square w-full max-w-full overflow-hidden rounded-none select-none">
      <div
        role="grid"
        aria-label={`Chess board, ${orientation === "w" ? "white" : "black"} at the bottom`}
        aria-readonly={!interactive}
        className="grid h-full w-full grid-cols-8 grid-rows-8"
        onKeyDown={onKeyDown}
      >
        {ROWS.map((row) => (
          // `display: contents` keeps the 8x8 grid while giving screen readers rows.
          <div key={row} role="row" className="contents">
            {ROWS.map((col) => {
              const square = squareAt(row, col, orientation);
              const light = isLightSquare(square);
              const piece = occupied.get(square);
              const isTarget = targets.has(square);
              const { file } = squareIndices(square);
              return (
                <Square2D
                  key={square}
                  square={square}
                  light={light}
                  colour={
                    light ? room.board.lightSquare : room.board.darkSquare
                  }
                  selected={selectedSquare === square}
                  legal={isTarget}
                  capture={targets.get(square) === true || (isTarget && piece !== undefined)}
                  lastMove={lastMove?.from === square || lastMove?.to === square}
                  check={checkSquare === square}
                  cursor={cursor === square}
                  disabled={!interactive}
                  label={
                    piece
                      ? `${square}, ${pieceName(piece.type, piece.colour)}${isTarget ? ", capture" : ""}`
                      : `${square}, empty${isTarget ? ", legal move" : ""}`
                  }
                  fileLabel={row === 7 ? FILES[file] : null}
                  rankLabel={col === 0 ? square[1] : null}
                  onSelect={onSquareSelect}
                  onFocusSquare={setCursor}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* The tutor's drawings (docs/PRO_TUTOR.md §4) sit above the squares and their
          highlights, and below the pieces — a tint never hides the piece it is about. */}
      {annotations && !isEmptyAnnotations(annotations) ? (
        <Annotations2D annotations={annotations} orientation={orientation} animate={animate} />
      ) : null}

      {/* Pieces float above the grid; clicks fall through to the squares. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {position.map((piece) => (
          <Piece2D
            key={piece.id}
            piece={piece}
            orientation={orientation}
            animate={animate}
            selected={selectedSquare === piece.square}
          />
        ))}
      </div>

      {/* Turn tint on the edge, so the board itself shows whose move it is. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 h-1 transition-opacity",
          turn === "w" ? "bottom-0" : "top-0",
          interactive ? "bg-primary/70" : "bg-muted-foreground/30",
        )}
      />
    </div>
  );
}

export default Board2D;
