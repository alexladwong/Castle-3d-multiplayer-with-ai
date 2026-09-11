// src/lib/camera.ts
import type { CameraPresetId, Colour, ResolvedQualityTier } from "./types";

const DEG = Math.PI / 180;

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

/**
 * The "Top" preset must sit INSIDE the FR-20 polar clamp. camera-controls only applies
 * `minPolarAngle`/`maxPolarAngle` in `rotateTo()` and the pointer handlers — `setLookAt()`
 * writes `_sphericalEnd` unclamped and `update()` only calls `makeSafe()` — so a
 * near-vertical preset would be legal until the first orbit drag, which then snaps the
 * camera to `minPolarAngle` in a single frame. 14 deg keeps a 4 deg margin over the 10 deg
 * limit while still reading as a top-down view.
 */
const TOP_DISTANCE = 13;
const TOP_POLAR = 14 * DEG;

/** "cinematic" is not a pose — it is the white pose plus idle auto-orbit. */
export const CAMERA_PRESETS: Record<Exclude<CameraPresetId, "cinematic">, CameraPose> = {
  white: { position: [0, 7.5, 9], target: [0, 0, 0] },
  black: { position: [0, 7.5, -9], target: [0, 0, 0] },
  top: {
    position: [0, TOP_DISTANCE * Math.cos(TOP_POLAR), TOP_DISTANCE * Math.sin(TOP_POLAR)],
    target: [0, 0, 0],
  },
};

export const CAMERA_LIMITS = {
  fov: 40,
  near: 0.1,
  far: 200,
  minPolarAngle: 10 * DEG, // FR-20: 10deg..85deg from vertical
  maxPolarAngle: 85 * DEG,
  minDistance: 4, // FR-22: "a few squares"
  maxDistance: 22, // FR-22: "whole board plus room"
  /**
   * Ceiling for an AUTOMATIC fit, which is not the same limit as the player's own
   * zoom-out. FR-22's 22 units is "whole board plus room" seen through a wide canvas;
   * a tall narrow one — the landing hero is ~0.87:1 — legitimately needs more than that
   * before the board fits, and clamping the fit there is exactly how a board ends up
   * cropped. The rig raises `controls.maxDistance` to whatever the fit actually used
   * (`dollyTo` clamps to it) and leaves it at `maxDistance` whenever the fit is happy.
   */
  maxFitDistance: 32,
  smoothTime: 0.25,
  draggingSmoothTime: 0.1,
  dollySpeed: 0.8,
  truckSpeed: 1.5,
  boundaryFriction: 0.2,
  /** FR-21: target pan box so the board can never be lost. Feed to setBoundary(new Box3(...)). */
  boundaryMin: [-4, -0.5, -4] as [number, number, number],
  boundaryMax: [4, 2, 4] as [number, number, number],
  /**
   * rad/s for the idle cinematic sweep (FR-24), measured AT MID-SWEEP.
   *
   * It used to be the constant speed of a full circle. The sweep is a pendulum now
   * (`orbitStep`), so the speed varies over the arc like a cosine; this is its peak, as
   * the camera crosses the centre, which is where the eye reads the pace. The turnarounds
   * are slower, and that is the whole point of them.
   */
  cinematicSpeed: 0.15,
};

/* -------------------------------------------------------- the idle camera's arc */

/**
 * The arc the idle cinematic camera sweeps, per room (`RoomPreset.orbit`).
 *
 * FR-24's orbit used to be a full circle, and a full circle is a promise no photographic
 * room can keep: a panorama has a best side, and turning all the way round guarantees the
 * worst one is on screen for part of every lap. (The Classic Study's was a mustard sofa,
 * for about 20 of every 42 seconds — see docs/research/assets.md §A2c/§A2d.) So the idle
 * camera now swings back and forth across an arc centred on the side of the room that is
 * worth looking at, and never reaches the side that is not.
 */
