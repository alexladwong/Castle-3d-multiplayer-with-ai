"use client";
// src/components/board3d/tutor-annotations.tsx
// The tutor's drawings in the 3D scene (docs/PRO_TUTOR.md §4): square tints, arrows
// and a numbered candidate line, drawn flat in the board plane just above
// <Highlights>. Same shapes as the 2D layer — both call the geometry helpers in
// src/lib/tutor/annotations.ts, so a drawing does not change when the player swaps
// boards mid-game.
//
// WHERE THE COLOURS COME FROM. The four tones are SEMANTIC (good / bad / threat /
// idea) and DESIGN.md gives each one a token: --live, --danger, --board-capture,
// --accent. The panel's annotation chips use those same tokens, and a chip and its
// drawing have to be the same colour or the pairing is a puzzle. The alternative —
// mapping tones onto `room.highlight` — was rejected: those five colours mean
// select / legal / capture / last / check, they are decoration that changes per room
// (the arcade room's are magenta and cyan), and a "good" square would turn hot pink
// in one room and green in another. So this reads the four CSS custom properties off
// the document at mount and re-reads them when the theme class changes; three cannot
// resolve a `var()` itself, and the fallbacks below are the dark theme's values.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  CanvasTexture,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Texture,
} from "three";
import { isLightSquare } from "@/lib/constants";
import {
  ANNOTATION_TONE_FALLBACK,
  ANNOTATION_TONE_VAR,
  ARROW_CASING_INNER_HEAD,
  ARROW_CASING_INNER_STROKE,
  ARROW_CASING_OUTER_HEAD,
  ARROW_CASING_OUTER_STROKE,
  ARROW_CASING_WIDTH,
  ARROW_OPACITY,
  SQUARE_EDGE_MIX,
  SQUARE_EDGE_MIX_LIT,
  SQUARE_EDGE_WIDTH,
  SQUARE_TINT_OPACITY,
  annotationsKey,
  arrowBetween,
  arrowCasing,
  arrowPolygon,
  badgePoint,
  lineStepOpacity,
  squareCentre3d,
  toneCasingColours,
  toneEdgeColour,
  type AnnotationTone,
  type ArrowGeometry,
  type BoardAnnotations,
} from "@/lib/tutor/annotations";
import { HIGHLIGHT_Y, TILE_SIZE } from "./layout";

/** §3: annotations fade in over 160 ms; under reduced motion they are simply there. */
const FADE_MS = 160;
/**
 * Deliberately LOWER than <Highlights>' 0.9-1.6. Those markers are decoration and are
 * allowed to blow out into the bloom; a tutor's drawing carries meaning in its hue —
 * measured at 1.15 the ember, capture and brass tones all clipped to near-white on the
 * lit board and stopped being tellable apart. At 0.4 each tone keeps its colour and
 * still sits above the walnut.
 */
const EMISSIVE = 0.4;
/** Above the highlights' own overlays, which sit at polygonOffsetFactor -2. */
const POLYGON_OFFSET = -3;
/** How far a line's numbered badge floats over the board, in squares. */
const BADGE_LIFT = 0.3;
/** 0.28 across plus the disc's own hairline — the 2D badge's size, in squares.
 *  It was 0.46: half a square, sitting on the piece whose move it numbered. */
const BADGE_SIZE = 0.32;

type ToneColours = Record<AnnotationTone, string> & { ink: string };

const FALLBACK_COLOURS: ToneColours = { ...ANNOTATION_TONE_FALLBACK, ink: "#1a130d" };

/**
 * The tone tokens as resolved colours. Re-read when next-themes swaps the class on
 * <html>, so switching to the light theme repaints the drawings with the light
 * palette instead of leaving the dark one on the board.
 */
