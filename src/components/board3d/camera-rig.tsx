// src/components/board3d/camera-rig.tsx
// FR-20..FR-25 + FR-21c. drei <CameraControls> (camera-controls 3.1.2) because it is the
// only option with a target boundary box, promise-based animated transitions,
// saveState()/reset(true) and toJSON()/fromJSON() session persistence (§I-9).
//
// camera-controls v3 gotcha: setLookAt/reset no longer normalise the azimuth, so
// `normalizeRotations()` must precede every one of them or the seat flip takes the long
// way round after the player has orbited (§E.6 step 4).
"use client";
import { useEffect, useRef, useState } from "react";
import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Box3, Vector3 } from "three";
import { CAMERA_FLIP_SMOOTH_TIME, CAMERA_SESSION_KEY, PIECE_HEIGHTS } from "@/lib/constants";
import {
  CAMERA_LIMITS,
  DEFAULT_ORBIT_SWEEP,
  fitPoseToAspect,
  minFitDistance,
  nearCornerAdvance,
  orbitFitDistance,
  orbitStep,
  poseAtDistance,
  poseDistance,
  poseForPreset,
  rotatePoseAzimuth,
  type FitBox,
  type OrbitSweep,
} from "@/lib/camera";
import type { CameraPresetId } from "@/lib/types";
import { BOARD_SIZE, PLINTH_BODY_HEIGHT, PLINTH_SIZE, PLINTH_TOP_Y, SQUARE_TOP_Y } from "./layout";

const { ACTION } = CameraControlsImpl;

/** Largest frame delta the idle sweep will act on, in seconds (see useFrame below). */
const MAX_ORBIT_DELTA = 1 / 6;

/** A little air around whatever a fit is asked to keep in frame. */
const FRAMING_MARGIN = 1.04;

/**
 * What a SEATED camera has to keep inside the frame, as a half-extent in world units
 * (see `fitPoseToAspect`), on BOTH axes: the 8x8 playing area and the pieces standing on
 * it. Its near corners are a half-board away in x and in z at the same time, and until
 * this counted the z half as well the corner squares — a1 and h1, pieces and all — were
 * sliced in half by the edge of a square canvas, which is exactly the box the §5.1 game
 * shell hands the board.
 *
 * Deliberately the PLAYING AREA and not the plinth: the plinth's outer rim is furniture,
 * it may bleed off the edge, and insisting on its far bottom corner costs a fifth of the
 * board's size for wood nobody is looking at.
 */
const SEAT_HALF = (BOARD_SIZE / 2) * FRAMING_MARGIN;

/** The tallest thing that ever stands on the board. */
const KING_HEIGHT = PIECE_HEIGHTS.King;
/** How far a piece's base reaches past the centre of the square it stands on. */
const PIECE_HALF_WIDTH = 0.25;

/**
 * What the CINEMATIC orbit has to keep in frame, as two boxes handed to
 * `orbitFitDistance`: the plinth (wide, flat, the board's own furniture) and the pieces
 * (narrower, king-high). The margin is baked in here so the fit itself stays honest
 * geometry.
 *
 * This replaces an earlier root-2 rule of thumb — "at 45 deg the board shows its
 * diagonal, so widen by root 2 and skip the depth term" — which was wrong in a way that
 * only showed up on the landing hero. At 45 deg of azimuth the board's near corner is
 * dead centre HORIZONTALLY, so no horizontal fit can see it at all, and being a corner's
 * worth nearer the lens it is magnified: it left the frame through the bottom of the
 * canvas. The exact fit costs the hero about 3% of its board and cannot crop.
 */
const ORBIT_FIT_BOXES: readonly FitBox[] = [
  {
    halfExtent: (PLINTH_SIZE / 2) * FRAMING_MARGIN,
    minY: (PLINTH_TOP_Y - PLINTH_BODY_HEIGHT) * FRAMING_MARGIN,
    maxY: SQUARE_TOP_Y * FRAMING_MARGIN,
  },
  {
    halfExtent: (BOARD_SIZE / 2 - 0.5 + PIECE_HALF_WIDTH) * FRAMING_MARGIN,
    minY: SQUARE_TOP_Y,
    maxY: (SQUARE_TOP_Y + KING_HEIGHT) * FRAMING_MARGIN,
  },
];

