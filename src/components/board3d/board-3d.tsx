// src/components/board3d/board-3d.tsx
// P4's entry point: a drop-in `(props: BoardViewProps) => JSX.Element`, default-exported
// for `next/dynamic({ ssr: false })`. It imports nothing from Convex and owns no chess
// logic — every field it draws is computed by `useGameController` (§D.11).
//
// U3 adds the optional `showcase` prop of UI_REDESIGN §10.4 on top of that contract:
// the same board, driven by values passed in instead of the ui-store, running as
// scenery (idle orbit, no controls, paused off screen, capped dpr).
"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useEnvironment, useTexture, type CameraControlsImpl } from "@react-three/drei";
import { ACESFilmicToneMapping, type Mesh } from "three";
import { CAMERA_LIMITS, QUALITY_TIERS, poseForPreset } from "@/lib/camera";
import { ROOMS, resolveRoom } from "@/lib/rooms";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn, useReducedMotion } from "@/lib/ui";
import type {
  BoardViewProps,
  CameraPresetId,
  RenderFailureReason,
  ResolvedQualityTier,
} from "@/lib/types";
import { useQualityWatchdog } from "@/hooks/use-quality-watchdog";
import { Board3DSkeleton } from "./board-skeleton";
import { CameraOverlay } from "./camera-overlay";
import { boardFrameKey } from "./frame-key";
import { FirstFrame, FrameRateSampler, FrameloopGate } from "./frame-signals";
import { AutoTierProbe, QualityWatchdog } from "./quality";
import { PostFx } from "./post-fx";
import { Scene } from "./scene";
import { clampDpr, resolveShowcase, type Board3DShowcase, type ResolvedShowcase } from "./showcase";
import { preloadChessPieces } from "./use-chess-pieces";
import { WebglFallbackNotice, WebglProbe, notifyRenderFailure } from "./webgl-fallback";

/**
 * Warms the 3D chunk's assets: the piece GLB plus any HDRIs passed in (FR-21m, NFR-2a),
 * and — because a room is a light probe AND a skybox — the sharp backdrop that goes with
 * each of those HDRIs. Callers keep passing `.hdr` paths; the pairing lives in
 * `src/lib/rooms.ts`, so nothing on the calling side has to know a backdrop exists.
 */
export function preloadAssets(hdriFiles?: string[]): void {
  preloadChessPieces();
  for (const files of hdriFiles ?? []) {
    useEnvironment.preload({ files });
    const backdrop = Object.values(ROOMS).find((room) => room.hdri === files)?.backdrop;
    if (backdrop) useTexture.preload(backdrop);
  }
}

export type { Board3DShowcase } from "./showcase";

export interface Board3DProps extends BoardViewProps {
  /** Present => showcase mode (§10.4). Absent => the game board, unchanged. */
  showcase?: Board3DShowcase;
  /**
   * Hide the in-canvas camera overlay without entering showcase mode. The game shell
   * (§5.1) puts White / Black / Top / Orbit / Reset in its own DOM action bar, and two
   * copies of the same five buttons — one of them sitting over the bottom rank of the
   * board — is worse than either alone. Outside showcase mode the wrapper stays a
   * `role="application"` widget with its keyboard camera control (NFR-7) intact; only
   * the buttons go. In showcase mode this is `showcase.hideControls` and the board
   * becomes a picture instead.
   */
  hideControls?: boolean;
  /** Fires once after the first frame is on screen, for a fade-in (§1.3). */
  onFirstFrame?(): void;
  /**
   * Rendered frames per second, sampled about twice a second and silent while the
   * loop is paused. Instrumentation for /dev/board3d; the game passes nothing.
   */
  onFrameRate?(fps: number): void;
}

/** How often to check whether fiber has managed to measure its wrapper yet. */
const MEASURE_RETRY_MS = 300;
/** …and how many times to nudge it before accepting that something else is wrong. */
const MAX_MEASURE_NUDGES = 20;

/** Keyboard camera control (NFR-7) — the board itself is operated by P3's SAN input. */
const KEY_ROTATE = 0.14;
const KEY_POLAR = 0.09;
const KEY_DOLLY = 0.9;

