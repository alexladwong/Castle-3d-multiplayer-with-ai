// src/components/board2d/pieces-svg.tsx  [P3]
// The twelve piece glyphs (6 shapes x 2 colours) as inline SVG — no external
// assets, no licence obligations: every path here is original geometry drawn for
// this project inside the classic 45x45 chess-glyph viewBox.
import type { Colour, PieceSymbol } from "@/lib/types";

/** One shape set. Rendered twice (white/black) via the fill/stroke palette below. */
const SHAPES: Record<PieceSymbol, React.ReactNode> = {
  p: (
    <>
      <circle cx="22.5" cy="14.5" r="5.1" />
      <path d="M17.4 20.5c0 4.6-1.9 8.4-3.9 11.6h18c-2-3.2-3.9-7-3.9-11.6z" />
      <rect x="11" y="31.6" width="23" height="5.4" rx="2.2" />
    </>
  ),
  n: (
    <>
      <path d="M13.6 37c0-7.4 2.4-11.8 7.2-14.8l-2.9-1-4.6 1.9c-1-3.3.9-6.6 4.4-8.2l3.9-1.8 2-4.7c5 2.9 8.5 8.6 8.5 15.6V37z" />
      <circle cx="27.4" cy="19.4" r="1.15" />
      <rect x="10.8" y="36.4" width="23.4" height="5" rx="2.2" />
    </>
  ),
  b: (
    <>
      <circle cx="22.5" cy="8.4" r="1.9" />
      <path d="M22.5 10.6c3.6 3 5.3 7 3.8 10.6h-7.6c-1.5-3.6.2-7.6 3.8-10.6z" />
      <path d="M22.5 14.4l2.6 3" fill="none" />
      <rect x="17.1" y="21.2" width="10.8" height="2.6" rx="1.2" />
      <path d="M17.4 23.8c-.4 4-1.9 6.9-3.9 9.6h18c-2-2.7-3.5-5.6-3.9-9.6z" />
      <rect x="10.8" y="33.4" width="23.4" height="5" rx="2.2" />
    </>
  ),
  r: (
    <>
      <path d="M12 11h4.5v3h4v-3h4v3h4v-3H33v7H12z" />
      <path d="M15.2 18h14.6l-1.1 13.4H16.3z" />
      <rect x="12.6" y="31.2" width="19.8" height="3" rx="1.2" />
      <rect x="10.8" y="34" width="23.4" height="5" rx="2.2" />
    </>
  ),
  q: (
    <>
      <circle cx="13.6" cy="11.4" r="1.7" />
      <circle cx="18.2" cy="15.8" r="1.5" />
      <circle cx="22.5" cy="9.4" r="1.9" />
      <circle cx="26.8" cy="15.8" r="1.5" />
      <circle cx="31.4" cy="11.4" r="1.7" />
      <path d="M12.3 20.4l1.5-7.2 4.1 5.4 4.6-7.6 4.6 7.6 4.1-5.4 1.5 7.2z" />
      <rect x="12.9" y="20.4" width="19.2" height="2.6" rx="1.1" />
      <path d="M14 23c-.1 4.4-1 7.4-1.7 10.2h20.4c-.7-2.8-1.6-5.8-1.7-10.2z" />
      <rect x="10.8" y="33.2" width="23.4" height="5.2" rx="2.2" />
    </>
  ),
  k: (
    <>
      <path d="M21 5.6h3v3.1h3.1v3H24v3.1h-3v-3.1h-3.1v-3H21z" />
      <path d="M22.5 15.6c5.5 0 9 3.9 8.5 8.9l-1 9h-15l-1-9c-.5-5 3-8.9 8.5-8.9z" />
      <rect x="13.4" y="24.1" width="18.2" height="2.4" rx="1.1" />
      <rect x="10.8" y="33.2" width="23.4" height="5.2" rx="2.2" />
    </>
  ),
};

const PALETTE: Record<Colour, { fill: string; stroke: string }> = {
  w: { fill: "#f6f2e9", stroke: "#1b1b1f" },
  b: { fill: "#2f2f35", stroke: "#08080a" },
};

export interface PieceGlyphProps {
  type: PieceSymbol;
  colour: Colour;
  className?: string;
  title?: string;
}

/**
 * A single glyph. Decorative by default (`aria-hidden`) because the surrounding
 * square carries the accessible name; pass `title` to make it announced.
 */
export function PieceGlyph({ type, colour, className, title }: PieceGlyphProps) {
  const palette = PALETTE[colour];
  return (
    <svg
      viewBox="0 0 45 45"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <g
        fill={`var(--piece-${colour === "w" ? "white" : "black"}, ${palette.fill})`}
        stroke={colour === "b" ? "var(--piece-white, #08080a)" : palette.stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {SHAPES[type]}
      </g>
    </svg>
  );
}

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

/** "white knight" — used for square labels and the aria-live announcer (NFR-7). */
export function pieceName(type: PieceSymbol, colour: Colour): string {
  return `${colour === "w" ? "white" : "black"} ${PIECE_NAMES[type]}`;
}

export { PIECE_NAMES };
