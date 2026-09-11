// @vitest-environment node
// The exact projected-bounds fit (src/lib/camera.ts) and the room table/glow tokens
// (src/lib/rooms.ts). These are the two things the landing hero's framing bug turned on:
// a fit that only ever measured the HORIZONTAL extent of the board could not see the near
// corner at 45 deg of azimuth, because at 45 deg that corner is dead centre horizontally
// and leaves the frame through the bottom of the canvas instead.
import { describe, expect, it } from "vitest";

import {
  CAMERA_LIMITS,
  CAMERA_PRESETS,
  DEFAULT_ORBIT_SWEEP,
  fitDistanceForDirection,
  orbitAngularFrequency,
  orbitAzimuthAt,
  orbitFitDistance,
  orbitPeriod,
  orbitStep,
  poseAtDistance,
  poseDistance,
  poseForPreset,
  rotatePoseAzimuth,
  type FitBox,
  type OrbitSweep,
} from "../camera";
import { ROOMS, ROOM_ORDER, DEFAULT_ROOM_COLORS, resolveRoom } from "../rooms";

const DEG = Math.PI / 180;

/** The board, as camera-rig.tsx describes it: a wide flat plinth and taller pieces. */
const BOARD: FitBox[] = [
  { halfExtent: 4.55, minY: -0.22, maxY: 0.06 },
  { halfExtent: 3.75, minY: 0.06, maxY: 1.81 },
];

/** Unit vector target -> camera for a polar angle from +Y and an azimuth. */
function direction(polar: number, azimuth: number): [number, number, number] {
  return [Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth)];
}

/**
 * Where a world point lands in normalised device coordinates for a camera at
 * `distance` along `dir`, looking at the origin. Written out longhand rather than with
 * three's matrices so the test proves the maths rather than re-running it.
 */
function project(
  point: readonly [number, number, number],
  dir: readonly [number, number, number],
  distance: number,
  aspect: number,
  fovDeg = CAMERA_LIMITS.fov,
): { x: number; y: number } {
  const tanV = Math.tan((fovDeg * DEG) / 2);
  const tanH = tanV * aspect;
  const [gx, gy, gz] = dir;
  const rLength = Math.hypot(gz, gx);
  const [rx, rz] = rLength > 1e-6 ? [gz / rLength, -gx / rLength] : [1, 0];
  const [ux, uy, uz] = [gy * rz, gz * rx - gx * rz, -gy * rx];
  const [px, py, pz] = point;
  const depth = distance - (px * gx + py * gy + pz * gz);
  return {
    x: (px * rx + pz * rz) / (depth * tanH),
    y: (px * ux + py * uy + pz * uz) / (depth * tanV),
  };
}

function corners(boxes: readonly FitBox[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const box of boxes) {
    for (const sx of [-box.halfExtent, box.halfExtent]) {
      for (const sz of [-box.halfExtent, box.halfExtent]) {
        for (const y of [box.minY, box.maxY]) out.push([sx, y, sz]);
      }
    }
  }
  return out;
}

