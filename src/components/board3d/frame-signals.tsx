"use client";
// src/components/board3d/frame-signals.tsx  [U3]
// Three tiny in-Canvas components. They render nothing; they exist because the only
// place that can observe r3f's render loop is inside it.
import { useCallback, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/** A frame this long or longer is a resume after a pause, not a slow frame. */
const MAX_SAMPLE_DELTA = 0.5;
/** How often the sampler reports, in seconds of *rendered* time. */
const SAMPLE_WINDOW = 0.5;
/**
 * How long the render loop gets to answer an `invalidate()` before <FrameloopGate>
 * draws the frame itself. Several animation frames' worth, so a busy or throttled loop
 * is never mistaken for a dead one, and short enough that a stalled board is on screen
 * before anyone reaches for the mouse.
 */
const FRAME_GRACE_MS = 120;
/**
 * How often <FrameloopGate> re-asks while the board still has nothing on it. The scene
 * mounts behind a <Suspense>, so the ask that finally matters is usually not the one the
 * gate could make when it mounted; this keeps asking until there is a first frame and
 * then stops for good.
 */
const FRAME_RETRY_MS = 250;

export interface FirstFrameProps {
  onFirstFrame?(): void;
}

/**
 * Calls back once, after the first frame has genuinely been drawn (§10.4: the landing
 * fades its canvas in on this, and board-3d.tsx drops its skeleton on it). `useFrame`
 * runs BEFORE `gl.render()`, so the callback is deferred to the next macrotask — by
 * then `update()` has returned and the frame is in the drawing buffer.
 *
 * It is deliberately NOT deferred with `requestAnimationFrame`, which is what this used
 * to do. A board can render a frame in a document the browser is not servicing
 * animation frames for — <FrameloopGate> below forces exactly that — and an rAF
 * deferral there never fires, so the signal that the canvas has something on it would
 * be withheld precisely when the skeleton most needs to come down.
 *
 * Mount it inside the same <Suspense> as the scene: while the GLB or the HDRI is still
 * loading nothing has been drawn, and a "first frame" on an empty scene would fade in
 * a blank canvas.
 */
export function FirstFrame({ onFirstFrame }: FirstFrameProps) {
  const callback = useRef(onFirstFrame);
  useEffect(() => {
    callback.current = onFirstFrame;
  }, [onFirstFrame]);

  const fired = useRef(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  useFrame(() => {
    if (fired.current) return;
    fired.current = true;
    timer.current = window.setTimeout(() => callback.current?.(), 0);
  });

  return null;
}

export interface FrameRateSamplerProps {
  /** Reported roughly twice a rendered second. Silent while the loop is paused. */
  onFrameRate(fps: number): void;
}

/**
 * Instrumentation for /dev/board3d: it measures frames the renderer actually drew, so
 * the counter genuinely stops when `frameloop` drops to "demand" (a plain
 * requestAnimationFrame counter in the page would keep ticking and prove nothing).
 */
export function FrameRateSampler({ onFrameRate }: FrameRateSamplerProps) {
  const callback = useRef(onFrameRate);
  useEffect(() => {
    callback.current = onFrameRate;
  }, [onFrameRate]);

  const frames = useRef(0);
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    // The first delta after a resume covers the whole pause (r3f reads one clock for
    // the loop), so cap it or a five-second pause would report 0 fps for ever.
    frames.current += 1;
    elapsed.current += Math.min(delta, MAX_SAMPLE_DELTA);
    if (elapsed.current < SAMPLE_WINDOW) return;
    callback.current(Math.round(frames.current / elapsed.current));
    frames.current = 0;
    elapsed.current = 0;
  });

  return null;
}

export interface FrameloopGateProps {
  /** True while the wrapper is off screen and `frameloop` is "demand". */
  paused: boolean;
  /**
   * Fingerprint of what the scene draws (`boardFrameKey`). Every change to it asks for
   * a frame, so a new position reaches the screen whether or not the root happens to be
   * running a continuous loop at that moment.
   */
  signature?: string;
  /**
   * True once the board has actually painted (board-3d.tsx's `painted`, which is set by
   * <FirstFrame>). While it is false the gate keeps asking rather than asking once.
   */
  painted?: boolean;
}

