// src/components/board3d/board-3d-loader.tsx
// `next/dynamic({ ssr: false })` is only legal inside a Client Component (Next 16 errors
// in a Server Component), which is why this wrapper exists at all. It also keeps three,
// drei and postprocessing (~1.2 MB) out of the game-page chunk.
"use client";
import dynamic from "next/dynamic";
import type { Board3DProps } from "./board-3d";
import { Board3DSkeleton } from "./board-skeleton";

/**
 * Drop-in replacement for Board2D: both accept `BoardViewProps`. Board3D additionally
 * takes the optional `showcase` / `onFirstFrame` / `onFrameRate` props of §10.4, which
 * Board2D has no use for.
 */
export const Board3DLoader = dynamic<Board3DProps>(
  () => import("./board-3d").then((mod) => mod.default),
  { ssr: false, loading: () => <Board3DSkeleton /> },
);

export type { Board3DProps } from "./board-3d";
export type { Board3DShowcase } from "./showcase";
export { Board3DSkeleton } from "./board-skeleton";

/**
 * Warms the 3D chunk and its assets without rendering it (NFR-2a, FR-21m).
 * Pass the HDRI paths to preload — `HDRI_FILES` for the settings drawer, or just the
 * active room's `hdri` when the game page mounts.
 */
export async function preloadBoard3D(hdriFiles?: string[]): Promise<void> {
  const mod = await import("./board-3d");
  mod.preloadAssets(hdriFiles);
}

export default Board3DLoader;
