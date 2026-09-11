// src/lib/constants.ts
import type { Colour, SquareId } from "./types";

/* ----------------------------------------------------------- board geometry */
/** 1 board square = 1 world unit; the board is centred on the origin, +Y up.
 *  White sits at +Z (camera preset "white" is at [0, 7.5, 9]).
 *  a1 -> [-3.5, 0, +3.5];  h8 -> [+3.5, 0, -3.5]. */
export const SQUARE_SIZE = 1;
export const BOARD_HALF = 3.5;
export const BOARD_EXTENT = 8; // 8 squares across
export const PIECE_LIFT_Y = 0.3; // selected-piece lift (FR-30)
export const CAPTURE_TRAY_X = 5.6; // tray sits this far off the board on ±X

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

export function squareToWorld(square: SquareId): [number, number, number] {
  const file = square.charCodeAt(0) - 97; // 'a' -> 0
  const rank = square.charCodeAt(1) - 49; // '1' -> 0
  return [file - BOARD_HALF, 0, BOARD_HALF - rank];
}

export function worldToSquare(x: number, z: number): SquareId | null {
  const file = Math.round(x + BOARD_HALF);
  const rank = Math.round(BOARD_HALF - z);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]}${RANKS[rank]}` as SquareId;
}

export function squareIndices(square: SquareId): { file: number; rank: number } {
  return { file: square.charCodeAt(0) - 97, rank: square.charCodeAt(1) - 49 };
}

/** True when the square is a light square (a1 is dark). */
export function isLightSquare(square: SquareId): boolean {
  const { file, rank } = squareIndices(square);
  return (file + rank) % 2 === 1;
}

/** Row/column for a 2D grid rendered from `orientation`'s point of view. */
export function gridPosition(square: SquareId, orientation: Colour) {
  const { file, rank } = squareIndices(square);
  return orientation === "w"
    ? { row: 7 - rank, col: file }
    : { row: rank, col: 7 - file };
}

/* ------------------------------------------------------------------ timings */
export const MOVE_ANIMATION_MS = 250; // FR-17
export const CAMERA_FLIP_MS = 800; // FR-21c
/**
 * camera-controls damps with Unity-style `smoothDamp` (omega = 2 / smoothTime) and only
 * dispatches `rest` — which resolves the `setLookAt` promise and releases the rig's input
 * lock — once the remaining delta drops under `restThreshold` (0.01). For the half-turn
 * between the two seats (delta theta = PI) that happens at omega*t ~= 7.95, i.e.
 * t ~= 3.98 * smoothTime. Derive it from CAMERA_FLIP_MS so the rig's lock and the
 * controller's `flipping` timer can never drift apart (FR-21c).
 */
export const CAMERA_FLIP_SMOOTH_TIME = CAMERA_FLIP_MS / 4000; // 0.2 s
export const TURN_OVERLAY_MS = 900; // FR-21d hand-over card
export const HEARTBEAT_INTERVAL_MS = 15_000; // FR-32
export const ABANDON_TIMEOUT_MS = 60_000; // FR-32
export const PRESENCE_TTL_MS = 10 * 60_000;
export const REPLAY_AUTOPLAY_MS = 900; // FR-54

/* ---------------------------------------------------------------- gameplay */
export const START_RATING = 1200;
export const K_ONLINE = 32;
export const K_AI = 16;
export const MIN_RATING = 100;
export const MAX_HINTS_PER_GAME = 3; // FR-40
export const MAX_LOCAL_NAME_LENGTH = 24;
export const MAX_COMMENTARY_LENGTH = 400;
export const MAX_ROOM_IMAGE_BYTES = 5 * 1024 * 1024; // FR-21k
export const LEADERBOARD_SIZE = 100; // FR-50

/* -------------------------------------------------------------- matchmaking */
export const QUEUE_BASE_RANGE = 200; // FR-23
export const QUEUE_WIDEN_STEP = 100;
export const QUEUE_WIDEN_INTERVAL_MS = 10_000;
export const QUEUE_SWEEP_INTERVAL_MS = 5_000;

/** Rating window for a queue entry that joined `joinedAt`, evaluated at `now`. */
export function queueRangeAt(joinedAt: number, now: number): number {
  const steps = Math.floor(Math.max(0, now - joinedAt) / QUEUE_WIDEN_INTERVAL_MS);
  return QUEUE_BASE_RANGE + QUEUE_WIDEN_STEP * steps;
}

/* ---------------------------------------------------------------------- AI */
export const EVE_BUDGET_MS = 10_000; // NFR-5 hard ceiling for the Eve call
/** NFR-5: the agent phase (eve + the §F.6 direct-model retry) shares ONE deadline,
 *  so a slow eve failure can never buy the fallback a second full budget. */
export const AI_DIRECT_MIN_BUDGET_MS = 1_500; // below this, skip the direct attempt
/** Browser-side ceiling for one POST /api/ai/move. The route holds itself to
 *  EVE_BUDGET_MS; this is the backstop for a wedged route, so a turn can never
 *  hang until `maxDuration` with the panel stuck on "Calculating…". */
export const AI_ROUTE_TIMEOUT_MS = EVE_BUDGET_MS + 5_000;
export const AI_TARGET_LATENCY_MS = 3_000; // FR-38 target; UI shows "still thinking" past this
export const AI_ROUTE_MAX_DURATION = 30; // seconds; `export const maxDuration` on the route
/**
 * Which engine binary a worker was booted from.
 *   sf18 — stockfish@18.0.8 `lite-single`: the DEFAULT (user decision 2026-09-09).
 *          NNUE, 5.64 MB gzipped, needs WASM SIMD, no SharedArrayBuffer/COOP+COEP.
 *   sf11 — stockfish@11.0.0: the automatic fallback for browsers without WASM SIMD.
 *          Classical eval, 669 KB gzipped. NOT a user-facing setting.
 */
export type EngineBuild = "sf18" | "sf11";

/**
 * Classic, same-origin workers loaded by URL STRING from `public/` — never
 * `new Worker(new URL(...))` (Turbopack appends a `#params=[…]` fragment and both
 * glues read `location.hash` as the wasm-path override). Each `.js` resolves its
 * `.wasm` as a sibling, so the basenames and directories must not change without
 * re-running `pnpm copy:stockfish` (stockfish.md §3.2 and §11.3).
 */