export interface OrbitSweep {
  /**
   * The azimuth the sweep is centred on, in camera-controls terms: three's spherical
   * theta = atan2(x, z) measured from the target, so **0 is the white seat** and a
   * positive value turns the camera toward +x (anticlockwise seen from above).
   *
   * The relationship with `lights.envYaw`, which is what decides it, is exact. A camera
   * at azimuth A sees the panorama's `u = 0.25 + (envYaw - A) / 2*PI` dead centre (the
   * §A2c mapping with the camera turned instead of the room), so the feature the white
   * seat faces stays centred in the sweep at `centerAzimuth: 0`, and every radian of
   * centre turns the view one radian the OTHER way round the panorama.
   */
  centerAzimuth: number;
  /** Half the arc, radians: the sweep runs `centerAzimuth ± halfArc`. */
  halfArc: number;
}

/**
 * What a room gets if it does not say. ~55 deg either side, so the sweep shows ~110 deg
 * of parallax — enough that the board is plainly turning, and narrow enough that a
 * panorama only has to be good for a third of its circumference.
 */
export const DEFAULT_ORBIT_SWEEP: OrbitSweep = { centerAzimuth: 0, halfArc: 0.95 };

const TAU = Math.PI * 2;

/**
 * Phase radians per second for a sweep of this half-arc, chosen so the camera crosses the
 * centre of the arc at exactly `CAMERA_LIMITS.cinematicSpeed` — the pace the full-circle
 * orbit ran at. A wider arc therefore takes proportionally longer rather than moving
 * faster, and every room reads at the same speed.
 */
export function orbitAngularFrequency(halfArc: number): number {
  const arc = Math.abs(halfArc);
  return arc > 1e-6 ? CAMERA_LIMITS.cinematicSpeed / arc : 0;
}

/** Seconds for one there-and-back. `2*PI*halfArc / cinematicSpeed`. */
export function orbitPeriod(halfArc: number): number {
  const omega = orbitAngularFrequency(halfArc);
  return omega > 0 ? TAU / omega : 0;
}

/** The azimuth the sweep is at, for a phase in radians. */
export function orbitAzimuthAt(sweep: OrbitSweep, phase: number): number {
  return sweep.centerAzimuth + sweep.halfArc * Math.sin(phase);
}

export interface OrbitStep {
  /** The phase to carry into the next frame, wrapped into [0, 2*PI). */
  phase: number;
  /** How far to turn the camera THIS frame — feed straight to `controls.rotate`. */
  deltaAzimuth: number;
}

/**
 * One frame of the pendulum, as a RELATIVE turn.
 *
 * Relative and not absolute on purpose. camera-controls' `rotate()` accumulates on
 * `_sphericalEnd`, so summing these deltas tracks `halfArc * sin(phase)` exactly, and a
 * player who drags the hero board mid-sweep keeps their own view instead of being pulled
 * back to a line the rig thinks the camera should be on — which is the same thing the
 * full-circle orbit did, and the behaviour FR-24 already had.
 *
 * The motion is a sine, so its speed is a cosine: fastest at the centre, easing to a stop
 * and away again at each end without a visible corner. `delta` is the frame time in
 * seconds; a non-positive one (or a room with no arc) is a no-op.
 */
export function orbitStep(halfArc: number, phase: number, delta: number): OrbitStep {
  const omega = orbitAngularFrequency(halfArc);
  if (omega === 0 || !(delta > 0)) return { phase, deltaAzimuth: 0 };
  const next = phase + omega * delta;
  return {
    phase: next % TAU,
    deltaAzimuth: halfArc * (Math.sin(next) - Math.sin(phase)),
  };
}

export function seatPresetFor(colour: Colour): "white" | "black" {
  return colour === "w" ? "white" : "black";
}

/** The pose a preset resolves to. "cinematic" reuses the white seat (FR-24). */
export function poseForPreset(preset: CameraPresetId): CameraPose {
  return preset === "cinematic" ? CAMERA_PRESETS.white : CAMERA_PRESETS[preset];
}

/* ------------------------------------------------------- aspect-aware framing */