describe("exact projected-bounds fit", () => {
  it("puts every corner of every box exactly on the frame edge, never outside", () => {
    const dir = direction(50 * DEG, 45 * DEG);
    for (const aspect of [0.66, 0.87, 1, 1.6, 1.78]) {
      const distance = fitDistanceForDirection(dir, BOARD, aspect);
      let worst = 0;
      for (const corner of corners(BOARD)) {
        const { x, y } = project(corner, dir, distance, aspect);
        expect(Math.abs(x)).toBeLessThanOrEqual(1 + 1e-9);
        expect(Math.abs(y)).toBeLessThanOrEqual(1 + 1e-9);
        worst = Math.max(worst, Math.abs(x), Math.abs(y));
      }
      // ...and it is the MINIMUM such distance: something is touching the edge.
      expect(worst).toBeCloseTo(1, 6);
    }
  });

  it("is bound by the VERTICAL frame on a wide canvas — the bug the old fit could not see", () => {
    const dir = direction(50 * DEG, 45 * DEG);
    const distance = fitDistanceForDirection(dir, BOARD, 16 / 9);
    let worstX = 0;
    let worstY = 0;
    for (const corner of corners(BOARD)) {
      const { x, y } = project(corner, dir, distance, 16 / 9);
      worstX = Math.max(worstX, Math.abs(x));
      worstY = Math.max(worstY, Math.abs(y));
    }
    expect(worstY).toBeCloseTo(1, 6);
    expect(worstX).toBeLessThan(0.9);
  });

  it("needs more distance the narrower the canvas gets", () => {
    const dir = direction(50 * DEG, 30 * DEG);
    const wide = fitDistanceForDirection(dir, BOARD, 16 / 9);
    const square = fitDistanceForDirection(dir, BOARD, 1);
    const tall = fitDistanceForDirection(dir, BOARD, 0.7);
    expect(square).toBeGreaterThan(wide);
    expect(tall).toBeGreaterThan(square);
  });

  it("survives a canvas that has not been measured yet", () => {
    const dir = direction(50 * DEG, 0);
    expect(fitDistanceForDirection(dir, BOARD, 0)).toBe(fitDistanceForDirection(dir, BOARD, 1));
    expect(fitDistanceForDirection(dir, BOARD, Number.NaN)).toBe(
      fitDistanceForDirection(dir, BOARD, 1),
    );
  });

  it("has no opinion about an empty box list", () => {
    expect(fitDistanceForDirection(direction(50 * DEG, 0), [], 1)).toBe(0);
  });

  it("looks straight down without dividing by a degenerate right vector", () => {
    const overhead = fitDistanceForDirection([0, 1, 0], BOARD, 1);
    expect(Number.isFinite(overhead)).toBe(true);
    expect(overhead).toBeGreaterThan(0);
  });
});

describe("orbitFitDistance", () => {
  const boxes = BOARD;

  it("holds for the WHOLE sweep, not just the azimuth the pose happens to start at", () => {
    const pose = CAMERA_PRESETS.white;
    const aspect = 0.87;
    const orbit = orbitFitDistance(pose, boxes, aspect);
    const polar = Math.acos((pose.position[1] - pose.target[1]) / poseDistance(pose));
    for (let deg = 0; deg <= 360; deg += 3) {
      expect(orbit + 1e-9).toBeGreaterThanOrEqual(
        fitDistanceForDirection(direction(polar, deg * DEG), boxes, aspect),
      );
    }
  });

  it("is the worst case, so it beats the fit at 0 deg of azimuth", () => {
    const pose = CAMERA_PRESETS.white;
    const polar = Math.acos((pose.position[1] - pose.target[1]) / poseDistance(pose));
    expect(orbitFitDistance(pose, boxes, 0.87)).toBeGreaterThan(
      fitDistanceForDirection(direction(polar, 0), boxes, 0.87),
    );
  });

  it("is undefined-free for a degenerate pose", () => {
    expect(orbitFitDistance({ position: [0, 0, 0], target: [0, 0, 0] }, boxes, 1)).toBe(0);
  });

  it("needs MORE than FR-22's zoom-out ceiling on a tall canvas, which is why the rig raises it", () => {
    expect(orbitFitDistance(CAMERA_PRESETS.white, boxes, 0.7)).toBeGreaterThan(
      CAMERA_LIMITS.maxDistance,
    );
    expect(orbitFitDistance(CAMERA_PRESETS.white, boxes, 0.7)).toBeLessThan(
      CAMERA_LIMITS.maxFitDistance,
    );
  });
});

