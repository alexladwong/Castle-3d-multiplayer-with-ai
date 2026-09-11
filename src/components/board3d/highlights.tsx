// src/components/board3d/highlights.tsx
// FR-30: selection, legal moves, captures, last move and check as emissive overlays that
// pulse. `emissiveIntensity > 1` + `toneMapped={false}` is what the HalfFloat composer
// buffer needs for the threshold bloom to pick them up (postprocessing.md §4a).
//
// Each overlay owns its material through a JSX ref: `react-hooks/immutability` forbids
// writing to a value returned from a hook, so a shared useMemo'd material cannot be
// animated. Geometry is still shared — it is only read, never assigned to.
"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CircleGeometry,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  type BufferGeometry,
} from "three";
import { squareToWorld } from "@/lib/constants";
import type { LastMove, LegalTarget, SquareId } from "@/lib/types";
import type { HighlightColours } from "@/lib/rooms";
import {
  CAPTURE_RING_INNER,
  CAPTURE_RING_OUTER,
  HIGHLIGHT_Y,
  LEGAL_DOT_RADIUS,
  TILE_SIZE,
} from "./layout";

type HighlightKind = "select" | "legal" | "capture" | "last" | "check";

/** Base emissive level, pulse amplitude, base opacity and rate per kind. */
const PULSE: Record<HighlightKind, { base: number; amplitude: number; opacity: number; speed: number }> = {
  select: { base: 1.1, amplitude: 0.5, opacity: 0.45, speed: 2.2 },
  legal: { base: 1.0, amplitude: 0.8, opacity: 0.55, speed: 3.0 },
  capture: { base: 1.2, amplitude: 0.9, opacity: 0.7, speed: 3.0 },
  last: { base: 0.9, amplitude: 0.25, opacity: 0.3, speed: 1.2 },
  check: { base: 1.6, amplitude: 1.4, opacity: 0.6, speed: 4.2 },
};

interface OverlayProps {
  square: SquareId;
  geometry: BufferGeometry;
  colour: string;
  kind: HighlightKind;
  animate: boolean;
}

/** The parent group is rotated onto the board plane, so world -Z maps to local +Y. */
function Overlay({ square, geometry, colour, kind, animate }: OverlayProps) {
  const materialRef = useRef<MeshStandardMaterial>(null);
  const [x, , z] = squareToWorld(square);

  useFrame(({ clock }) => {
    const material = materialRef.current;
    if (!material) return;
    const cfg = PULSE[kind];
    if (!animate) {
      material.emissiveIntensity = cfg.base;
      material.opacity = cfg.opacity;
      return;
    }
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * cfg.speed);
    material.emissiveIntensity = cfg.base + cfg.amplitude * pulse;
    material.opacity = cfg.opacity * (0.7 + 0.3 * pulse);
  });

  return (
    <mesh geometry={geometry} position={[x, -z, 0]} raycast={() => null} renderOrder={2} dispose={null}>
      <meshStandardMaterial
        ref={materialRef}
        color={colour}
        emissive={colour}
        emissiveIntensity={PULSE[kind].base}
        transparent
        opacity={PULSE[kind].opacity}
        depthWrite={false}
        toneMapped={false}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

export interface HighlightsProps {
  colours: HighlightColours;
  selectedSquare: SquareId | null;
  legalTargets: LegalTarget[];
  lastMove: LastMove | null;
  checkSquare: SquareId | null;
  /** False for reduced motion / during a camera flip — the pulse freezes (NFR-10). */
  animate: boolean;
}

export function Highlights({
  colours,
  selectedSquare,
  legalTargets,
  lastMove,
  checkSquare,
  animate,
}: HighlightsProps) {
  const geometries = useMemo(
    () => ({
      square: new PlaneGeometry(TILE_SIZE, TILE_SIZE),
      dot: new CircleGeometry(LEGAL_DOT_RADIUS, 24),
      ring: new RingGeometry(CAPTURE_RING_INNER, CAPTURE_RING_OUTER, 32),
    }),
    [],
  );

  useEffect(
    () => () => {
      geometries.square.dispose();
      geometries.dot.dispose();
      geometries.ring.dispose();
    },
    [geometries],
  );

  return (
    <group rotation-x={-Math.PI / 2} position={[0, HIGHLIGHT_Y, 0]} raycast={() => null}>
      {lastMove && (
        <>
          <Overlay
            square={lastMove.from}
            geometry={geometries.square}
            colour={colours.last}
            kind="last"
            animate={animate}
          />
          <Overlay
            square={lastMove.to}
            geometry={geometries.square}
            colour={colours.last}
            kind="last"
            animate={animate}
          />
        </>
      )}

      {checkSquare && (
        <Overlay
          square={checkSquare}
          geometry={geometries.square}
          colour={colours.check}
          kind="check"
          animate={animate}
        />
      )}

      {selectedSquare && (
        <Overlay
          square={selectedSquare}
          geometry={geometries.square}
          colour={colours.select}
          kind="select"
          animate={animate}
        />
      )}

      {legalTargets.map((target) => (
        <Overlay
          key={target.to}
          square={target.to}
          geometry={target.isCapture ? geometries.ring : geometries.dot}
          colour={target.isCapture ? colours.capture : colours.legal}
          kind={target.isCapture ? "capture" : "legal"}
          animate={animate}
        />
      ))}
    </group>
  );
}