/**
 * The poses above are fixed distances, and a perspective camera's HORIZONTAL field of
 * view is its vertical fov widened by the canvas aspect. They were tuned in a wide box
 * (the /dev/board3d harness is ~16:9) where that is generous; in a square one — which
 * is exactly what the §5.1 game shell hands the board — the horizontal fov collapses to
 * the vertical 40 deg and the near corners of the board fall outside the frame. The
 * cinematic orbit makes it worse still: as the azimuth swings to 45 deg the board
 * presents its DIAGONAL to the camera, which is another factor of root 2 wider.
 *
 * So: the distance a pose needs in order to keep `halfWidth` world units visible either
 * side of the target, at this aspect. Purely horizontal — the vertical extent is
 * foreshortened by the camera's elevation and has never been the binding constraint, and
 * fitting it too would pull the wide-screen framing back for no reason.
 *
 * `depthAdvance` is the second half of the same sum and the reason the first version of
 * this still clipped: a perspective frustum is a WEDGE, so the half-width it shows
 * shrinks with depth. The corner of the board that has to stay in frame is not on the
 * target plane — it sits `depthAdvance` world units NEARER the camera along the view
 * axis, where the frame is `depthAdvance * tan(fov/2) * aspect` narrower. Pushing the
 * camera back by exactly that much restores it. Zero reproduces the old plane-only fit,
 * which is correct for anything that really does sit at the target's depth.
 */
export function minFitDistance(
  halfWidth: number,
  aspect: number,
  fovDeg = CAMERA_LIMITS.fov,
  depthAdvance = 0,
): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const distance = halfWidth / (Math.tan((fovDeg * DEG) / 2) * safeAspect) + Math.max(0, depthAdvance);
  // Ceiling for automatic fits only. `maxDistance` (FR-22) governs the player's own
  // dolly; the rig raises `controls.maxDistance` to whatever the fit used. Clamping the
  // fit itself at 22 cropped a fifth of the board in a portrait fullscreen canvas
  // (aspect 0.46 needs ~28), so the fit may reach the wider `maxFitDistance`.
  return Math.min(distance, CAMERA_LIMITS.maxFitDistance);
}

/**
 * How far in front of the target the near corner of a flat, board-plane object of
 * half-depth `halfDepth` sits, measured along the camera's own view axis: the horizontal
 * run of the pose direction (cos of its elevation) times that half-depth. A camera
 * directly overhead gets 0 — nothing is nearer than the target — and a camera at eye
 * level gets the whole `halfDepth`. Feed the result to `minFitDistance`.
 */
export function nearCornerAdvance(pose: CameraPose, halfDepth: number): number {
  const dx = pose.position[0] - pose.target[0];
  const dy = pose.position[1] - pose.target[1];
  const dz = pose.position[2] - pose.target[2];
  const distance = Math.hypot(dx, dy, dz);
  if (distance === 0) return 0;
  return (Math.hypot(dx, dz) / distance) * halfDepth;
}

/**
 * `pose` pushed straight back along its own view direction until it is at least
 * `minFitDistance` from its target — never pulled closer, so a wide canvas keeps the
 * framing the presets were designed for and only a narrow one moves. Returns the pose
 * unchanged (same object) when no correction is needed.
 *
 * `halfDepth` is the half-extent of the same object ALONG the ground, toward the camera
 * (see `nearCornerAdvance`); pass 0 for a fit that only has to hold on the target plane.
 */
export function fitPoseToAspect(
  pose: CameraPose,
  halfWidth: number,
  aspect: number,
  halfDepth = 0,
): CameraPose {
  return poseAtDistance(
    pose,
    minFitDistance(halfWidth, aspect, CAMERA_LIMITS.fov, nearCornerAdvance(pose, halfDepth)),
  );
}

/**
 * `pose` pushed straight back along its own view direction to `distance`. Never pulls it
 * closer than `distance` and never turns it: only the radius moves. Returns the pose
 * unchanged (the same object) when it is already at least that far out.
 */
export function poseAtDistance(pose: CameraPose, distance: number): CameraPose {
  const [px, py, pz] = pose.position;
  const [tx, ty, tz] = pose.target;
  const dx = px - tx;
  const dy = py - ty;
  const dz = pz - tz;
  const current = Math.hypot(dx, dy, dz);
  if (current === 0 || distance <= current) return pose;

  const scale = distance / current;
  return {
    position: [tx + dx * scale, ty + dy * scale, tz + dz * scale],
    target: pose.target,
  };
}

/**
 * `pose` turned `azimuth` radians around the vertical axis through its own target: the
 * same radius, the same elevation, a different side of the board. This is how the
 * cinematic preset is aimed at a room's best wall (`OrbitSweep.centerAzimuth`) instead of
 * always starting at the white seat.
 *
 * The sign convention is camera-controls': its azimuth is three's `Spherical.theta =
 * atan2(x, z)`, so a positive angle carries +z toward +x.
 */
