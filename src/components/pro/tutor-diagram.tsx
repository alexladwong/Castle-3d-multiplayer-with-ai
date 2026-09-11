// src/components/pro/tutor-diagram.tsx  [PRO_TUTOR §1, §7]
// A still of the tutor's own handwriting, for the sales page: `MiniBoard` from the
// ui-kit with one annotation layer drawn over it in the same tones the real boards
// use (`ANNOTATION_TONE_TOKEN`, src/lib/tutor/annotations.ts).
//
// This is a MARKETING diagram, not the board's annotation layer — that one lives in
// src/components/board2d and src/components/board3d and is another builder's. What
// the two share is the tone vocabulary and the geometry helper (`gridPosition`), so
// a square marked "threat" here is the same colour as a square marked "threat" in a
// game. Positions are real: three moments from the Italian/Two Knights, so the claim
// beside each one is true of the board beside it.
import { MiniBoard } from "@/components/ui-kit";
import { gridPosition } from "@/lib/constants";
import {
  ANNOTATION_TONE_TOKEN,
  type AnnotationArrow,
  type AnnotationSquare,
} from "@/lib/tutor/annotations";
import type { SquareId } from "@/lib/types";
import { cn } from "@/lib/ui";

/** `MiniBoard` draws in the 45-unit glyph grid, so the overlay shares its viewBox. */
const SQ = 45;
const BOARD = SQ * 8;

/** Centre of a square in overlay units, White at the bottom (the diagrams' view). */
function centre(square: SquareId) {
  const { row, col } = gridPosition(square, "w");
  return { x: col * SQ + SQ / 2, y: row * SQ + SQ / 2 };
}

export interface TutorDiagramProps {
  fen: string;
  squares?: AnnotationSquare[];
  arrow?: AnnotationArrow;
  /** Names the drawing in words, so the tone is never carried by colour alone. */
  caption: string;
  className?: string;
}

/**
 * The board plus its drawings. Decorative: the caption underneath is the accessible
 * content, and repeating it inside the SVG would make a screen reader say it twice.
 */
export function TutorDiagram({ fen, squares = [], arrow, caption, className }: TutorDiagramProps) {
  const head = arrow ? centre(arrow.to) : null;
  const tail = arrow ? centre(arrow.from) : null;

  return (
    <figure className={cn("m-0 flex w-full max-w-[17.5rem] flex-col gap-3", className)}>
      <div className="relative">
        <MiniBoard fen={fen} size={280} className="h-auto w-full" />

        <svg
          viewBox={`0 0 ${BOARD} ${BOARD}`}
          aria-hidden
          focusable="false"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {squares.map((s) => {
            const { row, col } = gridPosition(s.square, "w");
            return (
              <rect
                key={s.square}
                data-annotation="square"
                data-tone={s.tone}
                x={col * SQ}
                y={row * SQ}
                width={SQ}
                height={SQ}
                fill={ANNOTATION_TONE_TOKEN[s.tone]}
                opacity={0.45}
              />
            );
          })}

          {arrow && head && tail ? (
            <ArrowMark from={tail} to={head} colour={ANNOTATION_TONE_TOKEN[arrow.tone]} />
          ) : null}
        </svg>
      </div>

      {/* The annotation chip the tutor panel shows beside every drawing (§3.3),
          printed here as the diagram's caption: the tone is a word, not a hue. */}
      <figcaption className="font-mono text-[0.8125rem] leading-snug tabular-nums text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

/** A shaft that stops short of the target plus a solid head landing on its centre. */
function ArrowMark({
  from,
  to,
  colour,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  colour: string;
}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;

  const HEAD = SQ * 0.42;
  const HALF = SQ * 0.26;
  // Start a third of a square out of the origin so the piece underneath stays legible.
  const startX = from.x + ux * SQ * 0.3;
  const startY = from.y + uy * SQ * 0.3;
  const baseX = to.x - ux * HEAD;
  const baseY = to.y - uy * HEAD;
  // Normal of the shaft, for the two back corners of the head.
  const nx = -uy;
  const ny = ux;

  return (
    <g data-annotation="arrow" opacity={0.9}>
      <line
        x1={startX}
        y1={startY}
        x2={baseX}
        y2={baseY}
        stroke={colour}
        strokeWidth={SQ * 0.22}
        strokeLinecap="round"
      />
      <polygon
        points={[
          `${to.x},${to.y}`,
          `${baseX + nx * HALF},${baseY + ny * HALF}`,
          `${baseX - nx * HALF},${baseY - ny * HALF}`,
        ].join(" ")}
        fill={colour}
      />
    </g>
  );
}
