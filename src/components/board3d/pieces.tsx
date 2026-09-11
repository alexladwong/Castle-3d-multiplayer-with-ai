// src/components/board3d/pieces.tsx
// The 32 live pieces. Identity comes from `BoardPiece.id` (PieceTracker, §D.8), so a
// piece keeps its React key across positions and therefore tweens between squares
// instead of unmounting and popping back (FR-17).
"use client";
import type { Mesh } from "three";
import type { BoardPiece, SquareId } from "@/lib/types";
import type { PieceMaterialSet } from "./piece-materials";
import { pieceGeometry, useChessPieces } from "./use-chess-pieces";
import { PieceMesh } from "./piece-mesh";

export interface PiecesProps {
  position: BoardPiece[];
  materials: PieceMaterialSet;
  selectedSquare: SquareId | null;
  interactive: boolean;
  animate: boolean;
  outlineColor: string;
  /** True on tiers with no post-processing Outline effect. */
  meshOutline: boolean;
  onSelect(square: SquareId): void;
  registerSelected(mesh: Mesh | null): void;
}

export function Pieces({
  position,
  materials,
  selectedSquare,
  interactive,
  animate,
  outlineColor,
  meshOutline,
  onSelect,
  registerSelected,
}: PiecesProps) {
  const { nodes } = useChessPieces();

  return (
    <group>
      {position.map((piece) => (
        <PieceMesh
          key={piece.id}
          piece={piece}
          geometry={pieceGeometry(nodes, piece.type)}
          material={materials[piece.colour]}
          selected={piece.square === selectedSquare}
          interactive={interactive}
          animate={animate}
          outlineColor={outlineColor}
          meshOutline={meshOutline}
          onSelect={onSelect}
          registerSelected={registerSelected}
        />
      ))}
    </group>
  );
}
