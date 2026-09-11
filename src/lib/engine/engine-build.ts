// src/lib/engine/engine-build.ts
//
// Which Stockfish build this browser gets (§I-1, user decision 2026-09-09).
//
//   sf18 — stockfish@18.0.8 `lite-single`, the DEFAULT. NNUE, 5.64 MB gzipped,
//          compiled with `-msimd128`, so it REQUIRES WASM SIMD. It defines its own
//          non-shared memory, so no SharedArrayBuffer and no COOP/COEP are needed
//          (stockfish.md §2).
//   sf11 — stockfish@11.0.0, the automatic fallback for a browser without WASM SIMD
//          (0 v128 locals in its wasm — stockfish.md §11.1). Never user-selectable.
//
// Detection is a `WebAssembly.validate` of a 31-byte module whose only function
// returns a `v128`. The byte sequence is COPIED VERBATIM from `wasm-feature-detect`
// (`dist/esm/index.js`, v1.9.0, `simd = async () => WebAssembly.validate(...)`) —
// it is not hand-rolled. Verified on Node 24.14.1: `validate` is `true` here and
// `false` for a truncated copy of the same bytes.
import type { EngineBuild } from "../constants";

/** `(module (func (result v128) (i32.const 0) (i8x16.splat) (i32x4.all_true)))` */
const SIMD_PROBE = Uint8Array.from([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
  253, 98, 11,
]);

let cached: boolean | null = null;

/**
 * True when the engine can run the SIMD (SF18) build. Cached — the answer cannot
 * change for the life of the page. Any throw (an exotic/absent `WebAssembly`) is
 * treated as "no SIMD", which is the safe direction: sf11 runs everywhere sf18 does.
 */
export function hasWasmSimd(): boolean {
  if (cached !== null) return cached;
  try {
    cached =
      typeof WebAssembly === "object" &&
      typeof WebAssembly.validate === "function" &&
      WebAssembly.validate(SIMD_PROBE);
  } catch {
    cached = false;
  }
  return cached;
}

/** The build to boot in this browser. */
export function detectEngineBuild(): EngineBuild {
  return hasWasmSimd() ? "sf18" : "sf11";
}

/** Test-only: drop the memoised SIMD answer. */
export function resetEngineBuildDetection(): void {
  cached = null;
}
