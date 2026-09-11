// src/components/board3d/piece-mesh.tsx
// One piece. Geometry and material arrive by reference from the shared GLB and the room
// preset, so all 32 pieces cost one geometry upload and two materials (§I-7).
"use client";
import { useRef, useState } from "react";
import { Outlines } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { MathUtils, type BufferGeometry, type Group, type Material, type Mesh } from "three";
import { KNIGHT_YAW, PIECE_LIFT_Y, squareToWorld } from "@/lib/constants";
import type { BoardPiece, SquareId } from "@/lib/types";
import {
  LIFT_DAMP_LAMBDA,
  MOVE_DAMP_LAMBDA,
  PIECE_Y,
  TRAVEL_LIFT_Y,
} from "./layout";

export interface PieceMeshProps {
  piece: BoardPiece;
  geometry: BufferGeometry;
  material: Material;
  selected: boolean;
  interactive: boolean;
  /** False while flipping or under reduced motion — the piece snaps instead (NFR-10). */
  animate: boolean;
  outlineColor: string;
  /** True on tiers with no post-processing: draw an inflated-shell outline instead. */
  meshOutline: boolean;
  onSelect(square: SquareId): void;
  /** Ref callback that hands the selected mesh to the post-processing Outline effect. */
  registerSelected(mesh: Mesh | null): void;
}

export function PieceMesh({
  piece,
  geometry,
  material,
  selected,
  interactive,
  animate,
  outlineColor,
  meshOutline,
  onSelect,
  registerSelected,
}: PieceMeshProps) {
  // Set once so react-three-fiber never re-applies `position` and fights the tween.
  const [initialPosition] = useState<[number, number, number]>(() => {
    const [x, , z] = squareToWorld(piece.square);
    return [x, PIECE_Y, z];
  });

  const groupRef = useRef<Group>(null);
  const [targetX, , targetZ] = squareToWorld(piece.square);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const restY = PIECE_Y + (selected ? PIECE_LIFT_Y : 0);
    if (!animate) {
      group.position.set(targetX, restY, targetZ);
      return;
    }
    const dx = targetX - group.position.x;
    const dz = targetZ - group.position.z;
    const travelling = dx * dx + dz * dz > 0.0004;
    group.position.x = MathUtils.damp(group.position.x, targetX, MOVE_DAMP_LAMBDA, delta);
    group.position.z = MathUtils.damp(group.position.z, targetZ, MOVE_DAMP_LAMBDA, delta);
    group.position.y = MathUtils.damp(
      group.position.y,
      travelling && !selected ? restY + TRAVEL_LIFT_Y : restY,
      LIFT_DAMP_LAMBDA,
      delta,
    );
  });

  return (
    <group ref={groupRef} position={initialPosition}>
      <mesh
        name={`piece:${piece.id}`}
        geometry={geometry}
        material={material}
        rotation-y={piece.type === "n" ? KNIGHT_YAW[piece.colour] : 0}
        castShadow
        receiveShadow={false}
        dispose={null}
        ref={selected ? registerSelected : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (event.delta > 4) return;
          if (!interactive) return;
          onSelect(piece.square);
        }}
      >
        {selected && meshOutline && (
          <Outlines
            thickness={0.035}
            color={outlineColor}
            screenspace={false}
            transparent
            opacity={0.9}
            toneMapped={false}
            angle={Math.PI}
            renderOrder={3}
          />
        )}
      </mesh>
    </group>
  );
}