export function rotatePoseAzimuth(pose: CameraPose, azimuth: number): CameraPose {
  if (!Number.isFinite(azimuth) || azimuth === 0) return pose;
  const [, py] = pose.position;
  const [tx, ty, tz] = pose.target;
  const dx = pose.position[0] - tx;
  const dz = pose.position[2] - tz;
  const cos = Math.cos(azimuth);
  const sin = Math.sin(azimuth);
  return {
    position: [tx + dx * cos + dz * sin, py, tz - dx * sin + dz * cos],
    target: [tx, ty, tz],
  };
}

/** The pose's own distance from its target — the framing it was tuned for. */
export function poseDistance(pose: CameraPose): number {
  return Math.hypot(
    pose.position[0] - pose.target[0],
    pose.position[1] - pose.target[1],
    pose.position[2] - pose.target[2],
  );
}

/* ------------------------------------------------- exact projected-bounds fit */

/**
 * A world-space box a fit has to keep inside the frame: a SQUARE footprint reaching
 * `halfExtent` either side of the target on X and on Z, between `minY` and `maxY`.
 *
 * Several boxes describe a chess board far better than one. The plinth is wide and flat;
 * the pieces are narrower and as tall as a king. A single box around both would insist
 * on room for a king standing on the plinth's outer corner — where no king can stand —
 * and cost the hero a tenth of its board for nothing.
 */
export interface FitBox {
  halfExtent: number;
  minY: number;
  maxY: number;
}

/**
 * The EXACT minimum distance a camera looking at the target from `direction` must sit at
 * for every corner of every box to project inside the frame.
 *
 * `minFitDistance` above is the plane-only version of this sum and is kept for the seated
 * presets it was tuned against; this one is the whole of it. For a camera aimed at the
 * target, a point `v` (relative to the target) sits `d - v·ĝ` in front of the lens, where
 * the frame is `(d - v·ĝ)·tan(fov/2)·aspect` wide and `(d - v·ĝ)·tan(fov/2)` tall. Keeping
 * `|v·r̂|` inside the first and `|v·û|` inside the second gives, per corner and per axis,
 * `d >= v·ĝ + |v·r̂| / tanH` and `d >= v·ĝ + |v·û| / tanV`; the answer is the largest.
 *
 * Both axes matter and that is the point: a board seen from 45 deg of azimuth puts its
 * NEAR corner dead centre horizontally, where no horizontal fit can see it, and low —
 * and being nearer the lens it is magnified, so it leaves the frame through the BOTTOM.
 * That is the corner that was being cut off the landing hero.
 *
 * `direction` is a unit vector pointing from the target toward the camera.
 */
export function fitDistanceForDirection(
  direction: readonly [number, number, number],
  boxes: readonly FitBox[],
  aspect: number,
  fovDeg = CAMERA_LIMITS.fov,
): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const tanV = Math.tan((fovDeg * DEG) / 2);
  const tanH = tanV * safeAspect;

  const [gx, gy, gz] = direction;
  // three's lookAt basis with a +Y up: z = direction, x = normalise(up x z), y = z x x.
  // Straight overhead the cross product collapses; any horizontal pair will do there,
  // because a square footprint seen from above is the same in every azimuth.
  const rLength = Math.hypot(gz, gx);
  const [rx, rz] = rLength > 1e-6 ? [gz / rLength, -gx / rLength] : ([1, 0] as const);
  // u = g x r, with r = (rx, 0, rz) — the camera's own up.
  const upx = gy * rz;
  const upy = gz * rx - gx * rz;
  const upz = -gy * rx;

  let required = 0;
  for (const box of boxes) {
    const { halfExtent, minY, maxY } = box;
    for (const sx of [-halfExtent, halfExtent]) {
      for (const sz of [-halfExtent, halfExtent]) {
        for (const sy of [minY, maxY]) {
          const along = sx * gx + sy * gy + sz * gz;
          const across = Math.abs(sx * rx + sz * rz);
          const up = Math.abs(sx * upx + sy * upy + sz * upz);
          required = Math.max(required, along + across / tanH, along + up / tanV);
        }
      }
    }
  }
  return required;
}

