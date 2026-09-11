// src/lib/rooms.ts
// Adding a room = adding one entry here plus a 1k CC0 .hdr in public/hdri/.
// No scene code changes (FR-21n). HDRI provenance is in docs/research/assets.md §A2.
import type { OrbitSweep } from "./camera";
import type { RoomColors, RoomPresetId } from "./types";

export interface KeyLightConfig {
  position: [number, number, number];
  intensity: number;
  color: string;
}

export interface LightRig {
  key: KeyLightConfig;
  ambientIntensity: number;
  /** drei <Environment environmentIntensity> — scales IBL on PBR materials. */
  envIntensity: number;
  /** drei <Environment backgroundIntensity>. */
  bgIntensity: number;
  /** drei <Environment blur> (0..1). */
  backgroundBlur: number;
  /** Y rotation of the env map, radians. */
  envYaw: number;
}

export interface ReflectorConfig {
  /** [w, h] px of the off-screen buffer; [0,0] skips the blur pass. */
  blur: [number, number];
  mixBlur: number;
  mixStrength: number;
  mixContrast: number;
  mirror: number; // 0..1
  metalness: number;
  roughness: number;
  color: string;
}

export interface BoardMaterialPreset {
  lightSquare: string;
  darkSquare: string;
  squareMetalness: number;
  squareRoughness: number;
  frameColor: string;
  reflector: ReflectorConfig;
}

export interface PieceMaterial {
  color: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  /** > 0 switches the piece to <meshPhysicalMaterial transmission> (High tier only). */
  transmission?: number;
  thickness?: number;
  ior?: number;
  sheen?: number;
  envMapIntensity: number;
}

export interface PieceMaterialPreset {
  white: PieceMaterial;
  black: PieceMaterial;
}

export interface RoomFloor {
  kind: "none" | "grid" | "backdrop" | "ground";
  color?: string;
}

export interface RoomExtras {
  stars?: { radius: number; depth: number; count: number; factor: number; speed: number };
  sparkles?: { count: number; scale: number; size: number; speed: number; color: string };
}

/**
 * The furniture the board stands on. Its top face is `TABLE_TOP_Y` — exactly the plinth's
 * underside — in every room, so a table is never allowed to move a square.
 */
export interface TableFinish {
  /**
   * The material, and with it the whole read of the piece: turned walnut in the study,
   * black acrylic in the arcade, brushed metal in space. `"none"` leaves the board
   * standing on its own plinth, as it always did.
   */
  kind: "wood" | "gloss" | "metal" | "lacquer" | "none";
  color: string;
  /** A band around the edge of the top: brass inlay, or the arcade's neon strip. */
  edgeColor?: string;
  /**
   * The felt in the bottom of the two captured-piece trays that stand on this top
   * (`src/components/board3d/trays.tsx`). Baize where the room is a club room, and the
   * room's own darkness everywhere else — it is a surface the eye should read as cloth
   * and then stop reading, so every value here is well under the pieces standing on it.
   * Omit it and the tray gets a warm studio grey.
   */
  feltColor?: string;
  /** Emissive strength of that band. Absent or 0 = an inlay, not a light. */
  emissive?: number;
  /**
   * What holds the top up.
   *
   * `"legs"` is four turned legs on an apron. `"pedestal"` is one column, for a board
   * adrift where four legs would only argue with the stars. `"none"` is the top and its
   * apron alone, and it exists for the Park: drei's `<Environment ground>` projects that
   * room's meadow onto a disk at world y = 0 — the height of the board itself — so a leg
   * there would be drawn standing in the middle of the grass rather than on it.
   */
  base: "legs" | "pedestal" | "none";
}

export interface HighlightColours {
  select: string;
  legal: string;
  capture: string;
  last: string;
  check: string;
}