describe("the bounded idle sweep", () => {
  const HALF = DEFAULT_ORBIT_SWEEP.halfArc;

  /** Run the pendulum for `seconds` at `fps` and report every azimuth it visited. */
  function swing(halfArc: number, seconds: number, fps = 60): number[] {
    const delta = 1 / fps;
    let phase = 0;
    let azimuth = 0;
    const visited = [azimuth];
    for (let t = 0; t < seconds; t += delta) {
      const step = orbitStep(halfArc, phase, delta);
      phase = step.phase;
      azimuth += step.deltaAzimuth;
      visited.push(azimuth);
    }
    return visited;
  }

  it("never leaves the arc, however long it runs", () => {
    const visited = swing(HALF, orbitPeriod(HALF) * 5);
    for (const azimuth of visited) expect(Math.abs(azimuth)).toBeLessThanOrEqual(HALF + 1e-9);
    // ...and it really does use the whole of it, both ways.
    expect(Math.max(...visited)).toBeCloseTo(HALF, 3);
    expect(Math.min(...visited)).toBeCloseTo(-HALF, 3);
  });

  it("turns at the old full-circle speed as it crosses the middle, and eases at the ends", () => {
    const delta = 1 / 60;
    const middle = Math.abs(orbitStep(HALF, 0, delta).deltaAzimuth) / delta;
    expect(middle).toBeCloseTo(CAMERA_LIMITS.cinematicSpeed, 3);
    // A quarter period in is the turnaround: the speed there is a rounding error.
    const end = Math.abs(orbitStep(HALF, Math.PI / 2, delta).deltaAzimuth) / delta;
    expect(end).toBeLessThan(CAMERA_LIMITS.cinematicSpeed / 20);
    // ...and it never overshoots the pace anywhere in between.
    for (let phase = 0; phase < Math.PI * 2; phase += 0.01) {
      const speed = Math.abs(orbitStep(HALF, phase, delta).deltaAzimuth) / delta;
      expect(speed).toBeLessThanOrEqual(CAMERA_LIMITS.cinematicSpeed + 1e-6);
    }
  });

  it("takes 2*PI*halfArc / cinematicSpeed to swing there and back", () => {
    expect(orbitPeriod(HALF)).toBeCloseTo((2 * Math.PI * HALF) / CAMERA_LIMITS.cinematicSpeed, 6);
    // A wider arc takes longer rather than moving faster — every room reads the same pace.
    expect(orbitPeriod(1.4)).toBeGreaterThan(orbitPeriod(0.6));
    expect(orbitAngularFrequency(1.4)).toBeLessThan(orbitAngularFrequency(0.6));
  });

  it("comes home after exactly one period", () => {
    const period = orbitPeriod(HALF);
    const visited = swing(HALF, period, 240);
    expect(visited[visited.length - 1]).toBeCloseTo(0, 2);
  });

  it("stands still for a room with no arc, a still frame, or a frame that went backwards", () => {
    expect(orbitStep(0, 0, 1 / 60)).toEqual({ phase: 0, deltaAzimuth: 0 });
    expect(orbitStep(HALF, 1.2, 0).deltaAzimuth).toBe(0);
    expect(orbitStep(HALF, 1.2, -1).deltaAzimuth).toBe(0);
    expect(orbitStep(HALF, 1.2, Number.NaN).deltaAzimuth).toBe(0);
  });

  it("keeps the phase bounded so a hero left open all day cannot lose precision", () => {
    let phase = 0;
    for (let i = 0; i < 100_000; i += 1) phase = orbitStep(HALF, phase, 1 / 60).phase;
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(phase).toBeLessThan(Math.PI * 2);
  });

  it("puts the azimuth at the centre of the arc at phase 0 — where reduced motion parks it", () => {
    const sweep: OrbitSweep = { centerAzimuth: 2.1, halfArc: 0.8 };
    expect(orbitAzimuthAt(sweep, 0)).toBeCloseTo(2.1, 9);
    expect(orbitAzimuthAt(sweep, Math.PI / 2)).toBeCloseTo(2.9, 9);
    expect(orbitAzimuthAt(sweep, -Math.PI / 2)).toBeCloseTo(1.3, 9);
  });
});

describe("rotatePoseAzimuth", () => {
  it("turns a pose to an azimuth without changing its distance or its elevation", () => {
    for (const azimuth of [-2.4, -0.95, 0.3, 1.65, 2.83, 4.2]) {
      const turned = rotatePoseAzimuth(CAMERA_PRESETS.white, azimuth);
      expect(poseDistance(turned)).toBeCloseTo(poseDistance(CAMERA_PRESETS.white), 9);
      expect(turned.position[1]).toBeCloseTo(CAMERA_PRESETS.white.position[1], 9);
      // camera-controls' azimuth IS three's Spherical theta = atan2(x, z).
      const theta = Math.atan2(turned.position[0], turned.position[2]);
      expect(Math.sin(theta)).toBeCloseTo(Math.sin(azimuth), 9);
      expect(Math.cos(theta)).toBeCloseTo(Math.cos(azimuth), 9);
    }
  });

  it("is the identity at zero, and unbothered by a nonsense angle", () => {
    expect(rotatePoseAzimuth(CAMERA_PRESETS.white, 0)).toBe(CAMERA_PRESETS.white);
    expect(rotatePoseAzimuth(CAMERA_PRESETS.white, Number.NaN)).toBe(CAMERA_PRESETS.white);
  });

  it("turns a quarter circle onto +x, which is where the white seat's left hand is", () => {
    const turned = rotatePoseAzimuth(CAMERA_PRESETS.white, Math.PI / 2);
    expect(turned.position[0]).toBeCloseTo(9, 9);
    expect(turned.position[2]).toBeCloseTo(0, 9);
  });
});

