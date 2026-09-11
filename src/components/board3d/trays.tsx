// src/components/board3d/trays.tsx
// The two captured-piece trays: one rounded block per side, standing ON the table top
// under each capture zone, with a shallow felt recess the taken men are set down in.
//
// Before this the trophies hung in mid-air beside the plinth, because the tray slots sit
// far outside it (`TRAY_CENTRE_X`) and the table top used to stop 0.35 past the frame.
// The top is a rectangle now (see layout.ts) and these stand on it.
//
// THE ONE INVARIANT, inherited from the table: the rim top is `SQUARE_TOP_Y`, flush with
// the board's squares, and nothing here reaches the reflective playing surface.
"use client";
import { useEffect, useMemo } from "react";
import { ExtrudeGeometry, Path, Shape } from "three";
import type { TableFinish } from "@/lib/rooms";
import { TABLE_FINISHES } from "./table";
import {
  SQUARE_TOP_Y,
  TABLE_TOP_Y,
  TRAY_CENTRE_X,
  TRAY_CENTRE_Z,
  TRAY_CORNER_RADIUS,
  TRAY_FELT_Y,
  TRAY_FLOOR_Y,
  TRAY_INNER_CORNER_RADIUS,
  TRAY_INNER_X,
  TRAY_INNER_Z,
  TRAY_SIZE_X,
  TRAY_SIZE_Z,
} from "./layout";

/** What a room that never named a felt gets: the warm grey of the Minimal studio. */
const DEFAULT_FELT = "#b4ada2";
/** Thickness of the felt slab laid into the body's top face. */
const FELT_THICKNESS = 0.02;
/**
 * How far the rim reaches DOWN into the body it stands on. Pure overlap: it means no
 * face of the rim is ever coplanar with a face of the body, which is the whole of the
 * z-fighting story for this part.
 */
const RIM_OVERLAP = 0.02;
/**
 * Points per rounded corner. A 0.18-unit fillet seen from a seat two board-lengths away
 * is four pixels of arc; three segments read as round and eight would be eight.
 */
const CORNER_SEGMENTS = { low: 3, high: 6 } as const;

/**
 * A rounded rectangle in the extruder's own XY plane, centred on the origin and wound
 * anticlockwise. `target` is a `Shape` for an outline and a `Path` for a hole — three's
 * `ExtrudeGeometry` takes the winding from `ShapeUtils`, so both may be drawn the same way.
 */
function roundedRect<T extends Path>(target: T, width: number, depth: number, radius: number): T {
  const hw = width / 2;
  const hd = depth / 2;
  const r = Math.max(0, Math.min(radius, hw, hd));
  target.moveTo(-hw + r, -hd);
  target.lineTo(hw - r, -hd);
  target.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
  target.lineTo(hw, hd - r);
  target.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
  target.lineTo(-hw + r, hd);
  target.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
  target.lineTo(-hw, -hd + r);
  target.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false);
  return target;
}

/**
 * `ExtrudeGeometry` pushes the shape along +Z. Rotated -90 deg about X the sheet lies in
 * the world's XZ plane and the extrusion becomes +Y, so every geometry below spans
 * `y = 0 .. depth` and is placed by its own BOTTOM.
 */
const LIE_FLAT: [number, number, number] = [-Math.PI / 2, 0, 0];

function extrude(shape: Shape, depth: number, curveSegments: number): ExtrudeGeometry {
  return new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments, steps: 1 });
}

interface TrayGeometries {
  body: ExtrudeGeometry;
  rim: ExtrudeGeometry;
  felt: ExtrudeGeometry;
}

/** One set of geometries, shared by BOTH trays — the block is symmetric in X. */
function useTrayGeometries(curveSegments: number): TrayGeometries {
  const geometries = useMemo<TrayGeometries>(() => {
    const outline = () =>
      roundedRect(new Shape(), TRAY_SIZE_X, TRAY_SIZE_Z, TRAY_CORNER_RADIUS);
    const inner = <T extends Path>(target: T) =>
      roundedRect(target, TRAY_INNER_X, TRAY_INNER_Z, TRAY_INNER_CORNER_RADIUS);

    const rimShape = outline();
    rimShape.holes.push(inner(new Path()));

    return {
      body: extrude(outline(), TRAY_FLOOR_Y - TABLE_TOP_Y, curveSegments),
      rim: extrude(rimShape, SQUARE_TOP_Y - TRAY_FLOOR_Y + RIM_OVERLAP, curveSegments),
      felt: extrude(inner(new Shape()), FELT_THICKNESS, curveSegments),
    };
  }, [curveSegments]);

  useEffect(
    () => () => {
      geometries.body.dispose();
      geometries.rim.dispose();
      geometries.felt.dispose();
    },
    [geometries],
  );

  return geometries;
}

export interface CapturedTrayFurnitureProps {
  table: TableFinish;
  /** True on the Low tier — the same flag the table's lathes read. */
  lowDetail: boolean;
}

export function CapturedTrayFurniture({ table, lowDetail }: CapturedTrayFurnitureProps) {
  const curveSegments = lowDetail ? CORNER_SEGMENTS.low : CORNER_SEGMENTS.high;
  const { body, rim, felt } = useTrayGeometries(curveSegments);

  // A room with no table has no tray either: the trophies would be standing on nothing,
  // which is exactly the thing this part exists to stop. No shipped room does this.
  if (table.kind === "none") return null;

  const finish = TABLE_FINISHES[table.kind];
  const feltColor = table.feltColor ?? DEFAULT_FELT;

  return (
    <group raycast={() => null}>
      {([1, -1] as const).map((side) => (
        <group key={side} position={[side * TRAY_CENTRE_X, 0, TRAY_CENTRE_Z]}>
          <mesh
            geometry={body}
            rotation={LIE_FLAT}
            position={[0, TABLE_TOP_Y, 0]}
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

          <mesh
            geometry={rim}
            rotation={LIE_FLAT}
            position={[0, TRAY_FLOOR_Y - RIM_OVERLAP, 0]}
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

          {/* The felt. Matte, unlit by any specular worth the name, and set a hair proud
              of the body so the two never fight for the same depth. */}
          <mesh
            geometry={felt}
            rotation={LIE_FLAT}
            position={[0, TRAY_FELT_Y - FELT_THICKNESS, 0]}
            receiveShadow
            raycast={() => null}
          >
            <meshStandardMaterial color={feltColor} roughness={0.96} metalness={0} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