export interface RoomPreset {
  id: Exclude<RoomPresetId, "custom">;
  label: string;
  description: string;
  /** Public path; the file already exists. */
  hdri: string;
  /** Visible panorama, loaded separately from the smaller HDR lighting probe. */
  backdrop?: string;
  /** 'hdri' shows the HDRI as the skybox; 'colour' paints a flat <color attach="background">. */
  background: "hdri" | "colour";
  backgroundColor?: string;
  lights: LightRig;
  board: BoardMaterialPreset;
  pieces: PieceMaterialPreset;
  floor: RoomFloor;
  /** The table under the board. */
  table: TableFinish;
  /**
   * The arc the idle cinematic camera sweeps in this room (FR-24), centred on the side
   * of the panorama that is worth looking at. Omit it and the room gets
   * `DEFAULT_ORBIT_SWEEP` — 55 deg either side of the white seat, which is the right
   * answer for any room whose `envYaw` already put its best wall in front of that seat.
   *
   * `centerAzimuth` is a camera azimuth, not a panorama yaw: 0 is the white seat, and a
   * positive value turns the camera anticlockwise seen from above, which walks the view
   * BACKWARD through the panorama's u (see `OrbitSweep`). Provenance for every value is
   * in docs/research/assets.md §A2d.
   */
  orbit?: OrbitSweep;
  extras: RoomExtras;
  highlight: HighlightColours;
  /**
   * The room's light, as ONE colour the app frame can paint behind the canvas so the page
   * around the board belongs to the same room. Taken from the key light, because that is
   * what the visitor sees spilling off the board. Consumed outside the 3D scene: nothing
   * in board3d/ reads it.
   */
  glow: string;
}

const HIGHLIGHT_DEFAULT: HighlightColours = {
  select: "#ffd166",
  legal: "#5ee0a1",
  capture: "#ff9f43",
  last: "#ffd166",
  check: "#ff3b3b",
};