describe("orbitFitDistance follows the arc", () => {
  const pose = CAMERA_PRESETS.white;

  it("defaults to the quarter turn it always sampled — the same answer as a full circle", () => {
    for (const aspect of [0.7, 0.87, 1, 1.6, 1.78]) {
      expect(orbitFitDistance(pose, BOARD, aspect, CAMERA_LIMITS.fov, Math.PI / 4)).toBeCloseTo(
        orbitFitDistance(pose, BOARD, aspect),
        9,
      );
      expect(orbitFitDistance(pose, BOARD, aspect, CAMERA_LIMITS.fov, Math.PI)).toBeCloseTo(
        orbitFitDistance(pose, BOARD, aspect),
        9,
      );
    }
  });

  it("EVERY shipped arc costs exactly what a full circle cost, because 110 deg straddles 45", () => {
    // The board's footprint is square, so the fit peaks every 90 deg of azimuth; an arc
    // wider than 45 deg either side of anywhere therefore contains a peak. This is the
    // reason the bounded sweep is free — it buys a better view, not a nearer camera.
    for (const id of ROOM_ORDER) {
      const sweep = ROOMS[id].orbit ?? DEFAULT_ORBIT_SWEEP;
      expect(sweep.halfArc).toBeGreaterThanOrEqual(Math.PI / 4);
      const aimed = rotatePoseAzimuth(pose, sweep.centerAzimuth);
      const full = orbitFitDistance(pose, BOARD, 0.87);
      const arc = orbitFitDistance(aimed, BOARD, 0.87, CAMERA_LIMITS.fov, sweep.halfArc);
      // Not exactly equal: the sampler walks a ~1.9 deg grid anchored on the pose's own
      // azimuth, so a room with an odd centre lands either side of the true peak. What
      // matters is the SIGN and the size — never short of the full-circle answer by more
      // than one grid step's worth of curvature, which is parts per million of a unit.
      expect(arc).toBeGreaterThan(full - 1e-3);
      expect(Math.abs(arc - full) / full).toBeLessThan(1e-4);
    }
  });

  it("does come closer for an arc that never shows the board its diagonal", () => {
    const narrow = orbitFitDistance(pose, BOARD, 0.87, CAMERA_LIMITS.fov, 0.2);
    expect(narrow).toBeLessThan(orbitFitDistance(pose, BOARD, 0.87));
    expect(narrow).toBeGreaterThan(0);
  });

  it("frames the board at every azimuth every room's sweep actually visits", () => {
    // 1440x900 and 1024x768 are the two proof viewports; 0.87 and 0.7 are the landing
    // hero's own canvas, which is taller than it is wide.
    for (const aspect of [1440 / 900, 1024 / 768, 1, 0.87, 0.7]) {
      for (const id of ROOM_ORDER) {
        const sweep = ROOMS[id].orbit ?? DEFAULT_ORBIT_SWEEP;
        const aimed = rotatePoseAzimuth(poseForPreset("cinematic"), sweep.centerAzimuth);
        const distance = Math.min(
          Math.max(
            poseDistance(aimed),
            orbitFitDistance(aimed, BOARD, aspect, CAMERA_LIMITS.fov, sweep.halfArc),
          ),
          CAMERA_LIMITS.maxFitDistance,
        );
        const polar = Math.acos(aimed.position[1] / poseDistance(aimed));
        for (let i = 0; i <= 40; i += 1) {
          const azimuth = orbitAzimuthAt(sweep, (i / 40) * Math.PI * 2);
          const dir = direction(polar, azimuth);
          for (const corner of corners(BOARD)) {
            const { x, y } = project(corner, dir, distance, aspect);
            expect(Math.abs(x)).toBeLessThanOrEqual(1 + 1e-9);
            expect(Math.abs(y)).toBeLessThanOrEqual(1 + 1e-9);
          }
        }
      }
    }
  });
});