export default function Board3D(props: Board3DProps) {
  const {
    boardOrientation,
    showcase,
    roomPreset,
    roomColors,
    tier,
    postFxEnabled,
    cameraPreset,
    selectCameraPreset,
    cinematic,
    reducedMotion,
    webglAvailable,
    roomImageUrl,
  } = useBoardSettings(props);

  const room = useMemo(() => resolveRoom(roomPreset, roomColors), [roomPreset, roomColors]);
  const quality = useMemo(() => {
    const base = QUALITY_TIERS[tier];
    if (postFxEnabled) return base;
    // Post off => UNMOUNT the composer. `enabled={false}` would strand the renderer on
    // NoToneMapping and flatten the whole scene (§I-10).
    return { ...base, post: { ...base.post, composer: false } };
  }, [tier, postFxEnabled]);

  // three 0.185.1 deprecated PCFSoftShadowMap: `WebGLShadowMap` warns and substitutes
  // PCFShadowMap, so the tier table's `true` / "soft" would only earn a console warning.
  // "percentage" asks for the map three actually uses; the visual result is identical.
  // The upshot for FR-31: High and Medium both get PERCENTAGE-CLOSER filtered shadows
  // (they differ in shadow-map size and dpr, not technique) and Low gets hard-edged
  // BasicShadowMap plus a baked ContactShadows pass. Nothing here is PCSS — see the
  // shadow note in scene.tsx for why drei's <SoftShadows> cannot be used with r185.
  const canvasShadows = quality.shadows === false ? false : quality.shadows === "basic" ? "basic" : "percentage";

  const meshOutline = !quality.post.composer || !quality.post.outline.enabled;
  const watchdog = useQualityWatchdog();
  const controlsRef = useRef<CameraControlsImpl | null>(null);

  // FR-32 resolution scaling. It has to live in the `dpr` PROP rather than a bare
  // `setDpr()` call: fiber re-applies this prop from `configure()` on every render, so an
  // imperative override would be undone by the next move. Storing the tier it applies to
  // (instead of a boolean) resets it on a tier change without a set-state-in-effect.
  const [regressedTier, setRegressedTier] = useState<ResolvedQualityTier | null>(null);
  const onRegressDpr = useCallback(() => setRegressedTier(tier), [tier]);
  const onRestoreDpr = useCallback(() => setRegressedTier(null), []);
  // §10.4: showcase caps the resolution on top of the tier — a hero must never cost
  // more than the game it advertises.
  const maxDpr = showcase?.maxDpr ?? Infinity;
  const canvasDpr: [number, number] | number =
    regressedTier === tier
      ? Math.min(quality.dpr[1], quality.maxPixelRatioOnRegress, maxDpr)
      : clampDpr(quality.dpr, maxDpr);

  // The selected piece mesh reaches the post-processing Outline through a ref callback,
  // never a setState-in-effect (which `react-hooks/set-state-in-effect` forbids here).
  const [selectedMesh, setSelectedMesh] = useState<Mesh | null>(null);
  const registerSelected = useCallback((mesh: Mesh | null) => setSelectedMesh(mesh), []);

  // A WebGL canvas is transparent until the renderer has drawn into it, and everything
  // that could draw — the piece GLB, the room HDRI, the 1.2 MB chunk itself — suspends
  // for a while first. `painted` is the honest answer to "is there anything on this
  // canvas yet", and it gates both the skeleton below and the `data-first-frame` hook
  // the harnesses and the e2e suite read.
  const [painted, setPainted] = useState(false);
  const onFirstFrame = props.onFirstFrame;
  const firstFrameRef = useRef(onFirstFrame);
  useEffect(() => {
    firstFrameRef.current = onFirstFrame;
  }, [onFirstFrame]);
  const handleFirstFrame = useCallback(() => {
    setPainted(true);
    firstFrameRef.current?.();
  }, []);

  const [failure, setFailure] = useState<RenderFailureReason | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const onRenderFailure = props.onRenderFailure;
  const failureRef = useRef(onRenderFailure);
  useEffect(() => {
    failureRef.current = onRenderFailure;
  }, [onRenderFailure]);

  const reportFailure = useCallback((reason: RenderFailureReason) => {
    setFailure(reason);
    failureRef.current?.(reason);
  }, []);

  const handleContextLost = useCallback(
    (event: Event) => {
      // preventDefault keeps the canvas restorable; we still hand over to 2D (§E.10.5).
      event.preventDefault();
      const canvas = event.target as HTMLCanvasElement | null;
      // Tearing the Canvas down (route change, HMR, a tier switch) also fires
      // `webglcontextlost`. Reporting that as a failure would bounce the player into the
      // 2D board on the way OUT of the game, so wait a tick and only report if the canvas
      // is still in the document — a genuine runtime loss leaves it mounted.
      window.setTimeout(() => {
        if (!mountedRef.current) return;
        if (canvas && !canvas.isConnected) return;
        notifyRenderFailure("context-lost");
        reportFailure("context-lost");
      }, 0);
    },
    [reportFailure],
  );

  // FR-24: touching the camera ends the idle orbit — except in showcase mode, where the
  // orbit IS the point and nothing the visitor does may stop it (§10.4).
  const exitCinematic = useCallback(() => {
    if (showcase) return;
    if (useUiStore.getState().cinematic) useUiStore.getState().setCinematic(false);
  }, [showcase]);

  // UI_UPGRADE_2 §4.8 item 5: the camera no longer takes the review keys. Bare
  // arrows step through the game and R turns the board around, everywhere on the
  // screen; orbiting is Shift+arrows, zoom is `[` / `]`, and resetting the view
  // moved to the Camera menu in the action bar, where it can be named.
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (event.shiftKey) {
      switch (event.key) {
        case "ArrowLeft":
          controls.rotate(-KEY_ROTATE, 0, true);
          break;
        case "ArrowRight":
          controls.rotate(KEY_ROTATE, 0, true);
          break;
        case "ArrowUp":
          controls.rotate(0, -KEY_POLAR, true);
          break;
        case "ArrowDown":
          controls.rotate(0, KEY_POLAR, true);
          break;
        default:
          return;
      }
      event.preventDefault();
      return;
    }
    switch (event.key) {
      case "]":
      case "+":
      case "=":
        controls.dolly(KEY_DOLLY, true);
        break;
      case "[":
      case "-":
      case "_":
        controls.dolly(-KEY_DOLLY, true);
        break;
      default:
        return;
    }
    event.preventDefault();
  }, []);

  const resetCamera = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    void controls.normalizeRotations().reset(true);
  }, []);

  // §10.4: while the wrapper is off screen the Canvas drops to `frameloop="demand"`,
  // which renders only what invalidates. Only showcase boards do this — the game board
  // is always the thing being looked at.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const pauseWhenOffscreen = showcase?.pauseWhenOffscreen ?? false;
  const [offscreen, setOffscreen] = useState(false);
  useEffect(() => {
    if (!pauseWhenOffscreen) return;
    const node = wrapperRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setOffscreen(!entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [pauseWhenOffscreen]);
  const paused = pauseWhenOffscreen && offscreen;

  // THE OTHER WAY THE BOARD ENDS UP BLANK, and it happens before a frame is ever on the
  // table. fiber's <Canvas> measures its own wrapper with react-use-measure and only
  // creates the WebGL root once that measurement has landed; until then the <canvas> sits
  // at the HTML default of 300x150 inside a wrapper that has a perfectly good size, and
  // nothing inside the Canvas exists to ask for a frame. The measurement is delivered by
  // a ResizeObserver, and react-use-measure DROPS the reading if it arrives before its
  // own `mounted` ref is set — without recording it and without retrying, and the
  // element's size never changes again, so no second callback ever comes. (A document
  // the browser is not rendering delivers that callback late, which is what makes the
  // race easy to lose.) A window resize re-measures through a different code path, so
  // that is the nudge; it is the same event the library already listens for.
  //
  // Self-terminating: only until the board has painted, and capped so a genuinely broken
  // mount cannot turn into a permanent timer.
  const nudges = useRef(0);
  useEffect(() => {
    if (painted || webglAvailable !== true) return;
    nudges.current = 0;
    const id = window.setInterval(() => {
      if (nudges.current >= MAX_MEASURE_NUDGES) {
        window.clearInterval(id);
        return;
      }
      const wrapper = wrapperRef.current;
      const canvas = wrapper?.querySelector("canvas");
      // `style.width` is written by the renderer's own setSize: empty means fiber has
      // never had a measurement to act on.
      if (!wrapper || !canvas || canvas.style.width !== "" || wrapper.clientWidth === 0) return;
      nudges.current += 1;
      window.dispatchEvent(new Event("resize"));
    }, MEASURE_RETRY_MS);
    return () => window.clearInterval(id);
  }, [painted, webglAvailable]);

  // Everything the scene draws, as one string (frame-key.ts). <FrameloopGate> turns each
  // change into a frame, so a move, a flip, a review step or a room swap is guaranteed to
  // be rendered instead of waiting for a pointer to invalidate the root by raycasting.
  const frameKey = boardFrameKey(props, {
    roomPreset,
    roomColors: roomColors ?? null,
    roomImageUrl,
    tier,
    postFx: postFxEnabled,
    cameraPreset,
    cinematic,
    reducedMotion,
  });

  // Frozen at mount: re-applying `camera` reactively would yank the camera out of a
  // CameraControls transition every time the preset changes.
  const [initialCamera] = useState(() => ({
    fov: CAMERA_LIMITS.fov,
    near: CAMERA_LIMITS.near,
    far: CAMERA_LIMITS.far,
    position: poseForPreset(cameraPreset).position,
  }));

  if (failure) {
    return <WebglFallbackNotice reason={failure} />;
  }

  if (webglAvailable === false) {
    return (
      <>
        <WebglProbe onUnavailable={reportFailure} />
        <WebglFallbackNotice reason="webgl-unavailable" />
      </>
    );
  }

  const controlsHidden = props.hideControls ?? Boolean(showcase?.hideControls);
  // A SHOWCASE board with no controls is a picture, not a widget: it must not offer
  // keyboard camera control it does not have, and it must not sit in the tab order.
  // A game board with `hideControls` is the opposite case — the controls moved to the
  // shell's action bar, so the arrow keys, the tab stop and the orientation live
  // region all stay exactly where they were.
  const widget = !(showcase !== null && controlsHidden);

  return (
    <div
      ref={wrapperRef}
      className={cn("relative w-full", showcase ? "h-full" : "h-full min-h-[320px]")}
      // Hook for the consumer's CSS (the landing fades this in on `onFirstFrame`).
      data-showcase={showcase ? "true" : undefined}
      data-paused={paused ? "true" : undefined}
      // "false" rather than an absent attribute: a missing hook must not be readable as
      // a board that has painted. `getContext` belongs to r3f and a WebGL drawing buffer
      // is gone by the time `toDataURL` could look at it, so this is the only honest way
      // to ask a live page whether a frame has actually been presented.
      data-first-frame={painted ? "true" : "false"}
      role={widget ? "application" : "img"}
      aria-label={
        widget
          ? "3D chess board. Click a piece, then a highlighted square; press T for the 2D board with keyboard squares. Shift with the arrow keys orbits the camera and the bracket keys zoom; reset the view from Camera in the action bar."
          : `A 3D chess board in the ${room.label} room.`
      }
      tabIndex={widget ? 0 : undefined}
      onKeyDown={widget ? handleKeyDown : undefined}
    >
      <WebglProbe onUnavailable={reportFailure} />
      {/* The auto tier probe reads the visitor's GPU into the ui-store; a showcase
          board is told its tier and must not write settings back (§10.4). */}
      {showcase ? null : <AutoTierProbe />}

      {webglAvailable === true && (
        <Canvas
          className="h-full w-full touch-none"
          // §10.4: a non-interactive showcase ignores the pointer entirely, so the
          // page behind it scrolls and the orbit is never interrupted. It has to be
          // an inline style: fiber writes `pointerEvents: "auto"` on this same div
          // itself, and an inline declaration outranks any class.
          style={showcase && !props.interactive ? { pointerEvents: "none" } : undefined}
          shadows={canvasShadows}
          dpr={canvasDpr}
          frameloop={paused ? "demand" : "always"}
          camera={initialCamera}
          gl={{
            antialias: !quality.post.composer,
            powerPreference: "high-performance",
            toneMapping: ACESFilmicToneMapping,
          }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener("webglcontextlost", handleContextLost, false);
          }}
          onPointerMissed={() => props.onDeselect()}
        >
          <Suspense fallback={null}>
            <Scene
              board={props}
              room={room}
              roomImageUrl={roomImageUrl}
              quality={quality}
              cameraPreset={cameraPreset}
              cinematic={cinematic}
              reducedMotion={reducedMotion}
              meshOutline={meshOutline}
              controlsRef={controlsRef}
              registerSelected={registerSelected}
              onUserInteract={exitCinematic}
              // FR-25 restores the player's own seat from sessionStorage. A hero must
              // not inherit it, and must not overwrite it either.
              persistSession={!showcase}
              paused={paused}
            />
            <FirstFrame onFirstFrame={handleFirstFrame} />
          </Suspense>

          <PostFx
            quality={quality}
            selected={selectedMesh}
            outlineColor={room.highlight.select}
          />

          <QualityWatchdog
            watchdog={watchdog}
            onRegressDpr={onRegressDpr}
            onRestoreDpr={onRestoreDpr}
          />

          <FrameloopGate paused={paused} painted={painted} signature={frameKey} />
          {props.onFrameRate ? <FrameRateSampler onFrameRate={props.onFrameRate} /> : null}
        </Canvas>
      )}

      {/* Until the renderer has presented a frame there is nothing on the canvas but the
          ring around it, and the chunk-level skeleton was unmounted the moment this
          component mounted. Same skeleton, held until there is genuinely something to
          look at. Inert: the board underneath is not operable yet either. */}
      {painted ? null : <Board3DSkeleton className="pointer-events-none absolute inset-0" />}

      {controlsHidden ? null : (
        <CameraOverlay preset={cameraPreset} onSelect={selectCameraPreset} onReset={resetCamera} />
      )}

      {widget && (
        <span className="sr-only" aria-live="polite">
          {boardOrientation === "w" ? "Viewing from White's side." : "Viewing from Black's side."}
        </span>
      )}
    </div>
  );
}