/**
 * The board's "draw something" gate: the component that makes sure a frame actually
 * reaches the canvas. It renders nothing; it lives inside the Canvas because that is the
 * only place with a handle on this root's loop.
 *
 * THREE MOMENTS ASK FOR A FRAME
 * 1. Everything up to the first one. r3f stops its requestAnimationFrame entirely once a
 *    "demand" root has no invalidated frames left (`loop()` cancels itself when
 *    `repeat === 0`), and switching the `frameloop` prop back to "always" only writes
 *    state — nothing restarts the rAF. The ask has to come from inside the Canvas so it
 *    runs after `configure()` has applied the new frameloop; and because the scene
 *    itself mounts behind a <Suspense>, one ask at this component's own mount is too
 *    early to be the one that counts. So while `painted` is false it keeps asking.
 * 2. Every change to `signature` (frame-key.ts) after that: a move, a seat flip, a
 *    review step or a room swap must be drawn without waiting for a pointer to wander
 *    over the board and invalidate the root as a side effect of raycasting.
 * 3. The document becoming visible again, and every unpause.
 *
 * WHY ASKING IS NOT ENOUGH — the bug this component exists to close.
 * `invalidate()` does not render. It raises a flag and, if r3f's loop is not already
 * running, schedules a requestAnimationFrame. That loop and its `running` flag are
 * MODULE-LEVEL and shared by every root on the page. So when a board mounts in a
 * document the browser is not servicing animation frames for — a background tab, an
 * occluded window, a hidden preview pane — r3f schedules its frame, the callback is
 * never delivered, and `running` stays true with nothing pending. From that moment
 * `invalidate()` is a no-op for the rest of the page's life: the assets finish loading,
 * React commits the whole scene, the canvas is correctly sized, `isContextLost()` is
 * false, and not one pixel is ever drawn. That is the blank ring.
 *
 * So every ask is checked. `useFrame` below counts frames the root REALLY rendered (it
 * runs inside `update()`, which is the only place a frame happens); if the count has not
 * moved a few animation frames later, this draws the frame itself with `advance()`,
 * which goes straight to `update()` and consults none of the loop's flags.
 *
 * The offscreen pause is untouched: while `paused` is true this asks for nothing at all,
 * which is the entire point of §10.4's `pauseWhenOffscreen`.
 */
export function FrameloopGate({ paused, signature, painted = false }: FrameloopGateProps) {
  const invalidate = useThree((state) => state.invalidate);
  const advance = useThree((state) => state.advance);
  // A resized canvas is a changed picture too: the sidebar appearing at 1024, the mobile
  // sheet opening, entering the focus layout. r3f re-sizes the drawing buffer and the
  // camera, but the last frame drawn is still the one from the old shape.
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);

  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
  });

  /** Ask for a frame, then check one happened. Returns a cancel for that check. */
  const requestFrame = useCallback(() => {
    invalidate();
    const before = frames.current;
    const timer = window.setTimeout(() => {
      if (frames.current !== before) return;
      advance(performance.now());
    }, FRAME_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [advance, invalidate]);

  // 1. Nothing on the canvas yet: keep asking until there is.
  useEffect(() => {
    if (paused || painted) return;
    let cancel = requestFrame();
    // Deliberately not gated on `document.visibilityState`. A board that mounts in a
    // background tab is exactly the case that strands r3f's loop, and a hidden document
    // is where the blank ring is BUILT — the player only discovers it on arrival. The
    // cost is bounded: while the scene is still suspended a forced frame draws an empty
    // scene, and the moment it is not, one frame paints the board and this stops.
    const retry = window.setInterval(() => {
      cancel();
      cancel = requestFrame();
    }, FRAME_RETRY_MS);
    return () => {
      window.clearInterval(retry);
      cancel();
    };
  }, [painted, paused, requestFrame]);

  // 2. Something on the canvas already: one ask per change to what it shows.
  useEffect(() => {
    if (paused || !painted) return;
    return requestFrame();
  }, [height, painted, paused, requestFrame, signature, width]);

  // 3. Back from a background tab or a hidden pane.
  useEffect(() => {
    if (paused) return;
    let cancel: (() => void) | undefined;
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      cancel?.();
      cancel = requestFrame();
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      cancel?.();
    };
  }, [paused, requestFrame]);

  return null;
}
