// src/components/board3d/squares.tsx
// 64 invisible raycast colliders (three still raycasts `visible === false` meshes, so
// these cost zero draw calls) plus the a-h / 1-8 coordinates. One set of pointer
// handlers lives on the parent group and reads the square off `e.object.userData`,
// so hovering does not allocate 64 closures per render.
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { CanvasTexture, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from "three";
import { BOARD_HALF, FILES, RANKS, squareToWorld } from "@/lib/constants";
import type { Colour, SquareId } from "@/lib/types";
import { COORD_Y, SQUARE_TOP_Y } from "./layout";

const ALL_SQUARES: { square: SquareId; position: [number, number, number] }[] = FILES.flatMap((file) =>
  RANKS.map((rank) => {
    const square = `${file}${rank}` as SquareId;
    const [x, , z] = squareToWorld(square);
    return { square, position: [x, SQUARE_TOP_Y + 0.001, z] as [number, number, number] };
  }),
);

const COORD_LABELS = [...FILES, ...RANKS] as const;
const LABEL_PX = 96;

function drawLabel(text: string): CanvasTexture | null {
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_PX;
  canvas.height = LABEL_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, LABEL_PX, LABEL_PX);
  ctx.font = `600 ${LABEL_PX * 0.62}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // A dark halo under white glyphs keeps them legible on every room frame colour.
  ctx.lineWidth = LABEL_PX * 0.1;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.strokeText(text, LABEL_PX / 2, LABEL_PX / 2);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(text, LABEL_PX / 2, LABEL_PX / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

interface CoordinatesProps {
  orientation: Colour;
}

function Coordinates({ orientation }: CoordinatesProps) {
  const textures = useMemo(() => {
    const map = new Map<string, CanvasTexture>();
    for (const label of COORD_LABELS) {
      const texture = drawLabel(label);
      if (texture) map.set(label, texture);
    }
    return map;
  }, []);

  useEffect(
    () => () => {
      for (const texture of textures.values()) texture.dispose();
    },
    [textures],
  );

  const geometry = useMemo(() => new PlaneGeometry(0.38, 0.38), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Labels lie flat on the rim and spin 180 degrees with the seat so they always read
  // right way up for the player at the near edge.
  const spin = orientation === "w" ? 0 : Math.PI;
  const edge = BOARD_HALF + 0.28;

  return (
    <group rotation-x={-Math.PI / 2} position={[0, COORD_Y, 0]} raycast={() => null}>
      {FILES.map((file, index) => {
        const texture = textures.get(file);
        if (!texture) return null;
        const [x] = squareToWorld(`${file}1` as SquareId);
        return (
          <mesh
            key={`file-${file}-${index}`}
            geometry={geometry}
            position={[x, orientation === "w" ? -edge : edge, 0]}
            rotation-z={spin}
            raycast={() => null}
          >
            <meshBasicMaterial
              map={texture}
              transparent
              depthWrite={false}
              toneMapped={false}
              // The label lies 3mm above the plinth's top face, which is far below the
              // depth buffer's resolution out at the seated camera's distance: without a
              // polygon offset the FAR half of each glyph — the half pointing away from
              // the viewer — loses its z-fight with the wood, and "d" and "h" quietly
              // become "a" and "n".
              polygonOffset
              polygonOffsetFactor={-8}
              polygonOffsetUnits={-8}
            />
          </mesh>
        );
      })}
      {RANKS.map((rank, index) => {
        const texture = textures.get(rank);
        if (!texture) return null;
        const [, , z] = squareToWorld(`a${rank}` as SquareId);
        return (
          <mesh
            key={`rank-${rank}-${index}`}
            geometry={geometry}
            // The group is rotated onto the XZ plane, so world -Z maps to local +Y.
            position={[orientation === "w" ? -edge : edge, -z, 0]}
            rotation-z={spin}
            raycast={() => null}
          >
            <meshBasicMaterial
              map={texture}
              transparent
              depthWrite={false}
              toneMapped={false}
              // The label lies 3mm above the plinth's top face, which is far below the
              // depth buffer's resolution out at the seated camera's distance: without a
              // polygon offset the FAR half of each glyph — the half pointing away from
              // the viewer — loses its z-fight with the wood, and "d" and "h" quietly
              // become "a" and "n".
              polygonOffset
              polygonOffsetFactor={-8}
              polygonOffsetUnits={-8}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export interface SquaresProps {
  orientation: Colour;
  interactive: boolean;
  hoverColor: string;
  onSelect(square: SquareId): void;
}

export function Squares({ orientation, interactive, hoverColor, onSelect }: SquaresProps) {
  const [hovered, setHovered] = useState<SquareId | null>(null);
  const hoveredRef = useRef<SquareId | null>(null);
  useCursor(interactive && hovered !== null);

  const geometry = useMemo(() => new PlaneGeometry(1, 1), []);
  const material = useMemo(() => new MeshBasicMaterial({ visible: false }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const ringGeometry = useMemo(() => new PlaneGeometry(0.98, 0.98), []);
  useEffect(() => () => ringGeometry.dispose(), [ringGeometry]);

  function squareOf(event: ThreeEvent<PointerEvent | MouseEvent>): SquareId | null {
    const value = event.object.userData.square;
    return typeof value === "string" ? (value as SquareId) : null;
  }

  const hoverPosition = hovered ? squareToWorld(hovered) : null;

  return (
    <>
      <Coordinates orientation={orientation} />

      {hoverPosition && interactive && (
        <mesh
          geometry={ringGeometry}
          rotation-x={-Math.PI / 2}
          position={[hoverPosition[0], SQUARE_TOP_Y + 0.002, hoverPosition[2]]}
          raycast={() => null}
          renderOrder={1}
        >
          <meshBasicMaterial
            color={hoverColor}
            transparent
            opacity={0.16}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      <group
        onClick={(event) => {
          event.stopPropagation();
          // Ignore the click that ends an orbit drag.
          if (event.delta > 4) return;
          if (!interactive) return;
          const square = squareOf(event);
          if (square) onSelect(square);
        }}
        onPointerMove={(event) => {
          if (!interactive) return;
          const square = squareOf(event);
          if (square === hoveredRef.current) return;
          hoveredRef.current = square;
          setHovered(square);
        }}
        onPointerLeave={() => {
          hoveredRef.current = null;
          setHovered(null);
        }}
      >
        {ALL_SQUARES.map((entry) => (
          <mesh
            key={entry.square}
            geometry={geometry}
            material={material}
            position={entry.position}
            rotation-x={-Math.PI / 2}
            visible={false}
            userData={{ square: entry.square }}
          />
        ))}
      </group>
    </>
  );
}
