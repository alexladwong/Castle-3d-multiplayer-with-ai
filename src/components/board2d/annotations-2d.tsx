"use client";
// src/components/board2d/annotations-2d.tsx
// The tutor's drawings on the 2D board (docs/PRO_TUTOR.md §4): square tints, arrows
// and a numbered candidate line, in an `<svg viewBox="0 0 8 8">` layer that sits
// between the squares grid and the pieces. It reads nothing: `Board2D` hands it the
// same `annotations` the 3D board gets, so both boards stay pure functions of props.
//
// Everything is in board-square units, from the helpers in src/lib/tutor/annotations.ts,
// so an arrow here and the same arrow in the 3D scene are one shape drawn twice.
import { useId } from "react";
import {
  ANNOTATION_TONE_LABEL,
  ANNOTATION_TONE_TOKEN,
  ARROW_CASING_INNER_HEAD,
  ARROW_CASING_INNER_STROKE,
  ARROW_CASING_OUTER_HEAD,
  ARROW_CASING_OUTER_STROKE,
  ARROW_CASING_WIDTH,
  ARROW_HEAD_WIDTH,
  ARROW_OPACITY,
  ARROW_STROKE,
  LINE_BADGE_RADIUS,
  SQUARE_EDGE_WIDTH,
  SQUARE_TINT_OPACITY,
  annotationsKey,
  arrowBetween,
  arrowCasing,
  arrowPolygon,
  badgePoint,
  lineStepOpacity,
  squareCentre2d,
  toneCasingTokens,
  toneEdgeToken,
  type AnnotationPoint,
  type AnnotationTone,
  type ArrowGeometry,
  type BoardAnnotations,
} from "@/lib/tutor/annotations";
import { isLightSquare } from "@/lib/constants";
import type { Colour } from "@/lib/types";

function points(list: AnnotationPoint[]): string {
  return list.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(" ");
}

/**
 * One arrow: the tone at full strength inside two casing rings (see
 * `ARROW_CASING_WIDTH` in src/lib/tutor/annotations.ts for why there are two).
 *
 * It is drawn as three `<polygon>`s from `arrowPolygon` — the very shapes the 3D
 * board extrudes — rather than as a `<line>` with a `<marker>`. The marker was the
 * one place the two boards disagreed: an SVG marker's default `preserveAspectRatio`
 * scaled its 10x10 viewBox uniformly, so the 2D head came out 0.34 across where the
 * 3D head is ARROW_HEAD_WIDTH (0.46) — the same annotation, two shapes. Sharing the
 * polygon removes the seam instead of patching it.
 */
function ArrowShape({
  arrow,
  tone,
  opacity,
}: {
  arrow: ArrowGeometry;
  tone: AnnotationTone;
  opacity: number;
}) {
  const casing = toneCasingTokens(tone);
  // The RINGS never fade with the step, only the core does. A casing composited at
  // 0.61 over a light square measures 2.4:1 against it, where the same ring at
  // ARROW_OPACITY measures 3.4:1 — so a line's recession is carried by how solid the
  // tone reads, and the shape's edge stays at full strength on every step.
  const edge = ARROW_OPACITY;
  return (
    <>
      <polygon
        points={points(
          arrowPolygon(arrowCasing(arrow, ARROW_CASING_WIDTH * 2), {
            stroke: ARROW_CASING_OUTER_STROKE,
            headWidth: ARROW_CASING_OUTER_HEAD,
          }),
        )}
        fill={casing.outer}
        opacity={edge}
      />
      <polygon
        points={points(
          arrowPolygon(arrowCasing(arrow, ARROW_CASING_WIDTH), {
            stroke: ARROW_CASING_INNER_STROKE,
            headWidth: ARROW_CASING_INNER_HEAD,
          }),
        )}
        fill={casing.inner}
        opacity={edge}
      />
      <polygon
        points={points(arrowPolygon(arrow, { stroke: ARROW_STROKE, headWidth: ARROW_HEAD_WIDTH }))}
        fill={ANNOTATION_TONE_TOKEN[tone]}
        opacity={opacity}
      />
    </>
  );
}

export interface Annotations2DProps {
  annotations: BoardAnnotations;
  /** Which seat the grid is drawn from — the only thing that moves a drawing. */
  orientation: Colour;
  /** False under reduced motion: the drawing is simply there, with no fade. */
  animate: boolean;
}

