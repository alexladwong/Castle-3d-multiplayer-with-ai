// src/components/board3d/room.tsx
// FR-21h..FR-21n: every visual difference between rooms comes from `src/lib/rooms.ts`.
// Photographic backdrops and optional procedural surroundings share the same lighting rig.
"use client";
import { Suspense, useCallback, useEffect, useMemo } from "react";
import { Backdrop, Environment, Grid, Sparkles, Stars, useTexture, useEnvironment } from "@react-three/drei";
import { EquirectangularReflectionMapping, SRGBColorSpace, type Texture } from "three";
import { GroundedSkybox } from "three/addons/objects/GroundedSkybox.js";
import type { LightRig, RoomPreset } from "@/lib/rooms";
import { NeonStage, SpaceSky } from "./room-scenery";
import { PLINTH_HEIGHT, PLINTH_TOP_Y, TABLE_FOOT_Y } from "./layout";

/** Blurred photo backdrop for a player-uploaded room image (FR-21k, v1 scope in §I-16). */
function ImageBackdrop({ url }: { url: string }) {
  const texture = useTexture(url);

  // Convex storage URLs are signed and expire, so a stale entry in drei's global loader
  // cache would resurrect a dead URL on the next mount. Drop it when this one goes.
  useEffect(() => () => useTexture.clear(url), [url]);

  return (
    <mesh position={[0, 4, -16]} raycast={() => null}>
      <planeGeometry args={[48, 27]} />
      {/* Set through the reconciler rather than by hand: `react-hooks/immutability`
          forbids writing to a value a hook returned. */}
      <meshBasicMaterial
        map={texture}
        map-colorSpace={SRGBColorSpace}
        toneMapped={false}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Sharp colour panorama, kept separate from the small HDR lighting probe. */
function RoomBackdrop({ url, lights, ground }: { url: string; lights: LightRig; ground: boolean }) {
  const configure = useCallback((texture: Texture) => {
    // An equirectangular photo, and a colour one: without these three lines the skybox
    // is drawn as a flat quad in the wrong colour space.
    texture.mapping = EquirectangularReflectionMapping;
    texture.colorSpace = SRGBColorSpace;
  }, []);
  const texture = useTexture(url, configure);

  // useTexture is shared with preloads and other canvases. The consumer must not
  // dispose that shared texture on room switches (or Strict Mode effect replay).

  return (
    <>
      <Environment
        map={texture}
        background="only"
        backgroundBlurriness={0}
        backgroundIntensity={lights.bgIntensity}
        backgroundRotation={[0, lights.envYaw, 0]}
        environmentIntensity={lights.envIntensity}
        environmentRotation={[0, lights.envYaw, 0]}
      />
      {ground && <PanoramaGround texture={texture} yaw={lights.envYaw} />}
    </>
  );
}

function PanoramaGround({ texture, yaw }: { texture: Texture; yaw: number }) {
  const skybox = useMemo(() => new GroundedSkybox(texture, 6, 100, 64), [texture]);
  useEffect(() => () => {
    skybox.geometry.dispose();
    skybox.material.dispose();
  }, [skybox]);
  return <primitive object={skybox} position={[0, 6, 0]} rotation={[0, yaw, 0]} raycast={() => null} />;
}

export interface RoomProps {
  room: RoomPreset;
  /** Optional custom backdrop image the player uploaded. */
  imageUrl?: string;
}

export function Room({ room, imageUrl }: RoomProps) {
  const { lights, floor, extras } = room;
  const lighting = useEnvironment({ files: room.hdri });
  const showHdriBackground = room.background === "hdri" && !imageUrl;
  // A room that paints its own floor has to paint it under the TABLE's feet, not under
  // the board's: leave it where the plinth used to rest and the legs would go through it.
  const standing = room.table.base === "legs";
  const floorY = standing ? TABLE_FOOT_Y : PLINTH_TOP_Y - PLINTH_HEIGHT;

  return (
    <>
      {/* The HDRI is always the IBL source; `background` only controls the skybox.
          `backgroundBlurriness` rather than `blur`: only EnvironmentCube maps `blur` onto
          it, so the Park room (drei's `ground` path renders an EnvironmentMap) silently
          lost its configured blur — and `blur` was applied to the THREE.Scene as a stray
          property instead. */}
      <Environment
        map={lighting}
        background={showHdriBackground}
        backgroundBlurriness={lights.backgroundBlur}
        backgroundIntensity={lights.bgIntensity}
        environmentIntensity={lights.envIntensity}
        environmentRotation={[0, lights.envYaw, 0]}
        backgroundRotation={[0, lights.envYaw, 0]}
      />

      {/* MUST stay after <Environment>. drei restores the previous skybox from a
          dependency-less layout effect whose cleanup runs in the mutation phase, in child
          order — put this first and switching an HDRI room to a flat-colour room leaves
          the OLD room's HDRI as the background (FR-21j/FR-21m live preview). Ordered
          after, the restore happens first and this attach wins. Same rule, same reason,
          for the sharp backdrop below. */}
      {room.background === "colour" && (
        <color attach="background" args={[room.backgroundColor ?? "#0f1115"]} />
      )}

      {/* The 1k HDRI above is the skybox only until this lands, which is exactly the
          fallback we want: the room is lit and backed the moment the .hdr is in, and the
          sharp photograph takes over a beat later without a blank frame in between. Its
          own boundary so the visible image never holds the lighting up. */}
      {showHdriBackground && room.backdrop && (
        <Suspense fallback={null}>
          <RoomBackdrop url={room.backdrop} lights={lights} ground={floor.kind === "ground"} />
        </Suspense>
      )}

      {imageUrl && <ImageBackdrop url={imageUrl} />}

      {!imageUrl && room.id === "space" && <SpaceSky />}
      {!imageUrl && room.id === "arcade" && <NeonStage />}
      {room.id === "space" && (
        <>
          <hemisphereLight args={["#d5edff", "#52618b", 1.25]} />
          <directionalLight position={[6, 5, 7]} intensity={1.8} color="#d2eaff" />
        </>
      )}

      {extras.stars && (
        <Stars
          radius={extras.stars.radius}
          depth={extras.stars.depth}
          count={extras.stars.count}
          factor={extras.stars.factor}
          speed={extras.stars.speed}
          saturation={0}
          fade
        />
      )}

      {extras.sparkles && (
        <Sparkles
          count={extras.sparkles.count}
          scale={extras.sparkles.scale}
          size={extras.sparkles.size}
          speed={extras.sparkles.speed}
          color={extras.sparkles.color}
          position={[0, 2.5, 0]}
        />
      )}

      {/* A cyclorama, and the size of it is load-bearing. Dropping the floor by the height
          of a table moves the point where the camera's lowest ray meets it several units
          NEARER the lens and further out sideways, and past the sweep's own edge the
          skybox shows through as a hard grey wedge in the bottom corners. The standing
          size keeps the wall exactly where the seated one put it (`z0 - depth/2` is -16
          either way) and only lets the floor out. */}
      {floor.kind === "backdrop" && (
        <Backdrop
          floor={0.3}
          segments={20}
          receiveShadow
          scale={standing ? [90, 19, 32] : [40, 16, 14]}
          position={[0, floorY, standing ? -0.3 : -9]}
        >
          <meshStandardMaterial color={floor.color ?? "#f4f5f7"} roughness={0.9} metalness={0} />
        </Backdrop>
      )}

      {floor.kind === "grid" && (
        <Grid
          position={[0, floorY - 0.01, 0]}
          args={[40, 40]}
          cellSize={1}
          cellThickness={0.6}
          cellColor={floor.color ?? "#9aa0a6"}
          sectionSize={8}
          sectionThickness={1.2}
          sectionColor={floor.color ?? "#9aa0a6"}
          fadeDistance={40}
          fadeStrength={1.5}
          infiniteGrid
        />
      )}
    </>
  );
}
