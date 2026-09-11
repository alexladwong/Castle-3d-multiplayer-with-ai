// src/components/ui-kit/mini-board.tsx  [U0]
import { PieceGlyph } from "@/components/board2d/pieces-svg";
import { FILES, RANKS, gridPosition, isLightSquare } from "@/lib/constants";
import { cn } from "@/lib/ui";
import type { Colour, PieceSymbol, SquareId } from "@/lib/types";

/** One square, in the 45x45 units `pieces-svg.tsx` draws its glyphs in. */
const SQ = 45;
const BOARD = SQ * 8;

/** a1 … h8, in a fixed order; `gridPosition` decides where each one is drawn. */
const SQUARES: SquareId[] = RANKS.flatMap((rank) =>
  FILES.map((file) => `${file}${rank}` as SquareId),
);

export interface MiniPiece {
  square: SquareId;
  type: PieceSymbol;
  colour: Colour;
}

/**
 * The placement field of a FEN → a piece list.
 *
 * Deliberately not `piecesFromFen` (which builds a chess.js game): a 48px
 * thumbnail in a list of twenty games must not cost twenty engine instances,
 * and it must render *something* rather than throw on a half-written FEN.
 * A malformed placement field yields an empty board.
 */
export function piecesFromFenPlacement(fen: string): MiniPiece[] {
  const ranks = (fen.trim().split(/\s+/)[0] ?? "").split("/");
  if (ranks.length !== 8) return [];
  const out: MiniPiece[] = [];
  for (let r = 0; r < 8; r++) {
    let file = 0;
    for (const ch of ranks[r]!) {
      if (ch >= "1" && ch <= "8") {
        file += Number(ch);
        continue;
      }
      const lower = ch.toLowerCase();
      if (file > 7 || !"pnbrqk".includes(lower)) return [];
      out.push({
        square: `${FILES[file]}${RANKS[7 - r]}` as SquareId,
        type: lower as PieceSymbol,
        colour: ch === lower ? "b" : "w",
      });
      file += 1;
    }
    if (file !== 8) return [];
  }
  return out;
}

export interface MiniBoardProps extends Omit<React.ComponentProps<"svg">, "children"> {
  fen: string;
  /** Whose side of the board faces the viewer. Default white. */
  orientation?: Colour;
  /** Rendered edge length in px. Stays crisp from 48 up. */
  size?: number;
  lastMove?: { from: SquareId; to: SquareId } | null;
  /** Accessible name. `null` (the default) leaves the board decorative. */
  label?: string | null;
}

/**
 * A static SVG board from a FEN, using the Board2D glyphs — thumbnails,
 * spectate cards, recent-game rows and the WebGL-less hero fallback (§7).
 */
export function MiniBoard({
  fen,
  orientation = "w",
  size = 160,
  lastMove = null,
  label = null,
  className,
  ...props
}: MiniBoardProps) {
  const pieces = piecesFromFenPlacement(fen);
  const highlighted = new Set<SquareId>(lastMove ? [lastMove.from, lastMove.to] : []);

  return (
    <svg
      viewBox={`0 0 ${BOARD} ${BOARD}`}
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label ?? undefined}
      focusable="false"
      className={cn("block shrink-0 rounded-sm ring-1 ring-border", className)}
      {...props}
    >
      {label ? <title>{label}</title> : null}

      {/* squares — crispEdges so the grid never blurs at 48px */}
      <g shapeRendering="crispEdges">
        {SQUARES.map((square) => {
          const { row, col } = gridPosition(square, orientation);
          return (
            <rect
              key={square}
              data-square={square}
              x={col * SQ}
              y={row * SQ}
              width={SQ}
              height={SQ}
              fill={isLightSquare(square) ? "var(--board-light)" : "var(--board-dark)"}
            />
          );
        })}
        {[...highlighted].map((square) => {
          const { row, col } = gridPosition(square, orientation);
          return (
            <rect
              key={`last-${square}`}
              data-last-move={square}
              x={col * SQ}
              y={row * SQ}
              width={SQ}
              height={SQ}
              fill="var(--board-last)"
              opacity={0.45}
            />
          );
        })}
      </g>

      {/* pieces — a nested viewport per square keeps the glyph's own 45x45
          viewBox intact without depending on CSS for geometry */}
      {pieces.map((piece) => {
        const { row, col } = gridPosition(piece.square, orientation);
        return (
          <svg
            key={piece.square}
            data-piece={`${piece.colour}${piece.type}`}
            data-square={piece.square}
            x={col * SQ}
            y={row * SQ}
            width={SQ}
            height={SQ}
            viewBox={`0 0 ${SQ} ${SQ}`}
          >
            <PieceGlyph type={piece.type} colour={piece.colour} />
          </svg>
        );
      })}
    </svg>
  );
}
