// src/components/game/board-3d-loader.tsx  [P3 -> re-export]
// INTEGRATION: this used to hold a SECOND `next/dynamic` wrapper around the same module,
// which produced two chunks and two loading states for one component. The canonical loader
// lives with the 3D package; this file only keeps the import path the game shell uses.
export {
  Board3DLoader as default,
  Board3DLoader,
  preloadBoard3D,
} from "@/components/board3d/board-3d-loader";