export const STOCKFISH_WORKER_URLS: Record<EngineBuild, string> = {
  sf18: "/stockfish/sf18/stockfish-18-lite-single.js",
  sf11: "/stockfish/sf11/stockfish.js",
};

/** Byte size of each build's `.wasm`, used to show progress before `total` arrives. */
export const STOCKFISH_WASM_BYTES: Record<EngineBuild, number> = {
  sf18: 7_295_411,
  sf11: 1_413_916,
};

/** Human label for the AI-move source badge. */
export const ENGINE_BUILD_LABEL: Record<EngineBuild, string> = {
  sf18: "SF18",
  sf11: "SF11",
};

export const STOCKFISH_CANDIDATE_SKILL_LEVEL = 20; // honest ranking for candidates (stockfish.md §6)

/* ------------------------------------------------------- 3D piece model */
/** Verified asset: 6 separate meshes, no extensions, no UVs, base at y = 0,
 *  1 board square = 1 world unit (assets.md §B3.4). */
export const PIECE_MODEL_URL = "/models/chess-pieces.glb";
export type PieceMeshName = "King" | "Queen" | "Rook" | "Bishop" | "Knight" | "Pawn";
export const MESH_BY_TYPE: Record<"p" | "n" | "b" | "r" | "q" | "k", PieceMeshName> = {
  p: "Pawn", n: "Knight", b: "Bishop", r: "Rook", q: "Queen", k: "King",
};
/** Measured heights in board-square units — use for tray stacking and camera framing. */
export const PIECE_HEIGHTS: Record<PieceMeshName, number> = {
  King: 1.75, Queen: 1.572, Bishop: 1.1121, Knight: 1.0875, Rook: 0.9432, Pawn: 0.845,
};
/** The knight model faces -X. Rotate so each colour looks at the opponent. */
export const KNIGHT_YAW: Record<"w" | "b", number> = {
  // INTEGRATION FIX: the two values in ARCHITECTURE.md §D.2 were swapped. The mesh faces -X
  // (verified: Knight POSITION accessor min.x -0.2672 vs max.x +0.2468), and rotating -X by
  // -PI/2 about Y yields -Z (verified against three@0.185.1). White sits at +Z, so white must
  // face -Z. assets.md §B3.4 prose agrees ("to face -Z apply rotation-y={-Math.PI / 2}").
  w: -Math.PI / 2, // face -Z (toward black)
  b: Math.PI / 2,  // face +Z (toward white)
};
/** Mandatory CC-BY 3.0 credit — must be rendered somewhere a user can see it. */
export const PIECE_MODEL_CREDIT = {
  text: "Chess pieces by Jarlan Perez via Poly Pizza — CC BY 3.0",
  authorUrl: "https://poly.pizza",
  licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
};

/* ------------------------------------------------------------------- misc */
export const DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const CAMERA_SESSION_KEY = "chess3d.camera";
export const SETTINGS_STORAGE_KEY = "chess3d:settings";
export const PIECE_VALUES: Record<"p" | "n" | "b" | "r" | "q" | "k", number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
};

/** docs/PRO_TUTOR.md §5.3: the tutor answers at most this many questions per game. */
export const MAX_TUTOR_TURNS_PER_GAME = 40;

/**
 * The Clerk feature slug carried by the `pro` plan (docs/PRO_TUTOR.md §1,
 * docs/research/clerk-billing.md). Written here, in a module with no React and no
 * server imports, because BOTH sides of the gate ask about it: the panel through
 * `has({ feature })` in the browser, and the route through `has({ feature })` on the
 * server. One string, so a typo can only ever be in one place.
 */
export const TUTOR_FEATURE = "tutor";