const TARGET_BOUNDS = new Box3(
  new Vector3(...CAMERA_LIMITS.boundaryMin),
  new Vector3(...CAMERA_LIMITS.boundaryMax),
);

/**
 * `fromJSON` (FR-25 session restore) assigns EVERY serialised field, including
 * `enabled`, `smoothTime`, the distance range and the polar clamp — so a snapshot taken
 * mid-transition would restore `enabled: false` and permanently kill orbit/pan/zoom, and
 * R3F's prop diffing would not put the JSX values back (they never changed). Re-assert
 * everything the rig owns after every restore.
 */
function applyRigLimits(controls: CameraControlsImpl, fitDistance: number): void {
  controls.enabled = true;
  controls.smoothTime = CAMERA_LIMITS.smoothTime;
  controls.draggingSmoothTime = CAMERA_LIMITS.draggingSmoothTime;
  controls.minDistance = CAMERA_LIMITS.minDistance;
  // `dollyTo` CLAMPS to maxDistance (verified in camera-controls 3.1.2), so a canvas
  // narrow enough to need more than FR-22's zoom-out limit would have its fit silently
  // truncated — and the board cropped — unless the ceiling comes up with it.
  controls.maxDistance = Math.max(CAMERA_LIMITS.maxDistance, fitDistance);
  controls.minPolarAngle = CAMERA_LIMITS.minPolarAngle;
  controls.maxPolarAngle = CAMERA_LIMITS.maxPolarAngle;
  controls.setBoundary(TARGET_BOUNDS);
}

/**
 * Put the camera at exactly `distance` from its target without turning it: the resize
 * re-fit. Unlike the preset transition this never re-seats the camera, so an orbit in
 * progress keeps its azimuth and the player's own polar angle survives.
 */
function applyFitDistance(controls: CameraControlsImpl, distance: number): void {
  controls.maxDistance = Math.max(CAMERA_LIMITS.maxDistance, distance);
  if (Math.abs(controls.distance - distance) < 0.001) return;
  void controls.dollyTo(distance, false);
}

function readSession(): string | null {
  try {
    return window.sessionStorage.getItem(CAMERA_SESSION_KEY);
  } catch {
    // Private mode / blocked storage: persistence is a nicety, never a hard failure.
    return null;
  }
}

function writeSession(json: string): void {
  try {
    window.sessionStorage.setItem(CAMERA_SESSION_KEY, json);
  } catch {
    /* ignore */
  }
}

export interface CameraRigProps {
  preset: CameraPresetId;
  /** Idle auto-orbit; stops the moment the player touches the camera (FR-24). */
  cinematic: boolean;
  /** prefers-reduced-motion: preset changes snap instead of flying (FR-21g). */
  reducedMotion: boolean;
  /** Shared handle so the DOM overlay's Reset button can drive the controls. */
  controlsRef: React.RefObject<CameraControlsImpl | null>;
  onUserInteract?(): void;
  /**
   * FR-25 session restore. Showcase boards pass `false` (§10.4): a landing hero must
   * neither inherit the player's saved seat nor overwrite it with its own orbit.
   */
  persistSession?: boolean;
  /**
   * The arc the idle sweep covers in THIS room (`RoomPreset.orbit`). Only the cinematic
   * preset reads it; a seated preset sweeps around its own seat, as it always did.
   */
  orbit?: OrbitSweep | null;
  /**
   * True while the showcase board's frameloop is "demand" because it is off screen.
   * The orbit MUST stop: camera-controls fires `update` on every rotate and drei's
   * <CameraControls> answers each one with `invalidate()`, so an orbit that keeps
   * running keeps requesting frames and the pause never actually happens.
   */
  paused?: boolean;
}

