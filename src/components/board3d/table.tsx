// src/components/board3d/table.tsx
// The table the board stands on. Procedural — there is no model to download and no
// texture to fetch — and driven entirely by `room.table` in src/lib/rooms.ts, so a new
// room gets its own furniture by naming a finish (FR-21n's rule, applied to a new part).
//
// THE ONE INVARIANT: the top face is `TABLE_TOP_Y`, which IS the plinth's underside.
// Nothing here may move a square, and nothing here may reach the reflective playing
// surface a quarter of a unit above it.
"use client";
import { useEffect, useMemo } from "react";
import { LatheGeometry, Vector2 } from "three";
import type { TableFinish } from "@/lib/rooms";
import {
  TABLE_APRON_HEIGHT,
  TABLE_APRON_INSET,
  TABLE_FOOT_Y,
  TABLE_LEG_INSET_X,
  TABLE_LEG_INSET_Z,
  TABLE_LEG_RADIUS,
  TABLE_PEDESTAL_RADIUS,
  TABLE_SIZE_X,
  TABLE_SIZE_Z,
  TABLE_THICKNESS,
  TABLE_TOP_Y,
} from "./layout";

/** Underside of the top — where the apron starts. */
const APRON_TOP_Y = TABLE_TOP_Y - TABLE_THICKNESS;
const APRON_BOTTOM_Y = APRON_TOP_Y - TABLE_APRON_HEIGHT;
const APRON_SIZE_X = TABLE_SIZE_X - TABLE_APRON_INSET * 2;
const APRON_SIZE_Z = TABLE_SIZE_Z - TABLE_APRON_INSET * 2;
/** How far a leg has to reach from the apron down to the floor. */
const LEG_HEIGHT = APRON_BOTTOM_Y - TABLE_FOOT_Y;

/**
 * The brass/neon band round the edge of the top: a slightly wider, much thinner slab
 * peeking out of the middle of the top's thickness, which is how an inlay actually
 * reads at a distance and costs twelve triangles.
 */
const EDGE_OVERHANG = 0.035;
const EDGE_THICKNESS = 0.07;

/**
 * A turned leg, as a lathe profile in (radius, height) with height normalised to 0..1:
 * foot pad, a taper, the bulge a lathe leaves halfway up, a collar, and a square-ish
 * block where it meets the apron. The first and last points sit on the axis so the
 * lathe closes at both ends and the leg is a solid, not a tube.
 */
const LEG_PROFILE: readonly [number, number][] = [
  [0.0, 0.0],
  [0.17, 0.0],
  [0.185, 0.035],
  [0.135, 0.09],
  [0.115, 0.3],
  [0.145, 0.52],
  [0.16, 0.6],
  [0.105, 0.72],
  [0.125, 0.86],
  [0.155, 0.93],
  [0.16, 1.0],
  [0.0, 1.0],
];

/**
 * The Space room's single column: a wide foot, a waisted shaft and a plate under the
 * top. Same lathe, a different silhouette — a pedestal, not a table leg.
 */
const PEDESTAL_PROFILE: readonly [number, number][] = [
  [0.0, 0.0],
  [1.05, 0.0],
  [1.05, 0.06],
  [0.72, 0.16],
  [0.46, 0.3],
  [0.4, 0.58],
  [0.5, 0.82],
  [0.9, 0.96],
  [0.95, 1.0],
  [0.0, 1.0],
];

/** Radial segments: a turned leg needs to read as round, and not one segment more. */
const LATHE_SEGMENTS = { low: 8, high: 14 } as const;

/** Per-finish PBR. Nothing here is a texture; the room's HDRI does the work. */
export const TABLE_FINISHES = {
  wood: { roughness: 0.62, metalness: 0.04 },
  gloss: { roughness: 0.09, metalness: 0.25 },
  metal: { roughness: 0.38, metalness: 0.92 },
  lacquer: { roughness: 0.26, metalness: 0.02 },
} as const;

