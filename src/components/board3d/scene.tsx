// src/components/board3d/scene.tsx
// Everything inside the <Canvas>. Suspends on the GLB and the room HDRI, so it is always
// mounted under a <Suspense> boundary owned by board-3d.tsx.
"use client";
import { Suspense, useEffect, useMemo } from "react";
import { ContactShadows, Preload } from "@react-three/drei";
import type { Mesh } from "three";
import type { CameraControlsImpl } from "@react-three/drei";
import type { QualityConfig } from "@/lib/camera";
import type { RoomPreset } from "@/lib/rooms";
import type { BoardViewProps, CameraPresetId } from "@/lib/types";
import { createPieceMaterials, disposePieceMaterials } from "./piece-materials";
import { BoardSurface3D } from "./board-surface-3d";
import { CameraRig } from "./camera-rig";
import { CapturedTray3D } from "./captured-tray-3d";
import { Highlights } from "./highlights";
import { Pieces } from "./pieces";
import { Room } from "./room";
import { Squares } from "./squares";
import { TutorAnnotations } from "./tutor-annotations";
import { Board3DTable } from "./table";
import { CapturedTrayFurniture } from "./trays";
import { CONTACT_SHADOW_Y, PLINTH_SIZE } from "./layout";

export interface SceneProps {
  board: BoardViewProps;
  room: RoomPreset;
  quality: QualityConfig;
  cameraPreset: CameraPresetId;
  cinematic: boolean;
  reducedMotion: boolean;
  /** True when no post-processing Outline is available — use inflated-shell outlines. */
  meshOutline: boolean;
  controlsRef: React.RefObject<CameraControlsImpl | null>;
  registerSelected(mesh: Mesh | null): void;
  onUserInteract(): void;
  roomImageUrl?: string;
  /** False in showcase mode: never read or write the FR-25 camera snapshot (§10.4). */
  persistSession?: boolean;
  /** True while the frameloop is paused off screen — freeze the idle orbit (§10.4). */
  paused?: boolean;
}

export function Scene({
  board,
  room,
  quality,
  cameraPreset,
  cinematic,
  reducedMotion,
  meshOutline,
  controlsRef,
  registerSelected,
  onUserInteract,
  roomImageUrl,
  persistSession = true,
  paused = false,
}: SceneProps) {
  const materials = useMemo(
    () => createPieceMaterials(room.pieces, quality.allowTransmission),
    [room.pieces, quality.allowTransmission],
  );
  useEffect(() => () => disposePieceMaterials(materials), [materials]);

  const key = room.lights.key;
  const shadowMapSize = quality.directionalShadowMapSize;
  // A promotion prompt is a DOM overlay owned by the game shell; while it is open the
  // board must not accept another click.
  const interactive = board.interactive && board.promotion === null;

  return (
    <>
      {/* FR-21m: the room owns the only assets that suspend on a settings change — the
          HDRI and the uploaded backdrop. Its own boundary means swapping presets
          mid-game blanks the backdrop for the length of the download, never the board,
          the pieces or the camera rig. */}
      <Suspense fallback={null}>
        <Room room={room} imageUrl={roomImageUrl} />
      </Suspense>

      {/* SHADOWS — what each tier ACTUALLY gets (there is no PCSS anywhere):
            Low    <Canvas shadows="basic"> = BasicShadowMap, hard-edged, 512 map, plus a
                   ContactShadows pass baked once (`frames: 1`).
            Medium PCFShadowMap (percentage-closer filtering), 1024 map, live ContactShadows.
            High   the same PCFShadowMap, 2048 map, live ContactShadows — the softness comes
                   from the filter kernel and the bigger map, not from a different technique.
          Two things force that, both verified against the installed packages:
          (a) three 0.185.1 DEPRECATED PCFSoftShadowMap — `WebGLShadowMap` warns and falls
              back to PCFShadowMap — so board-3d.tsx asks for `shadows="percentage"`
              directly instead of the tier table's `true` / "soft".
          (b) drei 10.7.8's <SoftShadows> is unusable here: its PCSS patch of
              `ShaderChunk.shadowmap_pars_fragment` calls `unpackRGBAToDepth`, which r185
              no longer declares in that chunk (0 occurrences; it lives in `packing`,
              which meshphysical's fragment shader does not include), so EVERY
              MeshStandard/Physical program fails to link — "no matching overloaded
              function found" then a flood of "useProgram: program not valid".
              Reproduced live at the High tier. `quality.softShadows` is therefore dead
              config: nothing reads it, and nothing should until drei ships a PCSS patch
              built for r185's depth-texture shadow maps. */}

      <ambientLight intensity={room.lights.ambientIntensity} />
      <directionalLight
        position={key.position}
        intensity={key.intensity}
        color={key.color}
        castShadow={quality.shadows !== false}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
      />

      {/* Furniture, drawn before the board so the board is still the first thing the
          reader of this file meets. `lowDetail` reads the reflector because that is the
          one tier flag that is off on Low and on everywhere else (see camera.ts). */}
      <Board3DTable table={room.table} lowDetail={!quality.reflector.enabled} />
      {/* ...and the two trays standing on it, which is what stops a captured piece
          hanging in mid-air beside the plinth. */}
      <CapturedTrayFurniture table={room.table} lowDetail={!quality.reflector.enabled} />

      <BoardSurface3D room={room} quality={quality} />

      <Squares
        orientation={board.orientation}
        interactive={interactive}
        hoverColor={room.highlight.select}
        onSelect={board.onSquareSelect}
      />

      <Highlights
        colours={room.highlight}
        selectedSquare={board.selectedSquare}
        legalTargets={board.legalTargets}
        lastMove={board.lastMove}
        checkSquare={board.checkSquare}
        animate={board.animate}
      />

      {/* The tutor's drawings (docs/PRO_TUTOR.md §4), a hair above the highlights and
          below every piece: they explain the position, they never hide it. */}
      {board.annotations ? (
        <TutorAnnotations annotations={board.annotations} animate={board.animate} />
      ) : null}

      <Pieces
        position={board.position}
        materials={materials}
        selectedSquare={board.selectedSquare}
        interactive={interactive}
        animate={board.animate}
        outlineColor={room.highlight.select}
        meshOutline={meshOutline}
        onSelect={board.onSquareSelect}
        registerSelected={registerSelected}
      />

      <CapturedTray3D
        captured={board.captured}
        lastMove={board.lastMove}
        materials={materials}
        animate={board.animate}
      />

      {quality.contactShadows.enabled && (
        <ContactShadows
          position={[0, CONTACT_SHADOW_Y, 0]}
          scale={PLINTH_SIZE}
          blur={2.2}
          opacity={0.55}
          far={2.2}
          resolution={quality.contactShadows.resolution}
          frames={quality.contactShadows.frames}
          color="#000000"
        />
      )}

      <CameraRig
        preset={cameraPreset}
        cinematic={cinematic}
        reducedMotion={reducedMotion}
        controlsRef={controlsRef}
        onUserInteract={onUserInteract}
        // FR-24's idle sweep is aimed per room: `rooms.ts` owns which way it looks and
        // how far it swings, exactly as it owns the lights and the yaw.
        orbit={room.orbit}
        persistSession={persistSession}
        paused={paused}
      />

      <Preload all />
    </>
  );
}