export function CameraRig({
  preset,
  cinematic,
  reducedMotion,
  controlsRef,
  onUserInteract,
  orbit,
  persistSession = true,
  paused = false,
}: CameraRigProps) {
  const interacting = useRef(false);
  const skipNextPreset = useRef(false);
  // True while a preset transition owns the controls. camera-controls resolves the
  // `setLookAt` promise from a `rest` listener registered AFTER ours, so without this
  // gate the snapshot written at the end of every flip would carry `enabled: false`.
  const locked = useRef(false);
  // Frozen at mount so the setup effect below stays a genuine one-shot.
  const [initialPreset] = useState(preset);

  // Aspect-aware framing. The canvas is square in the §5.1 game shell, 16:9 in the
  // /dev/board3d harness and tall and narrow in the landing hero, and a fixed camera
  // distance cannot serve all three. A SEAT keeps the plane fit it was tuned against
  // (`minFitDistance`); the cinematic ORBIT gets the exact projected-bounds fit, worst
  // case over the whole sweep, because a rule of thumb is what cropped the hero.
  //
  // Either way the answer is floored by the preset's own tuned distance, so a wide
  // canvas is left exactly as the presets designed it and only a narrow one moves.
  const { width, height } = useThree((state) => state.size);
  // A canvas that has not been measured yet, or one measured mid-crossfade while its
  // wrapper is collapsed, reports a size no framing should ever be derived from. Fiber
  // will not create a root under 1px either, so this is belt and braces — but the cost
  // of believing one bogus reading is a board that is framed wrong for the rest of the
  // page's life, which is exactly the bug this guard exists for.
  const measured = width > 1 && height > 1;
  const aspect = measured ? width / height : 1;
  const cinematicPreset = preset === "cinematic";
  // The room's arc, as two primitives — primitives and not the object, so a parent that
  // rebuilds `orbit` every render cannot replay the transition below.
  //
  // The CENTRE is the cinematic preset's alone: it is where the panorama's best wall is,
  // and a seat is a seat. Zeroing it off that preset is also what stops a room swap
  // during a game from turning a seated player's camera. The ARC applies either way, so
  // an idle sweep that somehow ran from a seat is bounded like every other.
  const sweepCenter = cinematicPreset
    ? (orbit?.centerAzimuth ?? DEFAULT_ORBIT_SWEEP.centerAzimuth)
    : 0;
  const sweepHalfArc = orbit?.halfArc ?? DEFAULT_ORBIT_SWEEP.halfArc;
  // FR-24's idle camera starts — and, under prefers-reduced-motion, STAYS — at the middle
  // of the room's arc, not at the white seat. Everything downstream (the fit, the
  // transition, `saveState`) follows from this one rotated pose.
  const pose = cinematicPreset
    ? rotatePoseAzimuth(poseForPreset(preset), sweepCenter)
    : poseForPreset(preset);
  // Where this preset should sit for THIS canvas: its own tuned distance, or whatever
  // the fit demands, whichever is further out — capped so a freak aspect cannot fling
  // the camera out of the room.
  const fitDistance = Math.min(
    Math.max(
      poseDistance(pose),
      cinematicPreset
        ? orbitFitDistance(pose, ORBIT_FIT_BOXES, aspect, CAMERA_LIMITS.fov, sweepHalfArc)
        : minFitDistance(
            SEAT_HALF,
            aspect,
            CAMERA_LIMITS.fov,
            nearCornerAdvance(pose, SEAT_HALF),
          ),
    ),
    CAMERA_LIMITS.maxFitDistance,
  );

  // Read by the effects below, which must not re-run on every resize (a preset effect
  // that did would replay its animated transition, and cancel the player's own orbit,
  // every time the sidebar or the mobile sheet changed the canvas size). Declared
  // FIRST so the refs are current before any of them runs, on mount and after.
  const aspectRef = useRef(aspect);
  const fitRef = useRef(fitDistance);
  // The AIMED pose (see `pose` above), for the one-shot setup effect: the initial
  // cinematic preset has to open at the middle of the room's arc too, not at the white
  // seat and then swing. Written in the RENDER phase, unlike the two above — `pose` is a
  // fresh object every render, so an effect would fire every render to say the same
  // thing, and the setup effect below has to read this on the very first commit, before
  // any effect keyed on `measured` has been allowed to run.
  const poseRef = useRef(pose);
  poseRef.current = pose;
  useEffect(() => {
    if (!measured) return;
    aspectRef.current = aspect;
    fitRef.current = fitDistance;
  }, [aspect, fitDistance, measured]);

  /**
   * Where the pendulum is, in radians of PHASE — not of azimuth. `orbitStep` turns it
   * into a per-frame turn; it only advances on frames the sweep actually ran, so a
   * paused frameloop, a preset transition and a player's own drag all leave the swing
   * exactly where the eye left it.
   */
  const orbitPhase = useRef(0);

  // True once the player has taken the camera over (orbit, dolly, truck). The
  // resize re-fit below leaves them alone from then on: someone who deliberately
  // zoomed in to a few squares (FR-22) must not be yanked back out by a resize.
  const userMoved = useRef(false);

  // One-time setup: pan boundary, the "reset" seat, and the FR-25 session restore.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    applyRigLimits(controls, fitRef.current);
    const seat = fitPoseToAspect(poseRef.current, SEAT_HALF, aspectRef.current, SEAT_HALF);
    void controls.setLookAt(...seat.position, ...seat.target, false);
    // FR-23: "Reset" returns to the player's seat, so the saved state is the preset
    // pose — never the restored session pose.
    controls.saveState();

    const saved = persistSession ? readSession() : null;
    if (saved) {
      try {
        void controls.fromJSON(saved, false);
        skipNextPreset.current = true;
      } catch {
        skipNextPreset.current = false;
      } finally {
        applyRigLimits(controls, fitRef.current);
      }
    }

    const persist = () => {
      if (locked.current) return;
      writeSession(controls.toJSON());
    };
    if (persistSession) controls.addEventListener("rest", persist);
    return () => {
      controls.removeEventListener("rest", persist);
      locked.current = false;
      controls.enabled = true;
    };
  }, [controlsRef, initialPreset, persistSession]);

  // Animated preset / seat-flip transition (FR-23, FR-24, FR-21c).
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (skipNextPreset.current) {
      skipNextPreset.current = false;
      return;
    }

    let cancelled = false;
    const previousSmoothTime = controls.smoothTime;
    // Framed for the canvas as it is right now; read through the ref so a resize
    // does not replay this transition. `poseRef` is the AIMED pose, so a cinematic
    // preset flies to the middle of this room's arc.
    const target = poseAtDistance(poseRef.current, fitRef.current);
    // A preset is a request for the canonical view, so it also hands the camera back —
    // and the swing starts again from the centre of the arc rather than resuming
    // wherever the last room's sweep happened to be.
    userMoved.current = false;
    orbitPhase.current = 0;

    const release = () => {
      controls.smoothTime = previousSmoothTime;
      controls.enabled = true;
      locked.current = false;
      // THE CANVAS MAY HAVE BEEN RE-MEASURED WHILE THIS TRANSITION OWNED THE CAMERA.
      // The re-fit effect below could only decline while `locked` was true, and it is
      // keyed on the fit distance, so nothing would ever have re-run it for that value —
      // `locked` is a ref and refs do not re-render. That is how one badly-timed measure
      // used to lock a hero into the wrong framing for good.
      if (!userMoved.current) applyFitDistance(controls, fitRef.current);
    };

    locked.current = true;
    controls.enabled = false;
    controls.smoothTime = CAMERA_FLIP_SMOOTH_TIME;
    void controls
      .normalizeRotations()
      .setLookAt(...target.position, ...target.target, !reducedMotion)
      .then(() => {
        if (cancelled) return;
        release();
        // FR-23: Reset follows the ACTIVE preset, not whichever one happened to be
        // selected when the 3D chunk mounted.
        controls.saveState();
        // The `rest` that ended this transition was swallowed by `locked`, so persist
        // the settled pose here or FR-25 would restore the pre-flip seat.
        if (persistSession) writeSession(controls.toJSON());
      })
      .catch(() => {
        if (cancelled) return;
        release();
      });

    return () => {
      cancelled = true;
      release();
    };
    // `sweepCenter` is a dep and not a ref on purpose: it only changes when the ROOM
    // changes, which is a genuine request to re-aim the idle camera at the new room's
    // best wall — never a resize. It is 0 off the cinematic preset, so a room swap
    // mid-game still cannot move a seated player. The arc is deliberately NOT a dep: it
    // reaches the camera through `fitDistance` and the re-fit effect below, which move
    // the camera without re-seating it.
  }, [controlsRef, persistSession, preset, reducedMotion, sweepCenter]);

  // The canvas changed shape (window resize, the sidebar appearing at 1024, the mobile
  // sheet opening, entering the focus layout, a room crossfade re-laying out the hero)
  // and the pose no longer fits. Distance only: azimuth, polar and target are left
  // exactly where they are, so this re-frames without ever re-seating the camera and
  // without replaying a transition. Skipped once the player has taken the camera over.
  //
  // It moves the camera IN as well as out, which the first version did not: a fit is
  // "where this preset belongs on this canvas", and a rig that could only ever retreat
  // kept whatever the widest — or the most bogus — measurement it ever saw. `fitDistance`
  // is floored by the preset's own tuned distance, so this can never come closer than
  // the framing the presets were designed for.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (!measured) return;
    if (userMoved.current) return;
    // A transition owns the camera; `release()` above applies the latest fit for us.
    if (locked.current) return;
    applyFitDistance(controls, fitDistance);
  }, [controlsRef, fitDistance, measured]);

  // Cinematic idle sweep. `cinematic` arrives as a prop (never a store hook in the
  // render loop — §D.12 rule 7) and interaction is tracked on a ref.
  //
  // A pendulum, not a circle: `orbitStep` eases the azimuth back and forth across the
  // room's arc, at `CAMERA_LIMITS.cinematicSpeed` as it crosses the middle. It hands back
  // a RELATIVE turn, so nothing here fights a player who has taken the camera over.
  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls || !cinematic || reducedMotion || paused) return;
    if (interacting.current || !controls.enabled) return;
    // A showcase board pauses its frameloop off screen, and r3f's clock keeps running
    // while it is paused: the first delta after a resume covers the whole pause and
    // would swing the camera through a quarter-turn in one frame. Cap it at one slow
    // frame's worth (~6 fps) — the sweep picks up where the eye left it.
    const step = orbitStep(sweepHalfArc, orbitPhase.current, Math.min(delta, MAX_ORBIT_DELTA));
    orbitPhase.current = step.phase;
    if (step.deltaAzimuth !== 0) controls.rotate(step.deltaAzimuth, 0, false);
  });

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      minPolarAngle={CAMERA_LIMITS.minPolarAngle}
      maxPolarAngle={CAMERA_LIMITS.maxPolarAngle}
      minDistance={CAMERA_LIMITS.minDistance}
      maxDistance={CAMERA_LIMITS.maxDistance}
      smoothTime={CAMERA_LIMITS.smoothTime}
      draggingSmoothTime={CAMERA_LIMITS.draggingSmoothTime}
      dollySpeed={CAMERA_LIMITS.dollySpeed}
      truckSpeed={CAMERA_LIMITS.truckSpeed}
      dollyToCursor={false}
      boundaryFriction={CAMERA_LIMITS.boundaryFriction}
      mouseButtons={{
        left: ACTION.ROTATE,
        middle: ACTION.DOLLY,
        right: ACTION.TRUCK,
        wheel: ACTION.DOLLY,
      }}
      touches={{
        one: ACTION.TOUCH_ROTATE,
        two: ACTION.TOUCH_DOLLY_TRUCK,
        three: ACTION.TOUCH_TRUCK,
      }}
      onControlStart={() => {
        interacting.current = true;
        userMoved.current = true;
        onUserInteract?.();
      }}
      onControlEnd={() => {
        interacting.current = false;
      }}
      // The wheel emits no controlstart/controlend but does emit 'control', so the
      // auto-orbit is cancelled by zooming as well as by dragging.
      onControl={() => {
        userMoved.current = true;
        onUserInteract?.();
      }}
    />
  );
}