export const ROOMS: Record<Exclude<RoomPresetId, "custom">, RoomPreset> = {
  study: {
    id: "study",
    label: "Classic Study",
    description: "Walnut bookshelves, soft daylight, and a quiet seat at the table.",
    hdri: "/hdri/study.hdr", // polyhaven `combination_room`, CC0, Sergej Majboroda
    backdrop: "/backdrops/study-library.png",
    background: "hdri",
    lights: {
      key: { position: [4, 8, 5], intensity: 2.4, color: "#ffd9a8" },
      ambientIntensity: 0.11,
      envIntensity: 0.72,
      bgIntensity: 1.1,
      backgroundBlur: 0.25,
      envYaw: 0,
    },
    board: {
      lightSquare: "#e8d3ac",
      darkSquare: "#8b5a34",
      squareMetalness: 0.05,
      squareRoughness: 0.5,
      frameColor: "#4a2f1c",
      reflector: {
        blur: [300, 100], mixBlur: 1, mixStrength: 0.8, mixContrast: 1,
        mirror: 0.35, metalness: 0.1, roughness: 0.6, color: "#2a1a10",
      },
    },
    pieces: {
      white: { color: "#f0e2c8", metalness: 0.05, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 0.9 },
      black: { color: "#2b1b12", metalness: 0.05, roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.25, envMapIntensity: 0.9 },
    },
    floor: { kind: "none" },
    // Walnut with a thin brass inlay round the edge — the study's own two materials.
    table: {
      kind: "wood",
      color: "#3c2718",
      edgeColor: "#c9a24a",
      // DESIGN.md's baize (#3f9b73), taken a long way down: this room's key light is
      // 2.4 and warm, and the token's own value rendered as a snooker table.
      feltColor: "#163d2e",
      base: "legs",
    },
    // The library panorama surrounds the whole table.
    orbit: { centerAzimuth: 0, halfArc: 0.95 },
    extras: {},
    highlight: HIGHLIGHT_DEFAULT,
    glow: "#ffd9a8",
  },

  space: {
    id: "space",
    label: "Space",
    description: "Luminous nebulae, silver pieces, and an endless field of stars.",
    hdri: "/hdri/space.hdr", // polyhaven `qwantani_night_puresky`, CC0 — IBL only
    // The night probe supplies reflections; a seam-free nebula shader supplies the sky.
    background: "colour",
    backgroundColor: "#152641",
    lights: {
      key: { position: [-5, 9, -3], intensity: 2.4, color: "#bcd4ff" },
      ambientIntensity: 0.35,
      envIntensity: 1.1,
      bgIntensity: 0.7, // keep the horizon glow from reading as dawn (assets.md §A2)
      backgroundBlur: 0.0,
      envYaw: 0.6,
    },
    board: {
      lightSquare: "#c9d6ef",
      darkSquare: "#374967",
      squareMetalness: 0.25,
      squareRoughness: 0.2,
      frameColor: "#263954",
      reflector: {
        blur: [120, 60], mixBlur: 0.8, mixStrength: 0.8, mixContrast: 1,
        mirror: 0.3, metalness: 0.15, roughness: 0.4, color: "#0a0e1c",
      },
    },
    pieces: {
      white: { color: "#dce7ff", metalness: 0.35, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.3 },
      black: { color: "#364666", metalness: 0.25, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 1.3 },
    },
    floor: { kind: "none" },
    // One brushed pedestal, not four legs: adrift, the board should look moored rather
    // than furnished, and a table's worth of legs would fight the starfield behind it.
    table: {
      kind: "metal",
      color: "#2b3243",
      edgeColor: "#8fa6d8",
      // Near-black, with the blue the rest of this room is lit by.
      feltColor: "#0d1119",
      base: "pedestal",
    },
    // Nebula and stars surround both seats and the full cinematic sweep.
    orbit: { centerAzimuth: 0, halfArc: 0.95 },
    extras: { stars: { radius: 50, depth: 20, count: 5000, factor: 5, speed: 0.4 } },
    highlight: { ...HIGHLIGHT_DEFAULT, legal: "#5ad1ff", last: "#8f9bff" },
    glow: "#bcd4ff",
  },

  park: {
    id: "park",
    label: "Park",
    description: "A summer meadow, a table, and nothing to do but play.",
    hdri: "/hdri/park.hdr", // polyhaven `meadow_2`, CC0
    backdrop: "/backdrops/park-8k.jpg",
    background: "hdri",
    lights: {
      key: { position: [6, 10, 4], intensity: 2.6, color: "#fff4e0" },
      ambientIntensity: 0.25,
      envIntensity: 1.0,
      bgIntensity: 1.0,
      backgroundBlur: 0.15,
      // Re-checked at 4 yaws (assets.md §A2c): `meadow_2` is grass and trees the whole
      // way round and `floor: ground` projects the meadow under the board, so the seat
      // view barely changes. -0.4 keeps the mown path — and not one of the bald patches
      // at u ~ 0.6 / 0.75 — behind the board. Unchanged.
      envYaw: -0.4,
    },
    board: {
      lightSquare: "#f2ead6",
      darkSquare: "#6f8f5c",
      squareMetalness: 0.02,
      squareRoughness: 0.7,
      frameColor: "#5a4632",
      reflector: {
        blur: [400, 140], mixBlur: 1.2, mixStrength: 0.5, mixContrast: 1,
        mirror: 0.2, metalness: 0.05, roughness: 0.75, color: "#3b3327",
      },
    },
    pieces: {
      white: { color: "#f6f1e4", metalness: 0.02, roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.4, envMapIntensity: 1.0 },
      black: { color: "#33322c", metalness: 0.02, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.35, envMapIntensity: 1.0 },
    },
    floor: { kind: "ground" }, // drei <Environment ground> so the HDRI floor sits under the board
    // Weathered oak, and no legs: this room's ground is projected at y = 0, which is the
    // height of the board itself, so a leg would stand in mid-air over the grass (see
    // `TableFinish.base`). A thick garden slab is the honest reading of that geometry.
    table: {
      kind: "wood",
      color: "#8b7350",
      // Baize again, a shade lighter than the study's — this one is under open sky,
      // not a lamp, so it needs less taking down.
      feltColor: "#1d5440",
      base: "none",
    },
    // `meadow_2` is grass and trees the whole way round and `floor: ground` projects the
    // meadow under the board, so the sweep barely changes what is behind it — verified at
    // 5 samples across a full swing. Symmetric about the white seat.
    orbit: { centerAzimuth: 0, halfArc: 0.95 },
    extras: {},
    highlight: HIGHLIGHT_DEFAULT,
    glow: "#fff4e0",
  },

  arcade: {
    id: "arcade",
    label: "Neon Arcade",
    description: "A luminous pavilion of cyan, rose light, and midnight gloss.",
    hdri: "/hdri/minimal.hdr", // neutral CC0 studio probe; geometry supplies the neon
    background: "colour",
    backgroundColor: "#191d30",
    lights: {
      // Neutral light preserves piece identity; cyan and pink light the surrounding room.
      key: { position: [-4, 7, 4], intensity: 1.8, color: "#b6ebff" },
      ambientIntensity: 0.4,
      envIntensity: 0.8,
      bgIntensity: 0.85,
      backgroundBlur: 0.3,
      envYaw: 2.83,
    },
    board: {
      lightSquare: "#dfe9ff",
      darkSquare: "#303149",
      squareMetalness: 0.2,
      squareRoughness: 0.32,
      frameColor: "#0b0810",
      reflector: {
        blur: [80, 40], mixBlur: 0.6, mixStrength: 0.55, mixContrast: 1,
        mirror: 0.2, metalness: 0.12, roughness: 0.38, color: "#08060d",
      },
    },
    pieces: {
      white: { color: "#f2f7ff", metalness: 0.15, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.9 },
      black: { color: "#34354f", metalness: 0.25, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.9 },
    },
    floor: { kind: "none" },
    // Black acrylic with the room's own magenta running round the edge, lit.
    table: {
      kind: "gloss",
      color: "#0b0810",
      edgeColor: "#ff6ad5",
      // A magenta so dark it is only a colour where the neon edge reaches it.
      feltColor: "#2a0b22",
      base: "legs",
    },
    // The geometric light pavilion is finished on both sides.
    orbit: { centerAzimuth: 0, halfArc: 0.95 },
    extras: { sparkles: { count: 40, scale: 12, size: 2, speed: 0.3, color: "#7cf7ff" } },
    highlight: { select: "#ff6ad5", legal: "#7cf7ff", capture: "#ffb347", last: "#ff6ad5", check: "#ff2d55" },
    // Not the key light (see `lights.key`): the ENVIRONMENT is magenta here, and the
    // magenta is what spills off the board and onto the page.
    glow: "#ff6ad5",
  },

  minimal: {
    id: "minimal",
    label: "Minimal White",
    description: "A clean studio. Nothing but the game.",
    hdri: "/hdri/minimal.hdr", // polyhaven `white_studio_06`, CC0
    background: "colour",
    backgroundColor: "#e7e9ed",
    lights: {
      key: { position: [3, 9, 3], intensity: 1.4, color: "#ffffff" },
      ambientIntensity: 0.4,
      envIntensity: 1.0,
      bgIntensity: 1.0,
      backgroundBlur: 0.4,
      // Re-checked at 4 yaws (assets.md §A2c). `white_studio_06` really is a working
      // photo studio — beauty dish, stands, cables, a black curtain — but this is the
      // one room with `floor: backdrop`, and drei's `<Backdrop>` cyclorama fills the
      // seat frame edge to edge, so none of that is ever on screen and the yaw makes no
      // visible difference. Left at 0.
      envYaw: 0,
    },
    board: {
      lightSquare: "#ffffff",
      darkSquare: "#9ba7b8",
      squareMetalness: 0.0,
      squareRoughness: 0.35,
      frameColor: "#e6e8ec",
      reflector: {
        blur: [200, 80], mixBlur: 1, mixStrength: 0.55, mixContrast: 1,
        mirror: 0.3, metalness: 0.05, roughness: 0.4, color: "#eceef2",
      },
    },
    pieces: {
      white: { color: "#fbfbfd", metalness: 0.0, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2, sheen: 0.2, envMapIntensity: 1.0 },
      black: { color: "#2a2d33", metalness: 0.0, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 1.0 },
    },
    floor: { kind: "backdrop", color: "#e1e5eb" },
    // White lacquer on white lacquer; the only edge is the shadow under the top.
    table: {
      kind: "lacquer",
      color: "#eceef2",
      // Warm grey: the one soft thing in a room made of white lacquer and cyclorama.
      feltColor: "#b4ada2",
      base: "legs",
    },
    // Symmetric for the same reason the yaw is 0: drei's `<Backdrop>` cyclorama fills the
    // frame at every azimuth of the sweep (verified at 5 samples), so the studio behind it
    // is never on screen and there is nothing to aim at.
    orbit: { centerAzimuth: 0, halfArc: 0.95 },
    extras: {},
    highlight: { ...HIGHLIGHT_DEFAULT, legal: "#3ec98a", last: "#f2c14e" },
    // Not pure white: a warm one, so a page tinted with it reads as a lit studio.
    glow: "#fff6e8",
  },
};