/**
 * All the per-viewer view settings the board reads (never game state — §D.11).
 *
 * With a `showcase` prop it reads those values instead of the ui-store and never
 * writes the store back (§10.4); the WebGL probe result is the one exception, because
 * "this browser cannot do 3D at all" is a fact about the device, not a preference.
 */
function useBoardSettings(props: Board3DProps) {
  const showcase: ResolvedShowcase | null = useMemo(
    () => (props.showcase ? resolveShowcase(props.showcase) : null),
    [props.showcase],
  );
  const inShowcase = showcase !== null;

  const storeRoomPreset = useUiStore((state) => state.roomPreset);
  const storeRoomColors = useUiStore((state) => state.roomColors);
  const storeTier = useUiStore((state) => state.resolvedTier);
  const storePostFx = useUiStore((state) => state.postFxEnabled);
  const storeCameraPreset = useUiStore((state) => state.cameraPreset);
  const storeCinematic = useUiStore((state) => state.cinematic);
  const storeReducedMotion = useUiStore((state) => state.reducedMotion);
  const webglAvailable = useUiStore((state) => state.webglAvailable);
  // FR-21k: mirrored from `players.me` by use-settings-sync; null for signed-out players.
  const storeRoomImageUrl = useUiStore((state) => state.roomImageUrl);

  // The game keeps this in the store (board-surface.tsx mirrors the media query into
  // it); a showcase board can be mounted anywhere, so read the query as well.
  const prefersReducedMotion = useReducedMotion();

  // A showcase board still gets camera buttons when `hideControls` is false, and they
  // have to land somewhere that is not the player's saved settings.
  const [showcaseCamera, setShowcaseCamera] = useState<CameraPresetId | null>(null);
  const selectCameraPreset = useCallback(
    (preset: CameraPresetId) => {
      if (inShowcase) setShowcaseCamera(preset);
      else useUiStore.getState().setCameraPreset(preset);
    },
    [inShowcase],
  );

  const cameraPreset = showcase
    ? (showcaseCamera ?? showcase.cameraPreset)
    : storeCameraPreset;

  return {
    boardOrientation: props.orientation,
    showcase,
    roomPreset: showcase ? showcase.roomPreset : storeRoomPreset,
    roomColors: showcase ? showcase.roomColors : storeRoomColors,
    tier: showcase ? showcase.tier : storeTier,
    postFxEnabled: showcase ? showcase.postFx : storePostFx,
    cameraPreset,
    selectCameraPreset,
    cinematic: showcase ? cameraPreset === "cinematic" : storeCinematic,
    reducedMotion: storeReducedMotion || prefersReducedMotion,
    webglAvailable,
    roomImageUrl: showcase ? undefined : (storeRoomImageUrl ?? undefined),
  };
}
