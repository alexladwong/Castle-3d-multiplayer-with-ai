// src/components/board3d/board-surface-3d.tsx
// The physical board: a plinth plus ONE reflective playing surface (FR-27).
//
// The 8x8 checker is painted into that surface's `map` from a canvas rather than built
// from 64 tile meshes. Opaque tiles standing on top of the mirror plane hid it over the
// whole playing area, so nothing but a thin border ever reflected — FR-27 asks for
// "pieces reflect in the board". Two draw calls now cover the entire board.
"use client";
import { useEffect, useMemo } from "react";
import { MeshReflectorMaterial } from "@react-three/drei";
import { CanvasTexture, SRGBColorSpace } from "three";
import { BOARD_EXTENT, FILES, RANKS, isLightSquare } from "@/lib/constants";
import type { SquareId } from "@/lib/types";
import type { RoomPreset } from "@/lib/rooms";
import type { QualityConfig } from "@/lib/camera";
import { createBoardMaterials, disposeBoardMaterials } from "./piece-materials";
import {
  BOARD_SURFACE_Y,
  PLINTH_BODY_HEIGHT,
  PLINTH_CENTRE_Y,
  PLINTH_SIZE,
  TILE_SIZE,
} from "./layout";

/** 128 px per square, so the 0.02-unit grout line survives mipmapping at a low angle. */
const CHECKER_CELL_PX = 128;
const CHECKER_PX = CHECKER_CELL_PX * 8; // 1024 — power of two, one texel grid per square

/**
 * The checkerboard as a texture. `Texture.flipY` puts canvas row 0 at v = 1, and the
 * plane is rotated -90 deg about X (local +Y -> world -Z), so the top-left texel is a8.
 * `grout` is the surface colour showing between the squares — exactly what the old tile
 * gaps revealed.
 */
function createCheckerTexture(
  light: string,
  dark: string,
  grout: string,
): CanvasTexture | null {
  const canvas = document.createElement("canvas");
  canvas.width = CHECKER_PX;
  canvas.height = CHECKER_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, CHECKER_PX, CHECKER_PX);

  const inset = ((1 - TILE_SIZE) / 2) * CHECKER_CELL_PX;
  const size = CHECKER_CELL_PX - inset * 2;
  for (let col = 0; col < 8; col++) {
    for (let row = 0; row < 8; row++) {
      const square = `${FILES[col]}${RANKS[7 - row]}` as SquareId;
      ctx.fillStyle = isLightSquare(square) ? light : dark;
      ctx.fillRect(col * CHECKER_CELL_PX + inset, row * CHECKER_CELL_PX + inset, size, size);
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8; // three clamps this to the renderer's own maximum
  return texture;
}

export interface BoardSurface3DProps {
  room: RoomPreset;
  quality: QualityConfig;
}

export function BoardSurface3D({ room, quality }: BoardSurface3DProps) {
  const materials = useMemo(() => createBoardMaterials(room.board), [room.board]);
  useEffect(() => () => disposeBoardMaterials(materials), [materials]);

  const reflector = room.board.reflector;
  const { lightSquare, darkSquare } = room.board;
  const checker = useMemo(
    () => createCheckerTexture(lightSquare, darkSquare, reflector.color),
    [lightSquare, darkSquare, reflector.color],
  );
  useEffect(() => () => checker?.dispose(), [checker]);

  return (
    <group>
      {/* Plinth: the body the board sits on. Its top face is the frame around the
          playing area, and it is the shadow catcher on Low. */}
      <mesh position={[0, PLINTH_CENTRE_Y, 0]} receiveShadow raycast={() => null}>
        <boxGeometry args={[PLINTH_SIZE, PLINTH_BODY_HEIGHT, PLINTH_SIZE]} />
        <primitive object={materials.frame} attach="material" />
      </mesh>

      {/* Playing surface. `MeshReflectorMaterial` mirrors around the mesh's local +Z, so
          the plane must be rotated (never the geometry). Reflections off on Low (FR-31);
          the checker map is identical either way. The material colour stays white — the
          map carries the square colours. */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, BOARD_SURFACE_Y, 0]}
        receiveShadow
        raycast={() => null}
      >
        <planeGeometry args={[BOARD_EXTENT, BOARD_EXTENT]} />
        {quality.reflector.enabled ? (
          <MeshReflectorMaterial
            // 0.6 mm above the plinth's top face is below what the depth buffer can
            // resolve out at the seated camera's distance, and the playing area lost the
            // z-fight in stripes — worst on a small canvas, where the fitted camera sits
            // furthest back. A polygon offset settles it at every distance.
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
            map={checker}
            resolution={quality.reflector.resolution}
            blur={reflector.blur}
            mixBlur={reflector.mixBlur}
            mixStrength={reflector.mixStrength}
            mixContrast={reflector.mixContrast}
            mirror={reflector.mirror}
            depthScale={1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            metalness={reflector.metalness}
            roughness={reflector.roughness}
          />
        ) : (
          <meshStandardMaterial
            // Same z-fight, same fix — see the reflective branch above.
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
            map={checker}
            metalness={reflector.metalness}
            roughness={Math.min(1, reflector.roughness + 0.2)}
          />
        )}
      </mesh>
    </group>
  );
}