function useToneColours(): ToneColours {
  const [colours, setColours] = useState<ToneColours>(FALLBACK_COLOURS);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const value = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
      const next: ToneColours = {
        good: value(ANNOTATION_TONE_VAR.good, ANNOTATION_TONE_FALLBACK.good),
        bad: value(ANNOTATION_TONE_VAR.bad, ANNOTATION_TONE_FALLBACK.bad),
        threat: value(ANNOTATION_TONE_VAR.threat, ANNOTATION_TONE_FALLBACK.threat),
        idea: value(ANNOTATION_TONE_VAR.idea, ANNOTATION_TONE_FALLBACK.idea),
        ink: value("--accent-fg", FALLBACK_COLOURS.ink),
      };
      setColours((previous) =>
        previous.good === next.good &&
        previous.bad === next.bad &&
        previous.threat === next.threat &&
        previous.idea === next.idea &&
        previous.ink === next.ink
          ? previous
          : next,
      );
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => observer.disconnect();
  }, []);

  return colours;
}

interface FlatMeshProps {
  geometry: BufferGeometry;
  colour: string;
  opacity: number;
  /** Local plane position; the parent group is rotated onto the board. */
  position?: [number, number, number];
  fadeFrom: React.RefObject<number>;
  animate: boolean;
  renderOrder: number;
}

/**
 * One flat overlay. It owns its material through a JSX ref for the same reason
 * highlights.tsx does: a material returned from a hook may not be written to, and the
 * fade writes `opacity` every frame until it lands.
 */
function FlatMesh({ geometry, colour, opacity, position, fadeFrom, animate, renderOrder }: FlatMeshProps) {
  const materialRef = useRef<MeshStandardMaterial>(null);

  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;
    if (!animate) {
      material.opacity = opacity;
      return;
    }
    const elapsed = performance.now() - fadeFrom.current;
    const t = Math.min(1, Math.max(0, elapsed / FADE_MS));
    // Same exponential settle as --ease-out-soft: fast in, no overshoot.
    material.opacity = opacity * (1 - Math.pow(1 - t, 3));
  });

  return (
    <mesh geometry={geometry} position={position} raycast={() => null} renderOrder={renderOrder} dispose={null}>
      <meshStandardMaterial
        ref={materialRef}
        color={colour}
        emissive={colour}
        emissiveIntensity={EMISSIVE}
        transparent
        opacity={0}
        depthWrite={false}
        toneMapped={false}
        polygonOffset
        polygonOffsetFactor={POLYGON_OFFSET}
      />
    </mesh>
  );
}