describe("poseAtDistance", () => {
  it("pushes a pose out along its own view axis without turning it", () => {
    const moved = poseAtDistance(CAMERA_PRESETS.white, 20);
    expect(poseDistance(moved)).toBeCloseTo(20, 6);
    expect(moved.target).toEqual(CAMERA_PRESETS.white.target);
    // Same direction: the ratio of every component is the same.
    const scale = 20 / poseDistance(CAMERA_PRESETS.white);
    expect(moved.position[1]).toBeCloseTo(CAMERA_PRESETS.white.position[1] * scale, 6);
    expect(moved.position[2]).toBeCloseTo(CAMERA_PRESETS.white.position[2] * scale, 6);
  });

  it("never pulls a pose closer than it was tuned for", () => {
    expect(poseAtDistance(CAMERA_PRESETS.white, 3)).toBe(CAMERA_PRESETS.white);
    expect(poseAtDistance({ position: [0, 0, 0], target: [0, 0, 0] }, 9)).toEqual({
      position: [0, 0, 0],
      target: [0, 0, 0],
    });
  });

  it("keeps the black seat on black's side", () => {
    expect(poseAtDistance(CAMERA_PRESETS.black, 20).position[2]).toBeLessThan(0);
  });
});

describe("room tokens", () => {
  it("gives every room a table and a page glow", () => {
    for (const id of ROOM_ORDER) {
      const room = ROOMS[id];
      expect(room.table.kind).toBeTruthy();
      expect(room.table.base).toBeTruthy();
      expect(room.glow).toMatch(/^#[0-9a-f]{6}$/i);
      expect(room.table.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("gives photographic rooms a backdrop and procedural rooms none", () => {
    for (const id of ROOM_ORDER) {
      const room = ROOMS[id];
      if (room.background === "hdri") expect(room.backdrop).toMatch(/^\/backdrops\/.+\.(jpg|png|webp)$/);
      else expect(room.backdrop).toBeUndefined();
    }
    expect(ROOMS.space.backdrop).toBeUndefined();
  });

  it("aims and bounds every room's idle sweep", () => {
    for (const id of ROOM_ORDER) {
      const sweep = ROOMS[id].orbit ?? DEFAULT_ORBIT_SWEEP;
      expect(Number.isFinite(sweep.centerAzimuth)).toBe(true);
      expect(Math.abs(sweep.centerAzimuth)).toBeLessThanOrEqual(Math.PI);
      // Wide enough to read as movement, narrow enough that a panorama only has to be
      // good for part of its circumference — never a full circle again.
      expect(sweep.halfArc).toBeGreaterThan(0.5);
      expect(sweep.halfArc).toBeLessThan(Math.PI / 2);
    }
  });

  it("hands a custom room an arc, so a mixed room is never left orbiting blind", () => {
    const custom = resolveRoom("custom", DEFAULT_ROOM_COLORS);
    expect(custom.orbit ?? DEFAULT_ORBIT_SWEEP).toBeTruthy();
    expect((custom.orbit ?? DEFAULT_ORBIT_SWEEP).halfArc).toBeGreaterThan(0.5);
  });

  it("only lets a room stand on legs where nothing is projected at board height", () => {
    // The Park's Environment ground is projected at world y = 0 (see TableFinish.base).
    expect(ROOMS.park.table.base).toBe("none");
    expect(ROOMS.space.table.base).toBe("pedestal");
  });

  it("hands a custom room Minimal's table and a glow mixed from its own colours", () => {
    const custom = resolveRoom("custom", DEFAULT_ROOM_COLORS);
    expect(custom.table).toEqual(ROOMS.minimal.table);
    expect(custom.backdrop).toBeUndefined();
    expect(custom.glow).toMatch(/^#[0-9a-f]{6}$/);
    expect(custom.glow).not.toBe(ROOMS.minimal.glow);

    // Darker background -> darker glow; the room's light is its own.
    const dark = resolveRoom("custom", { ...DEFAULT_ROOM_COLORS, background: "#000000" });
    const light = resolveRoom("custom", { ...DEFAULT_ROOM_COLORS, background: "#ffffff" });
    const luminance = (hex: string) =>
      Number.parseInt(hex.slice(1, 3), 16) +
      Number.parseInt(hex.slice(3, 5), 16) +
      Number.parseInt(hex.slice(5, 7), 16);
    expect(luminance(dark.glow)).toBeLessThan(luminance(light.glow));
  });

  it("falls back to a readable glow when the colours are nonsense", () => {
    const broken = resolveRoom("custom", {
      background: "not a colour",
      lightSquare: "",
      darkSquare: "#8b5a34",
    });
    expect(broken.glow).toMatch(/^#[0-9a-f]{6}$/);
  });
});