export const ROOM_ORDER: Exclude<RoomPresetId, "custom">[] = [
  "study", "space", "park", "arcade", "minimal",
];
export const DEFAULT_ROOM: RoomPresetId = "study";
/** For useEnvironment.preload() when the settings drawer opens (FR-21m). */
export const HDRI_FILES = ROOM_ORDER.map((id) => ROOMS[id].hdri);

export const DEFAULT_ROOM_COLORS: RoomColors = {
  background: "#0f1115",
  lightSquare: "#e8d3ac",
  darkSquare: "#8b5a34",
};

/** `#rrggbb` -> [r, g, b]; anything unparseable comes back mid-grey rather than throwing. */
function readHex(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [128, 128, 128];
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixHex(from: string, to: string, amount: number): string {
  const a = readHex(from);
  const b = readHex(to);
  const channel = (i: number) => Math.round(a[i] + (b[i] - a[i]) * amount);
  return `#${[0, 1, 2].map((i) => channel(i).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A page glow for a room the player mixed themselves. Their LIGHT square is the closest
 * thing a custom room has to a key light, so that is the base; it is then taken a third
 * of the way toward their own background so a dark room gets a dim halo and a bright one
 * gets a bright one, instead of every custom room glowing the same.
 */
function deriveGlow(colors: RoomColors): string {
  return mixHex(colors.lightSquare, colors.background, 0.35);
}

/** Resolve the preset a player should actually see. "custom" = Minimal White's
 *  rig with the player's three colours and a flat background (FR-21j). */
export function resolveRoom(preset: RoomPresetId, colors: RoomColors | null): RoomPreset {
  if (preset !== "custom") return ROOMS[preset];
  const base = ROOMS.minimal;
  const c = colors ?? DEFAULT_ROOM_COLORS;
  return {
    ...base,
    id: "minimal",
    label: "Custom",
    description: "Your own colours.",
    background: "colour",
    backgroundColor: c.background,
    // A flat colour is the background here, so the sharp skybox has nothing to do; the
    // white-lacquer table and the studio floor come along from Minimal unchanged.
    backdrop: undefined,
    board: {
      ...base.board,
      lightSquare: c.lightSquare,
      darkSquare: c.darkSquare,
      reflector: { ...base.board.reflector, color: c.darkSquare },
    },
    glow: deriveGlow(c),
  };
}