/** Angular spacing of `orbitFitDistance`'s samples: ~1.9 deg. */
const ORBIT_FIT_STEP = Math.PI / 96;

/**
 * The widest half-arc worth sampling. The board's footprint is SQUARE, so
 * `fitDistanceForDirection` has period 90 deg in azimuth and is even about the pose's
 * own; any window 90 deg wide therefore already contains every value the function takes,
 * and a wider sweep cannot find a worse one.
 */
const ORBIT_FIT_MAX_HALF_ARC = Math.PI / 4;

/**
 * The distance a CINEMATIC pose has to hold for the whole idle sweep (FR-24): the worst
 * case of `fitDistanceForDirection` across `halfArc` either side of the pose's own
 * azimuth, at the pose's own elevation. One distance for the entire sweep is the point —
 * a distance that breathed with the azimuth would read as a dolly nobody asked for.
 *
 * `halfArc` defaults to the quarter turn this used to sample unconditionally, which by
 * the symmetry above is the same answer as a full circle. A room may ask for less
 * (`OrbitSweep.halfArc`) and get a closer, larger board out of it — but only below 45
 * deg, because any arc of 110 deg straddles a 45 deg diagonal, and the diagonal is
 * always the worst case. Every room shipped in `src/lib/rooms.ts` is above that line, so
 * today this returns exactly what the full-circle version returned; the parameter is
 * here so the fit follows the sweep rather than a coincidence.
 */
export function orbitFitDistance(
  pose: CameraPose,
  boxes: readonly FitBox[],
  aspect: number,
  fovDeg = CAMERA_LIMITS.fov,
  halfArc = ORBIT_FIT_MAX_HALF_ARC,
): number {
  const distance = poseDistance(pose);
  if (distance === 0) return 0;
  const dy = (pose.position[1] - pose.target[1]) / distance;
  // The horizontal run of the pose, preserved while the azimuth is swept.
  const run = Math.sqrt(Math.max(0, 1 - dy * dy));
  const center = Math.atan2(pose.position[0] - pose.target[0], pose.position[2] - pose.target[2]);
  const half = Math.min(Math.abs(halfArc), ORBIT_FIT_MAX_HALF_ARC);
  const steps = Math.max(1, Math.ceil((2 * half) / ORBIT_FIT_STEP));

  let required = 0;
  for (let i = 0; i <= steps; i += 1) {
    const azimuth = center - half + (i / steps) * 2 * half;
    const direction: [number, number, number] = [
      run * Math.sin(azimuth),
      dy,
      run * Math.cos(azimuth),
    ];
    required = Math.max(required, fitDistanceForDirection(direction, boxes, aspect, fovDeg));
  }
  return required;
}

/* ------------------------------------------------------------ quality tiers */

export interface QualityConfig {
  dpr: [number, number]; // FR-32: never above 2
  /**
   * Requested `<Canvas shadows>` value. board-3d.tsx maps it to what three 0.185.1
   * actually supports: `"basic"` stays BasicShadowMap (hard edges), and both `true` and
   * `"soft"` become `"percentage"` (PCFShadowMap, percentage-closer filtering) because
   * r185 deprecated PCFSoftShadowMap and substitutes PCFShadowMap anyway.
   */
  shadows: false | true | "basic" | "soft";
  /**
   * DEAD CONFIG — nothing reads it. drei 10.7.8's `<SoftShadows>` (PCSS) cannot compile
   * against three 0.185.1: its shader patch calls `unpackRGBAToDepth`, which r185 no
   * longer declares in `shadowmap_pars_fragment`, so every MeshStandard/Physical program
   * fails to link. Kept only so the field can be revived if drei ships an r185 patch;
   * the reproduction is documented in board3d/scene.tsx.
   */
  softShadows: boolean;
  directionalShadowMapSize: number;
  reflector: { enabled: boolean; resolution: number } ;
  contactShadows: { enabled: boolean; resolution: number; frames: number };
  /** Post-processing. `composer: false` means UNMOUNT <EffectComposer> entirely —
   *  passing enabled={false} would leave gl.toneMapping = NoToneMapping
   *  (postprocessing.md §2). */
  post: {
    composer: boolean;
    multisampling: number;
    n8ao: { enabled: boolean; quality: "performance" | "low" | "medium" | "high"; halfRes: boolean };
    bloom: { enabled: boolean; intensity: number; levels: number };
    outline: { enabled: boolean; resolutionScale: number; blur: boolean };
    smaa: "low" | "high" | false;
    vignette: boolean;
  };
  /** Physical (transmission) piece materials are High only — they cost a pass per frame. */
  allowTransmission: boolean;
  maxPixelRatioOnRegress: number;
}