function useLathe(
  profile: readonly [number, number][],
  radius: number,
  height: number,
  segments: number,
): LatheGeometry {
  const geometry = useMemo(
    () =>
      new LatheGeometry(
        profile.map(([r, y]) => new Vector2(r * radius, y * height)),
        segments,
      ),
    [profile, radius, height, segments],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

export interface Board3DTableProps {
  table: TableFinish;
  /**
   * True on the Low tier: fewer lathe segments. Taken from the reflector, which is the
   * one quality flag that is off on Low and on everywhere else.
   */
  lowDetail: boolean;
}

export function Board3DTable({ table, lowDetail }: Board3DTableProps) {
  const segments = lowDetail ? LATHE_SEGMENTS.low : LATHE_SEGMENTS.high;
  const legs = table.base === "legs";
  const pedestal = table.base === "pedestal";

  // Hooks run before the early return below — a lathe for a table that turns out not to
  // want one costs a few hundred bytes and keeps the hook order honest.
  const legGeometry = useLathe(LEG_PROFILE, TABLE_LEG_RADIUS, LEG_HEIGHT, segments);
  const pedestalGeometry = useLathe(
    PEDESTAL_PROFILE,
    TABLE_PEDESTAL_RADIUS,
    APRON_BOTTOM_Y - TABLE_FOOT_Y + TABLE_APRON_HEIGHT,
    segments + 4,
  );

  if (table.kind === "none") return null;

  const finish = TABLE_FINISHES[table.kind];
  const emissive = table.emissive ?? 0;

  return (
    <group raycast={() => null}>
      {/* The top. A plain box: at every camera this scene has, the edge that reads is
          the band below, and a bevelled extrusion here would cost ten times the
          triangles to round a corner nobody is looking at. */}
      <mesh position={[0, TABLE_TOP_Y - TABLE_THICKNESS / 2, 0]} castShadow receiveShadow raycast={() => null}>
        <boxGeometry args={[TABLE_SIZE_X, TABLE_THICKNESS, TABLE_SIZE_Z]} />
        <meshStandardMaterial
          color={table.color}
          roughness={finish.roughness}
          metalness={finish.metalness}
        />
      </mesh>

      {table.edgeColor && (
        <mesh position={[0, TABLE_TOP_Y - TABLE_THICKNESS * 0.55, 0]} raycast={() => null}>
          <boxGeometry
            args={[
              TABLE_SIZE_X + EDGE_OVERHANG * 2,
              EDGE_THICKNESS,
              TABLE_SIZE_Z + EDGE_OVERHANG * 2,
            ]}
          />
          <meshStandardMaterial
            color={table.edgeColor}
            emissive={table.edgeColor}
            emissiveIntensity={emissive}
            roughness={emissive > 0 ? 0.4 : 0.3}
            metalness={emissive > 0 ? 0 : 0.85}
            // A lit strip is a light, not a surface: let it burn through the room's own
            // tone mapping instead of being averaged into it.
            toneMapped={emissive === 0}
          />
        </mesh>
      )}

      {/* The apron. Always there — it is what gives the top its thickness from a seated
          camera — even in the rooms that go without legs. */}
      <mesh
        position={[0, APRON_TOP_Y - TABLE_APRON_HEIGHT / 2, 0]}
        castShadow
        receiveShadow
        raycast={() => null}
      >
        <boxGeometry args={[APRON_SIZE_X, TABLE_APRON_HEIGHT, APRON_SIZE_Z]} />
        <meshStandardMaterial
          color={table.color}
          roughness={Math.min(1, finish.roughness + 0.12)}
          metalness={finish.metalness}
        />
      </mesh>

      {legs &&
        ([
          [-TABLE_LEG_INSET_X, -TABLE_LEG_INSET_Z],
          [-TABLE_LEG_INSET_X, TABLE_LEG_INSET_Z],
          [TABLE_LEG_INSET_X, -TABLE_LEG_INSET_Z],
          [TABLE_LEG_INSET_X, TABLE_LEG_INSET_Z],
        ] as const).map(([x, z]) => (
          <mesh
            key={`${x},${z}`}
            geometry={legGeometry}
            position={[x, TABLE_FOOT_Y, z]}
            castShadow
            receiveShadow
            raycast={() => null}
          >
            <meshStandardMaterial
              color={table.color}
              roughness={finish.roughness}
              metalness={finish.metalness}
            />
          </mesh>
        ))}

      {pedestal && (
        <mesh
          geometry={pedestalGeometry}
          position={[0, TABLE_FOOT_Y, 0]}
          castShadow
          receiveShadow
          raycast={() => null}
        >
          <meshStandardMaterial
            color={table.color}
            roughness={finish.roughness}
            metalness={finish.metalness}
          />
        </mesh>
      )}
    </group>
  );
}
