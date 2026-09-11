"use client";
// src/components/board2d/piece-2d.tsx  [P3]
// One piece. Absolutely positioned inside the board box and moved with a CSS
// transform so a piece that keeps its tracker id SLIDES between squares (FR-17).
import { MOVE_ANIMATION_MS, gridPosition } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { BoardPiece, Colour } from "@/lib/types";
import { PieceGlyph } from "./pieces-svg";

export interface Piece2DProps {
  piece: BoardPiece;
  orientation: Colour;
  /** False during a flip, a multi-ply review jump, or with reduced motion (NFR-10). */
  animate: boolean;
  selected: boolean;
}

export function Piece2D({ piece, orientation, animate, selected }: Piece2DProps) {
  const { row, col } = gridPosition(piece.square, orientation);

  return (
    <div
      data-piece={piece.id}
      className="pointer-events-none absolute top-0 left-0 flex items-center justify-center transition-transform ease-out will-change-transform"
      style={{
        width: "12.5%",
        height: "12.5%",
        transform: `translate(${col * 100}%, ${row * 100}%)`,
        transitionDuration: animate ? `${MOVE_ANIMATION_MS}ms` : "0ms",
      }}
    >
      <PieceGlyph
        type={piece.type}
        colour={piece.colour}
        className={cn(
          "h-[86%] w-[86%] transition-transform duration-150",
          selected && "scale-110 drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]",
        )}
      />
    </div>
  );
}