/** A step number as a small disc, drawn once into a canvas and used as a billboard. */
function numberTexture(step: number, fill: string, ink: string): Texture | null {
  if (typeof document === "undefined") return null;
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.font = `600 ${Math.round(size * 0.56)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(step), size / 2, size / 2 + size * 0.03);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * The tint's edge as a flat frame (a square with a square hole), the 3D twin of the 2D
 * layer's inset stroke — and the same argument: on a lit walnut board the wash alone is
 * a hue change, the frame is what gives the mark a value change.
 */
function frameGeometry(outer: number, width: number): ShapeGeometry {
  const half = outer / 2;
  const innerHalf = half - width;
  const shape = new Shape();
  shape.moveTo(-half, -half);
  shape.lineTo(half, -half);
  shape.lineTo(half, half);
  shape.lineTo(-half, half);
  shape.closePath();
  const hole = new Path();
  hole.moveTo(-innerHalf, -innerHalf);
  hole.lineTo(innerHalf, -innerHalf);
  hole.lineTo(innerHalf, innerHalf);
  hole.lineTo(-innerHalf, innerHalf);
  hole.closePath();
  shape.holes.push(hole);
  return new ShapeGeometry(shape);
}

function polygonGeometry(points: { x: number; y: number }[]): ShapeGeometry {
  const shape = new Shape();
  shape.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) shape.lineTo(point.x, point.y);
  shape.closePath();
  return new ShapeGeometry(shape);
}

/**
 * The three rings of one arrow (see `ARROW_CASING_WIDTH` in
 * src/lib/tutor/annotations.ts): black-ward casing, white-ward casing, tone core.
 * A shaft crosses both square colours, so one casing colour cannot carry it.
 */
interface CasedArrowGeometry {
  outer: ShapeGeometry;
  inner: ShapeGeometry;
  core: ShapeGeometry;
}

function casedGeometries(arrow: ArrowGeometry): CasedArrowGeometry | null {
  if (arrow.length === 0) return null;
  return {
    outer: polygonGeometry(
      arrowPolygon(arrowCasing(arrow, ARROW_CASING_WIDTH * 2), {
        stroke: ARROW_CASING_OUTER_STROKE,
        headWidth: ARROW_CASING_OUTER_HEAD,
      }),
    ),
    inner: polygonGeometry(
      arrowPolygon(arrowCasing(arrow, ARROW_CASING_WIDTH), {
        stroke: ARROW_CASING_INNER_STROKE,
        headWidth: ARROW_CASING_INNER_HEAD,
      }),
    ),
    core: polygonGeometry(arrowPolygon(arrow)),
  };
}

function disposeCased(ring: CasedArrowGeometry | null): void {
  if (ring === null) return;
  ring.outer.dispose();
  ring.inner.dispose();
  ring.core.dispose();
}

interface CasedArrowProps {
  ring: CasedArrowGeometry;
  colour: string;
  opacity: number;
  fadeFrom: React.RefObject<number>;
  animate: boolean;
}

/** The three rings as three flat meshes, drawn outermost first. */
function CasedArrow({ ring, colour, opacity, fadeFrom, animate }: CasedArrowProps) {
  const casing = toneCasingColours(colour);
  // As in the 2D layer: the rings hold at ARROW_OPACITY so a late step of a line keeps
  // a legible edge, and only the tone core recedes.
  const edge = ARROW_OPACITY;
  return (
    <>
      <FlatMesh
        geometry={ring.outer}
        colour={casing.outer}
        opacity={edge}
        position={[0, 0, 0]}
        fadeFrom={fadeFrom}
        animate={animate}
        renderOrder={4}
      />
      <FlatMesh
        geometry={ring.inner}
        colour={casing.inner}
        opacity={edge}
        position={[0, 0, 0.0005]}
        fadeFrom={fadeFrom}
        animate={animate}
        renderOrder={5}
      />
      <FlatMesh
        geometry={ring.core}
        colour={colour}
        opacity={opacity}
        position={[0, 0, 0.001]}
        fadeFrom={fadeFrom}
        animate={animate}
        renderOrder={6}
      />
    </>
  );
}

export interface TutorAnnotationsProps {
  annotations: BoardAnnotations;
  /** False under reduced motion or during a seat flip: no fade, nothing moves. */
  animate: boolean;
}

export function TutorAnnotations({ annotations, animate }: TutorAnnotationsProps) {
  const colours = useToneColours();
  const invalidate = useThree((state) => state.invalidate);
  const key = annotationsKey(annotations);
  // Set by the effect below, before the first frame this group is drawn in. Until then
  // it is +Infinity, so the fade reads as "not started" and the drawing stays invisible
  // rather than flashing in at full strength for one frame.
  const fadeFrom = useRef(Number.POSITIVE_INFINITY);

  const squareGeometry = useMemo(() => new PlaneGeometry(TILE_SIZE, TILE_SIZE), []);
  useEffect(() => () => squareGeometry.dispose(), [squareGeometry]);

  const edgeGeometry = useMemo(() => frameGeometry(TILE_SIZE, SQUARE_EDGE_WIDTH), []);
  useEffect(() => () => edgeGeometry.dispose(), [edgeGeometry]);

  // One ShapeGeometry per arrow RING, rebuilt only when the drawing itself changes.
  // The polygons carry absolute board coordinates, so every mesh sits at the origin.
  const arrowGeometries = useMemo(
    () =>
      annotations.arrows.map((arrow) =>
        casedGeometries(arrowBetween(squareCentre3d(arrow.from), squareCentre3d(arrow.to))),
      ),
    // `key` is the fingerprint of exactly these arrays (annotationsKey).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  useEffect(
    () => () => arrowGeometries.forEach((ring) => disposeCased(ring)),
    [arrowGeometries],
  );

  const lineArrows = useMemo(
    () => annotations.line.map((step) => arrowBetween(squareCentre3d(step.from), squareCentre3d(step.to))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const lineGeometries = useMemo(() => lineArrows.map(casedGeometries), [lineArrows]);
  useEffect(() => () => lineGeometries.forEach((ring) => disposeCased(ring)), [lineGeometries]);

  const badges = useMemo(
    () => lineArrows.map((_, index) => numberTexture(index + 1, colours.idea, colours.ink)),
    [lineArrows, colours.idea, colours.ink],
  );
  useEffect(() => () => badges.forEach((texture) => texture?.dispose()), [badges]);

  // A new drawing has to reach the screen even on a root that only renders what it is
  // asked for (the §10.4 offscreen pause), and the fade needs frames of its own.
  useEffect(() => {
    fadeFrom.current = performance.now();
    invalidate();
  }, [key, invalidate]);

  useFrame(() => {
    if (!animate) return;
    if (performance.now() - fadeFrom.current < FADE_MS + 32) invalidate();
  });

  return (
    <group rotation-x={-Math.PI / 2} position={[0, HIGHLIGHT_Y + 0.002, 0]} raycast={() => null}>
      {annotations.squares.map(({ square, tone }) => {
        const centre = squareCentre3d(square);
        const light = isLightSquare(square);
        return (
          <group key={`square-${square}`}>
            <FlatMesh
              geometry={squareGeometry}
              colour={colours[tone]}
              opacity={SQUARE_TINT_OPACITY}
              position={[centre.x, centre.y, 0]}
              fadeFrom={fadeFrom}
              animate={animate}
              renderOrder={3}
            />
            <FlatMesh
              geometry={edgeGeometry}
              colour={toneEdgeColour(colours[tone], light, light ? SQUARE_EDGE_MIX : SQUARE_EDGE_MIX_LIT)}
              opacity={1}
              position={[centre.x, centre.y, 0.001]}
              fadeFrom={fadeFrom}
              animate={animate}
              renderOrder={4}
            />
          </group>
        );
      })}

      {annotations.arrows.map((arrow, index) => {
        const ring = arrowGeometries[index];
        if (!ring) return null;
        return (
          <CasedArrow
            key={`arrow-${arrow.from}-${arrow.to}-${index}`}
            ring={ring}
            colour={colours[arrow.tone]}
            opacity={ARROW_OPACITY}
            fadeFrom={fadeFrom}
            animate={animate}
          />
        );
      })}

      {annotations.line.map((step, index) => {
        const ring = lineGeometries[index];
        const arrow = lineArrows[index];
        if (!ring || !arrow || arrow.length === 0) return null;
        const badge = badgePoint(arrow);
        const texture = badges[index];
        return (
          <group key={`line-${index}-${step.from}-${step.to}`}>
            <CasedArrow
              ring={ring}
              colour={colours.idea}
              opacity={lineStepOpacity(index)}
              fadeFrom={fadeFrom}
              animate={animate}
            />
            {texture ? (
              // A billboard, so the number is upright from either seat and from the
              // top-down preset. It floats over the board so the surface never clips
              // the half of the quad that leans into it, and it ignores the depth
              // buffer: a step number hidden behind a rook is a step the player cannot
              // read, and this is the only text in the scene.
              <sprite position={[badge.x, badge.y, BADGE_LIFT]} scale={[BADGE_SIZE, BADGE_SIZE, 1]} renderOrder={6}>
                <spriteMaterial
                  map={texture}
                  transparent
                  depthWrite={false}
                  depthTest={false}
                  toneMapped={false}
                />
              </sprite>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

export default TutorAnnotations;