export function Annotations2D({ annotations, orientation, animate }: Annotations2DProps) {
  // `useId` is per component instance, so two boards on one page (the harness renders
  // one; the landing showcase can render another) never share the fade's keyframe
  // name. The colons React puts in the id are legal in HTML but not in XML names —
  // strip them, because this markup is also served as XML-ish SVG inside `<svg>`.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const key = annotationsKey(annotations);

  // §3: annotations fade in over 160 ms and nothing else moves. The keyframes are
  // declared here, scoped to this instance's id, rather than in globals.css: this layer
  // is the only thing that uses them, and a CSS animation restarted by a remount (the
  // `key` on the group below) needs no state, no effect and no cascading render — the
  // drawing is correct in the very first frame the server or the client paints.
  const fade = `${uid}-fade`;

  return (
    <svg
      viewBox="0 0 8 8"
      preserveAspectRatio="none"
      role="presentation"
      aria-hidden
      data-annotations="2d"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {animate ? (
        <style>{
          `@keyframes ${fade}{from{opacity:0}to{opacity:1}}` +
          `.${fade}{animation:${fade} var(--dur-bubble) var(--ease-out-soft) both}` +
          `@media (prefers-reduced-motion:reduce){.${fade}{animation:none}}`
        }</style>
      ) : null}

      <g key={key} className={animate ? fade : undefined}>
        {/* Square tints: a 45 % wash so the piece on the square still reads, and an
            inset edge in the same hue pushed away from the square's own value — that
            edge is what carries the mark where tone and walnut share a luminance. */}
        {annotations.squares.map(({ square, tone }) => {
          const { x, y } = squareCentre2d(square, orientation);
          // The stroke is centred on the path, so the rect is inset by half of it and
          // the whole ring stays inside its own square.
          const inset = SQUARE_EDGE_WIDTH / 2;
          return (
            <rect
              key={`square-${square}`}
              data-annotation="square"
              data-tone={tone}
              data-square={square}
              x={x - 0.5 + inset}
              y={y - 0.5 + inset}
              width={1 - SQUARE_EDGE_WIDTH}
              height={1 - SQUARE_EDGE_WIDTH}
              fill={ANNOTATION_TONE_TOKEN[tone]}
              fillOpacity={SQUARE_TINT_OPACITY}
              stroke={toneEdgeToken(tone, isLightSquare(square))}
              strokeWidth={SQUARE_EDGE_WIDTH}
            >
              <title>{`${square}, ${ANNOTATION_TONE_LABEL[tone]}`}</title>
            </rect>
          );
        })}

        {annotations.arrows.map(({ from, to, tone }, index) => {
          const arrow = arrowBetween(squareCentre2d(from, orientation), squareCentre2d(to, orientation));
          if (arrow.length === 0) return null;
          return (
            <g
              key={`arrow-${from}-${to}-${index}`}
              data-annotation="arrow"
              data-tone={tone}
              data-from={from}
              data-to={to}
            >
              <ArrowShape arrow={arrow} tone={tone} opacity={ARROW_OPACITY} />
              <title>{`${from} to ${to}, ${ANNOTATION_TONE_LABEL[tone]}`}</title>
            </g>
          );
        })}

        {/* The candidate line: the same arrows in brass, first move strongest, each one
            numbered at its start square so the order is readable without motion. */}
        {annotations.line.map((step, index) => {
          const arrow = arrowBetween(
            squareCentre2d(step.from, orientation),
            squareCentre2d(step.to, orientation),
          );
          if (arrow.length === 0) return null;
          const opacity = lineStepOpacity(index);
          const badge = badgePoint(arrow);
          return (
            <g
              key={`line-${index}-${step.from}-${step.to}`}
              data-annotation="line-step"
              data-step={index + 1}
              data-from={step.from}
              data-to={step.to}
              data-san={step.san}
            >
              <ArrowShape arrow={arrow} tone="idea" opacity={opacity} />
              <circle
                cx={badge.x}
                cy={badge.y}
                r={LINE_BADGE_RADIUS}
                fill={ANNOTATION_TONE_TOKEN.idea}
                stroke={toneCasingTokens("idea").outer}
                strokeWidth={ARROW_CASING_WIDTH}
                opacity={Math.min(1, opacity + 0.15)}
              />
              <text
                x={badge.x}
                y={badge.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={0.19}
                fontFamily="var(--font-mono), ui-monospace, monospace"
                fontWeight={600}
                fill="var(--accent-fg)"
              >
                {index + 1}
                <title>{`${index + 1}. ${step.san}`}</title>
              </text>
          </g>
        );
      })}
      </g>
    </svg>
  );
}

export default Annotations2D;
