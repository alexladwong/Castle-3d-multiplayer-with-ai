// src/components/board3d/use-chess-pieces.ts
// One GLB, six meshes, shared BY REFERENCE across all 32 pieces (assets.md §B3.5/§B3.6).
// Never `<Clone deep>`, never `<Instances>` — per-piece selection and outlines need real meshes.
"use client";
import type * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { MESH_BY_TYPE, PIECE_MODEL_URL, type PieceMeshName } from "@/lib/constants";
import type { PieceSymbol } from "@/lib/types";

/**
 * Local declaration of the loader result. `three-stdlib`'s `GLTF` type is NOT
 * resolvable from app code under this pnpm layout (assets.md §B3.5) — do not import it.
 */
export interface ChessPiecesGltf {
  nodes: Record<PieceMeshName, THREE.Mesh>;
  materials: { PieceMaterial: THREE.MeshStandardMaterial };
}

/** `useDraco: false` — the file is uncompressed, so never attach the gstatic decoder. */
export function useChessPieces(): ChessPiecesGltf {
  return useGLTF(PIECE_MODEL_URL, false) as unknown as ChessPiecesGltf;
}

export function pieceGeometry(nodes: ChessPiecesGltf["nodes"], type: PieceSymbol): THREE.BufferGeometry {
  return nodes[MESH_BY_TYPE[type]].geometry;
}

export function preloadChessPieces(): void {
  useGLTF.preload(PIECE_MODEL_URL, false);
}

// Module-scope preload (H.1). Guarded because a `"use client"` module still evaluates
// in Node during a prerender, where a relative fetch would fail.
if (typeof window !== "undefined") preloadChessPieces();