export const QUALITY_TIERS: Record<ResolvedQualityTier, QualityConfig> = {
  low: {
    dpr: [1, 1.25],
    shadows: "basic", // BasicShadowMap: hard-edged. Softness comes from ContactShadows.
    softShadows: false,
    directionalShadowMapSize: 512,
    reflector: { enabled: false, resolution: 0 },
    contactShadows: { enabled: true, resolution: 256, frames: 1 },
    post: {
      composer: false,
      multisampling: 0,
      n8ao: { enabled: false, quality: "performance", halfRes: true },
      bloom: { enabled: false, intensity: 0, levels: 4 },
      outline: { enabled: false, resolutionScale: 0.5, blur: false },
      smaa: false,
      vignette: false,
    },
    allowTransmission: false,
    maxPixelRatioOnRegress: 0.6,
  },
  medium: {
    dpr: [1, 1.5],
    shadows: true, // -> "percentage" (PCFShadowMap); PCFSoft is gone in r185
    softShadows: false,
    directionalShadowMapSize: 1024,
    reflector: { enabled: true, resolution: 256 },
    contactShadows: { enabled: true, resolution: 512, frames: Infinity },
    post: {
      composer: false, // FR-31 spec: Medium = reflections + contact shadows, no post
      multisampling: 0,
      n8ao: { enabled: false, quality: "performance", halfRes: true },
      bloom: { enabled: false, intensity: 0.3, levels: 4 },
      outline: { enabled: false, resolutionScale: 0.5, blur: false },
      smaa: false,
      vignette: false,
    },
    allowTransmission: false,
    maxPixelRatioOnRegress: 0.75,
  },
  high: {
    dpr: [1, 2],
    shadows: "soft", // -> "percentage" (PCFShadowMap), same filter as Medium
    softShadows: true, // NOT APPLIED (see the field's doc comment) — High's extra
    // shadow quality is the 2048 map below plus live ContactShadows, not PCSS.
    directionalShadowMapSize: 2048,
    reflector: { enabled: true, resolution: 1024 },
    contactShadows: { enabled: true, resolution: 512, frames: Infinity },
    post: {
      composer: true,
      multisampling: 0, // MSAA does not mix with N8AO; SMAA instead (postprocessing.md §9)
      n8ao: { enabled: true, quality: "medium", halfRes: false },
      bloom: { enabled: true, intensity: 0.4, levels: 6 },
      outline: { enabled: true, resolutionScale: 1, blur: true },
      smaa: "high",
      vignette: true,
    },
    allowTransmission: true,
    maxPixelRatioOnRegress: 1,
  },
};

export interface AutoTierInput {
  hardwareConcurrency: number;
  devicePixelRatio: number;
  /** drei useDetectGPU().tier, 0..3. */
  gpuTier: number;
  isMobile: boolean;
}

/** FR-31 auto-select. Called once after mount (never during render — it reads
 *  browser globals and would break react-hooks/purity). */
export function autoQualityTier(input: AutoTierInput): ResolvedQualityTier {
  const { hardwareConcurrency, devicePixelRatio, gpuTier, isMobile } = input;
  if (gpuTier <= 1 || hardwareConcurrency <= 4) return "low";
  if (isMobile) return "medium";
  if (gpuTier >= 3 && hardwareConcurrency >= 8 && devicePixelRatio >= 2) return "high";
  return "medium";
}

export const TIER_ORDER: ResolvedQualityTier[] = ["low", "medium", "high"];

export function dropTier(tier: ResolvedQualityTier): ResolvedQualityTier {
  const i = TIER_ORDER.indexOf(tier);
  return TIER_ORDER[Math.max(0, i - 1)];
}
