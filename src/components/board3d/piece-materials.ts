// src/components/board3d/piece-materials.ts
// Room presets are procedural PBR only — the GLB has no UVs, so `map`/`normalMap`/
// `roughnessMap`/`aoMap` are impossible (assets.md §B3.7). Everything is driven by
// colour + metalness + roughness + clearcoat + envMapIntensity against the room HDRI.
import { Color, MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import type { BoardMaterialPreset, PieceMaterial, PieceMaterialPreset } from "@/lib/rooms";

export interface PieceMaterialSet {
  w: MeshPhysicalMaterial;
  b: MeshPhysicalMaterial;
}

/**
 * Only the plinth needs a standalone material: the playing surface is one plane whose
 * checker comes from a canvas map, and its material is declared in JSX because it swaps
 * between `MeshReflectorMaterial` and `meshStandardMaterial` by tier.
 */
export interface BoardMaterialSet {
  frame: MeshStandardMaterial;
}

function createPieceMaterial(cfg: PieceMaterial, allowTransmission: boolean): MeshPhysicalMaterial {
  const transmission = allowTransmission ? (cfg.transmission ?? 0) : 0;
  const material = new MeshPhysicalMaterial({
    color: new Color(cfg.color),
    metalness: cfg.metalness,
    roughness: cfg.roughness,
    clearcoat: cfg.clearcoat,
    clearcoatRoughness: cfg.clearcoatRoughness,
    envMapIntensity: cfg.envMapIntensity,
  });
  // `sheen`/`transmission` are getter/setters that recompile the shader when they go
  // from 0 to > 0, so only touch them when the preset actually asks for them.
  if (cfg.sheen) material.sheen = cfg.sheen;
  if (transmission > 0) {
    material.transmission = transmission;
    material.thickness = cfg.thickness ?? 0.6;
    material.ior = cfg.ior ?? 1.5;
  }
  return material;
}

export function createPieceMaterials(
  preset: PieceMaterialPreset,
  allowTransmission: boolean,
): PieceMaterialSet {
  return {
    w: createPieceMaterial(preset.white, allowTransmission),
    b: createPieceMaterial(preset.black, allowTransmission),
  };
}

export function disposePieceMaterials(set: PieceMaterialSet): void {
  set.w.dispose();
  set.b.dispose();
}

export function createBoardMaterials(preset: BoardMaterialPreset): BoardMaterialSet {
  return {
    frame: new MeshStandardMaterial({
      color: new Color(preset.frameColor),
      metalness: Math.min(1, preset.squareMetalness + 0.05),
      roughness: Math.min(1, preset.squareRoughness + 0.15),
    }),
  };
}

export function disposeBoardMaterials(set: BoardMaterialSet): void {
  set.frame.dispose();
}
