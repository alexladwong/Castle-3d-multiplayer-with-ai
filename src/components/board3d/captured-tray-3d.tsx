// src/components/board3d/captured-tray-3d.tsx
// FR-17: a captured piece slides off the board into its captor's tray.
//
// `BoardViewProps` reports only the pieces still on the board plus the captured tallies,
// so the flight is driven by remount: `<CaptureFlight>` gets a key derived from the last
// move, so every capture mounts a fresh component whose useFrame plays the arc once and
// then rests in the tray slot. No state is written from an effect anywhere in this file.
"use client";
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { KNIGHT_YAW, MESH_BY_TYPE, MOVE_ANIMATION_MS, squareToWorld } from "@/lib/constants";
import type { CapturedPieces, Colour, LastMove, PieceSymbol, SquareId } from "@/lib/types";
import type { PieceMaterialSet } from "./piece-materials";
import { pieceGeometry, useChessPieces } from "./use-chess-pieces";
import {
  PIECE_Y,
  TRAY_PIECE_SCALE,
  easeInOutCubic,
  pieceHalfHeight,
  traySlot,
} from "./layout";

const FLIGHT_MS = MOVE_ANIMATION_MS * 1.8;

/** The colour of the piece a `capturer` takes is always the opposite colour. */
function victimColour(capturer: Colour): Colour {
  return capturer === "w" ? "b" : "w";
}

interface TrayPieceProps {
  type: PieceSymbol;
  colour: Colour;
  position: [number, number, number];
  materials: PieceMaterialSet;
}

function TrayPiece({ type, colour, position, materials }: TrayPieceProps) {
  const { nodes } = useChessPieces();
  return (
    <mesh
      geometry={pieceGeometry(nodes, type)}
      material={materials[colour]}
      position={position}
      rotation-y={type === "n" ? KNIGHT_YAW[colour] : 0}
      scale={TRAY_PIECE_SCALE}
      castShadow
      dispose={null}
      raycast={() => null}
    />
  );
}

interface CaptureFlightProps {
  type: PieceSymbol;
  colour: Colour;
  fromSquare: SquareId;
  to: [number, number, number];
  materials: PieceMaterialSet;
}

function CaptureFlight({ type, colour, fromSquare, to, materials }: CaptureFlightProps) {
  const { nodes } = useChessPieces();
  const ref = useRef<Group>(null);
  const startedAt = useRef<number | null>(null);
  const [from] = useState<[number, number, number]>(() => {
    const [x, , z] = squareToWorld(fromSquare);
    return [x, PIECE_Y, z];
  });
  const [arc] = useState(() => Math.max(0.9, pieceHalfHeight(MESH_BY_TYPE[type]) * 2));

  useFrame(({ clock }) => {
    const group = ref.current;
    if (!group) return;
    if (startedAt.current === null) startedAt.current = clock.elapsedTime;
    const k = Math.min(1, ((clock.elapsedTime - startedAt.current) * 1000) / FLIGHT_MS);
    const e = easeInOutCubic(k);
    group.position.x = from[0] + (to[0] - from[0]) * e;
    group.position.z = from[2] + (to[2] - from[2]) * e;
    group.position.y = from[1] + (to[1] - from[1]) * e + Math.sin(e * Math.PI) * arc;
    group.scale.setScalar(1 + (TRAY_PIECE_SCALE - 1) * e);
  });

  return (
    <group ref={ref} position={from}>
      <mesh
        geometry={pieceGeometry(nodes, type)}
        material={materials[colour]}
        rotation-y={type === "n" ? KNIGHT_YAW[colour] : 0}
        castShadow
        dispose={null}
        raycast={() => null}
      />
    </group>
  );
}

export interface CapturedTray3DProps {
  captured: CapturedPieces;
  lastMove: LastMove | null;
  materials: PieceMaterialSet;
  animate: boolean;
}

export function CapturedTray3D({ captured, lastMove, materials, animate }: CapturedTray3DProps) {
  const flight = animate && lastMove?.captured ? lastMove : null;
  const flightCapturer = flight?.colour ?? null;
  const flightSlot = flightCapturer ? captured[flightCapturer].length - 1 : -1;

  return (
    <group>
      {(["w", "b"] as const).map((capturer) =>
        captured[capturer].map((type, index) => {
          // The newest trophy is drawn by <CaptureFlight> until the next move, so it is
          // never rendered twice at the same slot.
          if (capturer === flightCapturer && index === flightSlot) return null;
          return (
            <TrayPiece
              key={`${capturer}-${index}-${type}`}
              type={type}
              colour={victimColour(capturer)}
              position={traySlot(capturer, index)}
              materials={materials}
            />
          );
        }),
      )}

      {flight?.captured && flightCapturer && flightSlot >= 0 && (
        <CaptureFlight
          key={`${flight.from}${flight.to}-${flightSlot}`}
          type={flight.captured}
          colour={victimColour(flightCapturer)}
          // En passant is the one capture whose victim is not on `to` (FR-17).
          fromSquare={flight.capturedSquare ?? flight.to}
          to={traySlot(flightCapturer, flightSlot)}
          materials={materials}
        />
      )}
    </group>
  );
}
