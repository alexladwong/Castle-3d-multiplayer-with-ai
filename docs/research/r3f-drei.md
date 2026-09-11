# React Three Fiber 9.7 + drei 10.7 + three 0.185 — research for the 3D chess board

Scope: everything the 3D view needs (FR-14..FR-32, FR-21c..FR-21n, NFR-2, NFR-9, NFR-10 in
`/Users/sonnysangha/Downloads/3dchessrequirements.md`). Post-processing (`@react-three/postprocessing`) is out of
scope here except where it interacts with the Canvas.

Every claim below was verified against the installed packages under
`/Users/sonnysangha/Documents/Builds/chess-3d-ai-clerk-game/node_modules/` (paths abbreviated as `nm/`), or against
the official docs (context7 `/pmndrs/drei`, `/pmndrs/react-three-fiber`, `/websites/threejs`, `drei.docs.pmnd.rs`,
`r3f.docs.pmnd.rs`, `nextjs.org`). Source markers: `[src: ...]`.

---

## 0. Installed versions and pnpm layout gotchas

| Package | Version | Notes |
|---|---|---|
| `@react-three/fiber` | 9.7.0 | peer `react >=19 <19.3`, `react-dom >=19 <19.3` — React 19.2.8 installed is OK. `[src: nm/@react-three/fiber/package.json]` |
| `@react-three/drei` | 10.7.8 | ESM entry `index.js`; per-component files under `core/`, `web/`, `materials/`, `helpers/`. |
| `three` | 0.185.1 | **No bundled `.d.ts`** — types come from `@types/three@0.185.4` (transitive, in `.pnpm`). Add `@types/three` as a devDependency if TS complains: `pnpm add -D @types/three@0.185.4`. |
| `camera-controls` | 3.1.2 | Transitive dep of drei (in `.pnpm`, **not hoisted**). You don't need to import it: drei re-exports the class as `CameraControlsImpl`. |
| `maath` | 0.10.8 | Transitive dep of drei (in `.pnpm`, **not hoisted**). To `import { damp3 } from 'maath/easing'` you must `pnpm add maath@0.10.8`. |
| `three-stdlib` | 2.36.1 | Transitive (RGBELoader, GLTFLoader, DRACOLoader, OrbitControls impl). Not hoisted. |
| `@react-spring/three` | — | **Not installed.** Not needed (see §9). |
| `detect-gpu` | 5.0.70 | Transitive, used by drei `useDetectGPU`. |

`[src: ls nm/.pnpm]`

---

## 1. `<Canvas>` (fiber 9.7)

Import: `import { Canvas } from '@react-three/fiber'`.
`[src: nm/@react-three/fiber/dist/declarations/src/web/Canvas.d.ts, core/renderer.d.ts, core/store.d.ts]`

### Verified props (`CanvasProps = Omit<RenderProps,'size'> & HTMLAttributes<HTMLDivElement> & {...}`)

| Prop | Type | Default (runtime) | Notes |
|---|---|---|---|
| `gl` | `Partial<WebGLRendererParameters \| Properties<WebGLRenderer>> \| Renderer \| (defaultProps) => Renderer \| Promise<Renderer>` | `{ powerPreference: 'high-performance', antialias: true, alpha: true }` merged with yours | Constructor params: `antialias, alpha, stencil, depth, preserveDrawingBuffer, powerPreference ('default'\|'low-power'\|'high-performance'), premultipliedAlpha, failIfMajorPerformanceCaveat, logarithmicDepthBuffer, precision`. Renderer instance props like `toneMapping`, `toneMappingExposure`, `outputColorSpace` are also applied via `applyProps` after creation. `[src: events-156d8d12.esm.js ~L15725-15740, L15914]` |
| `shadows` | `boolean \| 'basic' \| 'percentage' \| 'soft' \| 'variance' \| Partial<WebGLShadowMap>` | `false` | Mapping: `true`/`'soft'` → `PCFSoftShadowMap`, `'basic'` → `BasicShadowMap`, `'percentage'` → `PCFShadowMap`, `'variance'` → `VSMShadowMap`; object → `Object.assign(gl.shadowMap, obj)`. `[src: esm ~L15879-15896]` |
| `dpr` | `number \| [min, max]` | `[1, 2]` | Clamped: `Math.min(Math.max(min, window.devicePixelRatio), max)`. FR-32 "cap at 2" is the default. `[src: esm L92-98, L15714]` |
| `camera` | `THREE.Camera \| Partial<PerspectiveCamera & OrthographicCamera props> & { manual?: boolean }` | `{ fov: 75, near: 0.1, far: 1000, position: [0,0,5] }` | `[src: r3f.docs.pmnd.rs/api/canvas]` |
| `frameloop` | `'always' \| 'demand' \| 'never'` | `'always'` | With `'demand'` call `invalidate()` after changes; drei controls call it for you. |
| `flat` | `boolean` | `false` | `true` → `gl.toneMapping = NoToneMapping`; `false` → `ACESFilmicToneMapping`. Only applied on first configure. `[src: esm L15903]` |
| `linear` | `boolean` | `false` | `true` → `gl.outputColorSpace = LinearSRGBColorSpace`, else `SRGBColorSpace`. |
| `legacy` | `boolean` | `false` | Sets `THREE.ColorManagement.enabled = !legacy` (global!). |
| `orthographic` | `boolean` | `false` | |
| `events` | `(store) => EventManager<HTMLElement>` | pointer events | |
| `eventSource` / `eventPrefix` | `HTMLElement \| RefObject` / `'offset'\|'client'\|'page'\|'layer'\|'screen'` | wrapper div / `'offset'` | |
| `onCreated` | `(state: RootState) => void` | | Runs after renderer creation; `state.gl`, `state.camera`, `state.scene`, etc. |
| `onPointerMissed` | `(e: MouseEvent) => void` | | Click that hit nothing → use to deselect a piece. |
| `raycaster` | `Partial<THREE.Raycaster>` | | e.g. `raycaster={{ params: { Line: { threshold: 0 } } }}` |
| `scene` | `THREE.Scene \| Partial<Scene>` | | |
| `performance` | `Partial<{ current, min, max, debounce }>` | `{ current: 1, min: 0.1, max: 1, debounce: 200 }` | Used by `AdaptiveDpr` / `regress`. |
| `resize` | react-use-measure options | `{ scroll: true, debounce: { scroll: 50, resize: 0 } }` | |
| `fallback` | `ReactNode` | | **Rendered as `<canvas>` children** — only visible when the `<canvas>` element itself is unsupported, NOT when WebGL context creation fails. `[src: react-three-fiber.esm.js L140-146]` |
| `ref` | `React.Ref<HTMLCanvasElement>` | | React 19 style ref prop (no forwardRef). |
| `style`, `className`, ... | `HTMLAttributes<HTMLDivElement>` | | Go on the outer wrapper div (`position: relative; width/height: 100%; overflow: hidden`). Parent must have a height. |

### Runtime defaults you inherit
- `THREE.ColorManagement.enabled = true` (three's own default is also `true` in r185) `[src: nm/three/src/math/ColorManagement.js L21]`
- `gl.outputColorSpace = SRGBColorSpace`, `gl.toneMapping = ACESFilmicToneMapping` (three's own default is `NoToneMapping`; fiber overrides). `[src: esm L15902-15903, three/src/renderers/WebGLRenderer.js L269]`
- `gl.toneMappingExposure = 1.0`.

### WebGL failure detection (FR-19) — IMPORTANT
- three r185 `WebGLRenderer` is **WebGL2-only**: it calls `getContext('webgl2', attrs)` and **throws** `Error('THREE.WebGLRenderer: Error creating WebGL context.')` (or `'...with your selected attributes.'`) if that returns null. There is no WebGL1 fallback. `[src: nm/three/src/renderers/WebGLRenderer.js L392-418]`
- Fiber's `Canvas` creates the renderer inside an `async run()` with **no try/catch**, so a constructor throw becomes an **unhandled promise rejection**, not a React error-boundary error, and nothing renders. `[src: nm/@react-three/fiber/dist/react-three-fiber.esm.js L62-115]` (The `ErrorBoundary` there only catches errors thrown by *children* during render.)
- Therefore probe **before** mounting `<Canvas>`:

```ts
// lib/webgl.ts  (client only)
import WebGL from 'three/examples/jsm/capabilities/WebGL.js' // export "./examples/jsm/*" exists [src: nm/three/package.json L14]
export function canUse3D(): boolean {
  if (typeof window === 'undefined') return false
  // WebGL.isWebGL2Available(): !!(window.WebGL2RenderingContext && canvas.getContext('webgl2')) [src: examples/jsm/capabilities/WebGL.js L14-27]
  if (!WebGL.isWebGL2Available()) return false
  // Optional stricter check: reject software renderers
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  } catch { return false }
  return true
}
```

- Context loss at runtime: subscribe in `onCreated`:

```tsx
<Canvas onCreated={({ gl }) => {
  gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onLost() }, false)
  gl.domElement.addEventListener('webglcontextrestored', onRestored, false)
}}>
```
three itself registers `webglcontextlost` / `webglcontextrestored` / `webglcontextcreationerror` on the canvas. `[src: WebGLRenderer.js L387-389]` drei's `useEnvironment` also listens to `webglcontextlost`. You can simulate loss with `gl.forceContextLoss()` `[src: @types/three WebGLRenderer.d.ts L239]`.
- drei `useDetectGPU()` / `<DetectGPU>` (wraps `detect-gpu`, returns `TierResult { tier: 0..3, isMobile, gpu, fps }`) can inform the "low-end GPU" branch of FR-19/FR-31. `[src: nm/@react-three/drei/core/DetectGPU.d.ts]`

### Next.js App Router (16.3) — client-only Canvas
- fiber's bundle already carries a `'use client'` directive `[src: grep nm/@react-three/fiber/dist/events-156d8d12.esm.js]`, but the component that *composes* the scene must be a Client Component, and `next/dynamic` with `ssr: false` is **only allowed inside a Client Component** (Server Components error: "`ssr: false` is not allowed with `next/dynamic` in Server Components"). `[src: nextjs.org/docs/app/guides/lazy-loading, v16.3.4]`

```tsx
// components/board/Board3DLoader.tsx
'use client'
import dynamic from 'next/dynamic'
const Board3D = dynamic(() => import('./Board3D'), {
  ssr: false,
  loading: () => <div className="aspect-square animate-pulse rounded-xl bg-muted" />,
})
export default Board3D
```
- Preload the 3D bundle for NFR-2a: call `import('./Board3D')` (or `void Board3D.preload?.()` is NOT an API — just trigger the dynamic import) once the game page mounts, plus `useGLTF.preload(...)` / `useEnvironment.preload(...)` (§4).
- r3f docs still recommend `transpilePackages: ['three']` in `next.config` for Next ≥13.1 `[src: r3f.docs.pmnd.rs/getting-started/installation]`. Modern three is ESM so it is usually unnecessary with Turbopack; add it only if you hit a build error importing `three/examples/jsm/*`.
- Hydration: never read `window.devicePixelRatio` / WebGL during render of a component that also SSRs; do it in `useEffect` or inside the `ssr:false` island.

---

## 2. Events (fiber 9.7)

`[src: nm/@react-three/fiber/dist/declarations/src/core/events.d.ts; context7 /pmndrs/react-three-fiber docs/API/events.mdx]`

Handlers available on any object with a `raycast()` method (meshes, lines, points, sprites; **not** on groups for hit-testing — but events bubble up to parent groups):

`onClick, onContextMenu, onDoubleClick, onPointerUp, onPointerDown, onPointerOver, onPointerOut, onPointerEnter, onPointerLeave, onPointerMove, onPointerMissed, onPointerCancel, onWheel, onLostPointerCapture`

`ThreeEvent<E>` (= `IntersectionEvent<E> & E`) fields: `object` (the hit `Object3D`), `eventObject` (the object whose handler runs — parent group when bubbling), `point` (world `Vector3`), `distance`, `face`, `faceIndex`, `uv`, `instanceId` (from `THREE.Intersection`), `intersections[]`, `unprojectedPoint`, `pointer` (NDC `Vector2`), `delta` (px moved since pointerdown — use to ignore click after drag, e.g. `if (e.delta > 3) return`), `ray`, `camera`, `nativeEvent`, `stopPropagation()`, `stopped`, plus native props (`e.pointerId`, `e.button`, `e.shiftKey`, ...).

Propagation: nearest object first, bubbles to ancestors, then continues to farther objects. `e.stopPropagation()` stops bubbling **and** blocks objects behind (and fires `pointerout` on them synchronously). Objects are transparent to events unless a handler calls `stopPropagation()`.

Disable hit-testing on decorative meshes (cheap raycasts): `<mesh raycast={() => null}>`. `InstanceProps` also exposes `dispose={null}` (skip auto-dispose), `attach`, `args`, `onUpdate`. `[src: core/reconciler.d.ts L26-31; three-types.d.ts L25-27]`

Chess selection pattern:

```tsx
function Square({ file, rank, onSelect }) {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered) // drei: sets document.body.style.cursor = 'pointer' while hovered [src: drei/web/useCursor.js]
  return (
    <mesh
      position={[file - 3.5, 0, rank - 3.5]}
      rotation-x={-Math.PI / 2}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); if (e.delta < 4) onSelect(file, rank) }}
    >
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}
// Canvas-level: <Canvas onPointerMissed={() => clearSelection()} />
```
Pointer capture for drag-to-move: `e.target.setPointerCapture(e.pointerId)` on down, `releasePointerCapture` on up.
`useCursor(hovered: boolean, onPointerOver = 'pointer', onPointerOut = 'auto', container = document.body)` from `@react-three/drei`.

---

## 3. Hooks (fiber 9.7)

`[src: nm/@react-three/fiber/dist/declarations/src/core/hooks.d.ts, core/store.d.ts]`

- `useFrame((state: RootState, delta: number, xrFrame?) => void, renderPriority = 0)` — runs before render each frame. Positive priority disables the automatic render (you must render yourself). `delta` is seconds. Never `setState` in it; mutate refs.
- `useThree(selector?, equalityFn?)` — `RootState` fields: `gl: WebGLRenderer`, `camera`, `scene`, `raycaster`, `clock`, `events`, `controls: EventDispatcher | null` (set by drei controls with `makeDefault`), `pointer: Vector2`, `size: {width,height,top,left}`, `viewport: {width,height,factor,distance,aspect,dpr,initialDpr,getCurrentViewport()}`, `performance: {current,min,max,debounce,regress()}`, `frameloop`, `invalidate(frames?)`, `advance()`, `setDpr()`, `setFrameloop()`, `setSize()`, `set/get` (zustand), `internal`. Use selectors: `const gl = useThree(s => s.gl)`.
- `useLoader(Loader, url | url[], extensions?: (loader) => void, onProgress?)` — suspends; cached by URL. `useLoader.preload(Loader, url, ext?)`, `useLoader.clear(Loader, url)`.
- `useStore()` — raw zustand store (transient subscriptions).
- `useGraph(object)` → `{ nodes, materials }`.

### drei hooks
- `useGLTF(path | path[], useDraco: boolean | string = true, useMeshopt = true, extendLoader?)` → `GLTF & { nodes, materials }`. Draco decoder default path `https://www.gstatic.com/draco/versioned/decoders/1.5.5/` (CDN!). Self-host for production: copy decoders to `public/draco/` and either pass `useGLTF(url, '/draco/')` or `useGLTF.setDecoderPath('/draco/')`. `useGLTF.preload(path, useDraco?, useMeshopt?)`, `useGLTF.clear(path)`. `<Gltf src useDraco useMeshOpt extendLoader ...CloneProps/>` component also exists. `[src: nm/@react-three/drei/core/Gltf.d.ts, Gltf.js L7-30]`
  - Cached results share one `scene` object: render each piece via `<primitive object={nodes.Knight}>` only once, otherwise `<Clone object={nodes.Knight} />` or `nodes.Knight.geometry` with your own material (recommended for 32 pieces: reuse geometry, per-material colors).
- `useTexture(url | url[] | Record<string,string>, onLoad?)`; `useTexture.preload(url)`, `useTexture.clear(url)`. `[src: core/Texture.d.ts]`
- `useProgress()` — zustand store `{ active, progress (0-100), errors, item, loaded, total }` (from `THREE.DefaultLoadingManager`). `[src: core/Progress.d.ts]`
- `useEnvironment({ files?, path?, preset?, colorSpace?, extensions? })` → `Texture` (mapping = `EquirectangularReflectionMapping` for .hdr/.exr, colorSpace `'srgb-linear'` for single files); `useEnvironment.preload({ files })`, `useEnvironment.clear({ files })`. `.hdr` → `RGBELoader`, `.exr` → `EXRLoader`, `.jpg/.jpeg` → `HDRJPGLoader` (gainmap), `.webp` triple → `GainMapLoader`, 6 files → `CubeTextureLoader`. **Preloading gainmaps throws** ("Preloading gainmaps is not supported"). `[src: core/useEnvironment.js]`
- `useDetectGPU(options?)` → `detect-gpu` `TierResult`.
- `useBounds()`, `usePerformanceMonitor({ onIncline, onDecline, onChange, onFallback })`, `useKeyboardControls()`.

---

## 4. drei components — verified props

All from `nm/@react-three/drei/core/*.d.ts` and `*.js` (defaults from the JS). Import everything from `'@react-three/drei'`.

### `MeshReflectorMaterial` (FR-27) — `core/MeshReflectorMaterial.d.ts`, `.js`, `materials/MeshReflectorMaterial.d.ts`
Extends `MeshStandardMaterial` → accepts `color, roughness, metalness, map, normalMap, normalScale, roughnessMap, metalnessMap, envMapIntensity, emissive, emissiveIntensity, transparent, opacity, side, ...`.

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `blur` | `[w,h] \| number` | `[0,0]` | Blur kernel in px of the off-screen buffer; `0` skips the blur pass entirely. |
| `mixBlur` | number | `0` | How much the blur mixes with surface roughness (docs say "default 1", code default is 0). |
| `mixStrength` | number | `1` | Reflection strength. |
| `mixContrast` | number | `1` | Reflection contrast. |
| `resolution` | number | `256` | Off-buffer size (HalfFloat RT + DepthTexture). Use 512–1024 for the board on High, 256 on Medium. |
| `mirror` | number 0..1 | `0` | 0 = texture colours, 1 = pick up env colours (pure mirror). |
| `depthScale` | number | `0` | 0 disables the depth fade (also disables `USE_DEPTH` define). |
| `minDepthThreshold` / `maxDepthThreshold` | number | `0.9` / `1` | Depth interpolation edges. |
| `depthToBlurRatioBias` | number 0..1 | `0.25` | Bias added to depth before computing blur amount. |
| `distortion` | number | `1` | Amount of distortion from `distortionMap`. |
| `distortionMap` | `Texture` | `undefined` | Red channel used as distortion. |
| `reflectorOffset` | number | `0` | Offsets the virtual camera along the plane normal. |

Gotchas (from the source):
- The reflection plane normal is the parent mesh's **local +Z** (`normal.set(0,0,1).applyMatrix4(rotation)`), so a floor **must** be `rotation-x={-Math.PI/2}` on a `planeGeometry`; don't rotate the geometry instead.
- Every frame it hides the parent, renders the **whole scene** from a mirrored camera into `fbo1` (`gl.setRenderTarget(fbo1); gl.render(scene, virtualCamera)`), optionally blurs into `fbo2`, then restores. Cost ≈ one extra scene render per frame → this is the thing to turn off on Low (FR-31).
- Changing `blur`, `resolution`, `mirror`, `mixBlur`, `depthScale`, `distortionMap` re-creates the render targets and re-keys the material (they're in the `useMemo` deps + `key`). Pass stable values per room preset; don't animate them per frame.
- Works with `frameloop="demand"` only when something invalidates each frame; with reflections you generally want `'always'`.

```tsx
// Reflective board plane (verified props). Board is 8x8 units centred at origin, top face at y=0.
function BoardSurface({ room }: { room: RoomPreset }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.001, 0]} receiveShadow>
      <planeGeometry args={[9, 9]} />
      <MeshReflectorMaterial
        blur={room.reflect.blur}            // e.g. [300, 100] wood, [0, 0] glass
        resolution={room.reflect.resolution} // 256 | 512 | 1024
        mixBlur={room.reflect.mixBlur}      // e.g. 1
        mixStrength={room.reflect.mixStrength} // e.g. 0.8 wood, 2 arcade
        mirror={room.reflect.mirror}        // 0..1
        depthScale={1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        color={room.boardColor}
        metalness={room.reflect.metalness}  // 0.1 wood, 0.8 arcade
        roughness={room.reflect.roughness}  // 0.6 wood, 0.15 glass
      />
    </mesh>
  )
}
```
The 64 coloured squares sit *on* this plane (y = 0, `polygonOffset` or +0.002) as thin boxes/planes with normal `meshStandardMaterial`; the reflector picks them up as scene content.

### `Environment` (FR-28, FR-21h) — `core/Environment.d.ts`, `.js`
Props: `files?: string | string[]`, `path?: string`, `preset?: 'apartment'|'city'|'dawn'|'forest'|'lobby'|'night'|'park'|'studio'|'sunset'|'warehouse'`, `background?: boolean | 'only'` (default `false`), `blur?: number` (alias for `backgroundBlurriness` 0..1), `backgroundBlurriness?`, `backgroundIntensity?` (1), `backgroundRotation?: Euler | [x,y,z]`, `environmentIntensity?` (1), `environmentRotation?: Euler | [x,y,z]`, `map?: Texture`, `scene?: Scene | RefObject<Scene>`, `ground?: boolean | { radius?: number (60); height?: number (15); scale?: number (1000) }`, `resolution?: number` (256, only for the `children` portal mode), `frames?: number` (1; `Infinity` = live), `near?/far?`, `colorSpace?`, `extensions?: (loader) => void`, `children?` (renders `<Lightformer>`s into a virtual scene → env map).

Behaviour (source-verified): sets `scene.environment = texture` unless `background === 'only'`; sets `scene.background = texture` when `background` truthy; restores previous values on unmount. Preset files are fetched from a `raw.githack.com` CDN (`presetsObj` maps e.g. `studio → 'studio_small_03_1k.hdr'`, `night → 'dikhololo_night_1k.hdr'`, `park → 'rooitou_park_1k.hdr'`) — **do not use presets in production**; self-host Poly Haven 1k `.hdr` files in `public/hdri/` (FR-21i, NFR-9).

```tsx
// Environment from /hdri/<room>.hdr as both IBL and visible backdrop
<Environment
  files={`/hdri/${room.hdri}.hdr`}      // .hdr → RGBELoader (three-stdlib)
  background                            // show it as the skybox
  blur={room.backgroundBlur}            // 0..1, e.g. 0.35 to soften a 1k HDRI
  backgroundIntensity={room.bgIntensity}
  environmentIntensity={room.envIntensity} // scales IBL on PBR materials
  environmentRotation={[0, room.envYaw, 0]}
/>
// Custom-colour mode (FR-21j): keep IBL but paint a flat background:
<color attach="background" args={[customBg]} />
<Environment files={`/hdri/${room.hdri}.hdr`} background={false} />
// Preload on settings-drawer open (FR-21m):
useEnvironment.preload({ files: '/hdri/study.hdr' })
```
`ground` mode uses `GroundProjectedEnv` (three-stdlib) so the HDRI's floor appears under the board — nice for "Park", but it disables `background` blur semantics (it's a real mesh). Keep `scale ≥ 100`.

### Shadows (FR-28, FR-31)
- `Canvas shadows` + `<directionalLight castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0002} shadow-normalBias={0.02} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-camera-near={0.5} shadow-camera-far={30} />`. `DirectionalLightShadow.camera` is an `OrthographicCamera(-5,5,5,-5,0.5,500)` by default; `LightShadow` defaults: `mapSize (512,512)`, `bias 0`, `normalBias 0`, `radius 1` (PCFSoft ignores radius; VSM uses `blurSamples` 8), `intensity 1`. `[src: nm/three/src/lights/LightShadow.js L41-104, DirectionalLightShadow.js L16]` Meshes need `castShadow` / `receiveShadow`.
- `SoftShadows({ size = 25, samples = 10, focus = 0 })` — patches the shader chunk for PCSS-style soft shadows; global side effect, mount once, it forces shader recompilation when props change. Use on High only.
- `ContactShadows` — `opacity=1, width=1, height=1, blur=1, near=0, far=10, smooth=true, resolution=512, frames=Infinity, scale=10 | [x,y], color='#000000', depthWrite=false` + group props (`position`). Renders the scene from below with a depth material into a texture — set `frames={1}` for a static baked look, re-key it when pieces move, or leave `Infinity` (cheap-ish at 512). Position at `[0, 0.001, 0]`; it's a horizontal plane facing +Y by default.
- `AccumulativeShadows` (`frames=40 default in docs, blend, limit, scale, temporal, opacity, alphaTest, color, colorBlend, resolution, toneMapped`) + `RandomizedLight` (`frames, position, radius, amount, intensity, ambient, castShadow, bias, mapSize, size, near, far`) — high-quality baked soft shadows; static only (pieces move → must re-`reset()` via ref). Best for the Low tier "baked shadows" if you re-bake after each move, otherwise ContactShadows is simpler.
- `BakeShadows` — sets `gl.shadowMap.autoUpdate = false; needsUpdate = true` (shadows rendered once). Re-mount/toggle after each move to refresh. Good for Low tier.

### Highlight / selection (FR-30)
- `Outlines` (child of a mesh; reads `parent.geometry`, supports `InstancedMesh` and skinned): `color='black', thickness=0.05, screenspace=false, opacity=1, transparent=false, angle=Math.PI (crease angle; 0 = use geometry normals), toneMapped=true, polygonOffset, polygonOffsetFactor, renderOrder, clippingPlanes`. Back-face inflated shell — `screenspace` keeps constant px width. Disposes its geometry copies itself.
- `Edges` (`threshold=15, lineWidth, color, ...LineMaterial props`) for a crisp wireframe edge look.
- Pulsing emissive square: see §9 snippet.

### Layout / helpers
- `Center` (`top/bottom/left/right/front/back`, `disable*`, `precise`, `onCentered`, `cacheKey`) — centres children's bounding box. Useful to normalise GLB pieces.
- `Bounds` (`fit, clip, observe, margin=1.2, maxDuration, interpolateFunc, onFit`) + `useBounds().refresh(obj).fit()` — camera fit; not needed if you use CameraControls `fitToBox`.
- `Float` (`speed=1, rotationIntensity=1, floatIntensity=1, floatingRange=[-0.1,0.1], enabled, autoInvalidate`) — could lift the selected piece; simpler to damp `position.y` yourself.
- `Billboard` (`follow=true, lockX, lockY, lockZ`), `Text` (troika: `fontSize, color, font (url), anchorX, anchorY, maxWidth, outlineWidth, outlineColor, ...mesh props`) — board coordinates (a–h/1–8) as 3D text; `Html` (`center, distanceFactor, occlude ('raycast'|'blending'|refs), transform, sprite, zIndexRange, portal, pointerEvents, wrapperClass, as`) — DOM overlays like the promotion picker anchored to a square.
- `Grid` (`cellSize, cellThickness, cellColor, sectionSize, sectionThickness, sectionColor, infiniteGrid, fadeDistance, fadeStrength, fadeFrom, followCamera, side, args`) — "Minimal White" floor.
- `Backdrop` (`floor=0.25, segments=20, receiveShadow`) — curved studio backdrop for Minimal White.
- `Lightformer` (`form: 'circle'|'ring'|'rect'|'plane'|'box', intensity, color, scale, target, map, toneMapped`) — inside `<Environment>{...}</Environment>` to add soft highlights in glossy pieces (Neon Arcade).
- `Stars` (`radius=100, depth=50, count=5000, factor=4, saturation=0, fade=false, speed=1`) — Space room. `Sparkles` (`count, speed, opacity, color, size, scale, noise`) — arcade ambience. `Sky` (`distance, sunPosition, inclination, azimuth, turbidity, rayleigh, mieCoefficient, mieDirectionalG`) and `Clouds`/`Cloud` (`segments, bounds, volume, opacity, speed, fade, color, growth, seed, concentrate`) — Park room (Clouds are costly on mobile).
- `Detailed distances={[0, 15, 30]} hysteresis?` with N children meshes = `THREE.LOD` — optional LOD for pieces.

### Performance
- `PerformanceMonitor` props (defaults): `ms=250, iterations=10, threshold=0.75, step=0.1, factor=0.5 (initial), flipflops=Infinity, bounds=(refreshrate) => refreshrate > 100 ? [60,100] : [40,60], onIncline(api), onDecline(api), onChange(api), onFallback(api), children`. `api = { fps, factor (0..1), refreshrate, frames[], averages[], index, flipped, fallback, subscribe }`. It samples fps every `ms`, after `iterations` samples compares the share of samples above upper/below lower bound against `threshold`, then bumps `factor` by ±`step` and calls `onIncline`/`onDecline` (+`onChange`). After `flipflops` direction changes it sets `fallback=true`, calls `onFallback` and **stops sampling**. `[src: core/PerformanceMonitor.js L6-84; drei.docs.pmnd.rs/performances/performance-monitor]`
  - Frame-time watchdog (FR-31 "below 30 fps for 5 s → drop a tier"): `<PerformanceMonitor ms={500} iterations={10} threshold={0.75} bounds={() => [30, 55]} onDecline={() => dropTier()} flipflops={3} onFallback={() => setTier('low')} />` — 10 × 500 ms = 5 s window.
  - Docs example for DPR: `<PerformanceMonitor factor={1} onChange={({ factor }) => setDpr(Math.floor(0.5 + 1.5 * factor))} />`.
- `AdaptiveDpr pixelated?` — multiplies `viewport.initialDpr` by `performance.current` (drops to `performance.min` while `regress()` is active, e.g. during camera drag when controls have `regress`); restores on unmount. `AdaptiveEvents` — disables raycasting while regressed.
- `Preload all?` — `gl.compile(scene, camera)` + a CubeCamera pass to force shader compilation (kills first-interaction jank). Mount inside `<Suspense>` after assets.
- `Stats showPanel? className? parent?` (stats.js) and `StatsGl`.
- `Bvh` (three-mesh-bvh accelerated raycast) — unnecessary for 64 squares + 32 pieces.

---

## 5. Camera controls

### Recommendation
Use **drei `CameraControls`** (camera-controls 3.1.2), not `OrbitControls`, because FR-20..FR-25 need: polar/azimuth/distance clamps (both have), **target boundary box** (`setBoundary(Box3)` — OrbitControls has none), **promise-based animated transitions** (`setLookAt(..., true)`, `rotateTo`, `rotateAzimuthTo`), `saveState()/reset(true)`, `toJSON()/fromJSON()` for session persistence, `smoothTime` damping, right-button truck by default, two-finger dolly+truck by default. Cinematic auto-orbit is a 3-line `useFrame` (see snippet) instead of OrbitControls' `autoRotate`.

### drei `<CameraControls>` props — `core/CameraControls.d.ts`, `.js`
`impl?`, `camera?`, `domElement?`, `makeDefault?` (sets `state.controls`), `regress?` (calls `performance.regress()` on interaction), `events?`, callbacks `onControlStart/onControl/onControlEnd/onTransitionStart/onUpdate/onWake/onRest/onSleep` (+ legacy `onStart/onEnd/onChange`), and **every `CameraControlsImpl` instance property as a prop** (`minPolarAngle`, `maxDistance`, `smoothTime`, `dollyToCursor`, `mouseButtons`, `touches`, `enabled`, ...) because it renders `<primitive object={controls} {...rest}/>`. It calls `controls.update(delta)` in `useFrame(..., -1)`, connects to `events.connected || gl.domElement`, and re-installs the THREE subset itself (no `CameraControls.install` needed). Ref type: `CameraControlsImpl`.

### camera-controls 3.1.2 API — `nm/.pnpm/camera-controls@3.1.2_three@0.185.1/node_modules/camera-controls/dist/index.d.ts` + README

Properties (defaults): `enabled=true`, `active` (ro), `currentAction` (ro), `distance`, `minDistance=Number.EPSILON`, `maxDistance=Infinity`, `minZoom=0.01`, `maxZoom=Infinity`, `polarAngle`, `minPolarAngle=0`, `maxPolarAngle=Math.PI`, `azimuthAngle` (accumulative, not wrapped), `minAzimuthAngle=-Infinity`, `maxAzimuthAngle=Infinity`, `boundaryFriction=0`, `boundaryEnclosesCamera=false`, `smoothTime=0.25` (s), `draggingSmoothTime=0.125`, `maxSpeed=Infinity`, `azimuthRotateSpeed=1`, `polarRotateSpeed=1`, `dollySpeed=1`, `dollyDragInverted=false`, `truckSpeed=2`, `dollyToCursor=false`, `dragToOffset=false`, `infinityDolly=false`, `restThreshold=0.0025`, `colliderMeshes=[]`, `interactiveArea`, `mouseButtons: { left, middle, right, wheel }`, `touches: { one, two, three }`.

`CameraControls.ACTION` (bit flags): `NONE 0, ROTATE 1, TRUCK 2, SCREEN_PAN 4, OFFSET 8, DOLLY 16, ZOOM 32, TOUCH_ROTATE 64, TOUCH_TRUCK 128, TOUCH_SCREEN_PAN 256, TOUCH_OFFSET 512, TOUCH_DOLLY 1024, TOUCH_ZOOM 2048, TOUCH_DOLLY_TRUCK 4096, TOUCH_DOLLY_SCREEN_PAN 8192, TOUCH_DOLLY_OFFSET 16384, TOUCH_DOLLY_ROTATE 32768, TOUCH_ZOOM_TRUCK 65536, TOUCH_ZOOM_OFFSET 131072, TOUCH_ZOOM_SCREEN_PAN 262144, TOUCH_ZOOM_ROTATE 524288`.
Defaults: `mouseButtons.left=ROTATE`, `right=TRUCK`, `middle=DOLLY`, `wheel=DOLLY` (perspective); `touches.one=TOUCH_ROTATE`, `two=three=TOUCH_DOLLY_TRUCK` (perspective). So FR-21 (right-drag / two-finger pan) is the **default**; set them explicitly anyway.

Methods (all `enableTransition?: boolean` ones return `Promise<void>` that resolves when the transition ends — or immediately if `false`):
`rotate(azimuthDelta, polarDelta, t)`, `rotateAzimuthTo(az, t)`, `rotatePolarTo(polar, t)`, `rotateTo(az, polar, t)`, `dolly(dist, t)`, `dollyTo(dist, t)`, `dollyInFixed`, `zoom/zoomTo`, `truck(x, y, t)`, `pan` (alias), `forward`, `elevate`, `moveTo(x,y,z,t)`, `lookInDirectionOf`, `fitToBox(box3|obj, t, {cover, paddingTop/Left/Right/Bottom})`, `fitToSphere(sphere|obj, t)`, `setLookAt(px,py,pz,tx,ty,tz,t)`, `lerpLookAt(...A, ...B, t01, transition)`, `setPosition(x,y,z,t)`, `setTarget(x,y,z,t)`, `setFocalOffset(x,y,z,t)`, `setOrbitPoint(x,y,z)`, `setBoundary(box3?)`, `setViewport(...)`, `getPosition(out: Vector3, receiveEndValue?)`, `getTarget(out, receiveEndValue?)`, `getSpherical(out)`, `getFocalOffset(out)`, `normalizeRotations()` (chainable, wraps azimuth to −π..π), `stop()`, `cancel()`, `reset(t): Promise<void[]>`, `saveState()`, `update(delta): boolean`, `toJSON(): string`, `fromJSON(json, t?)`, `connect(el)`, `disconnect()`, `dispose()`, `addEventListener/removeEventListener`.

Events: `'controlstart'`, `'control'`, `'controlend'` (wheel does **not** emit start/end), `'transitionstart'` (user drag or any method with transition), `'update'`, `'wake'`, `'rest'` (movement below `restThreshold` — use this for "animation finished"), `'sleep'` (fully stopped; fires later due to damping).

v3 gotcha: `setLookAt/lerpLookAt/setTarget/setPosition/reset` no longer normalise azimuth → call `controls.normalizeRotations().setLookAt(...)` so the White↔Black flip always takes the short way round (avoid a 3-turn spin after the user orbited several times). Angles: polar 0 = straight above, π/2 = horizon. FR-20 "10°–85° from vertical" → `minPolarAngle = 10° = 0.1745`, `maxPolarAngle = 85° = 1.4835`.

### Verified rig: clamps + presets + reset + persistence + idle auto-orbit + input lock

```tsx
'use client'
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { Box3, Vector3, MathUtils } from 'three'

const { ACTION } = CameraControlsImpl
const DEG = MathUtils.DEG2RAD

// [px,py,pz, tx,ty,tz]
const PRESETS = {
  white:   [0, 7.5, 9,   0, 0, 0],
  black:   [0, 7.5, -9,  0, 0, 0],
  top:     [0, 13, 0.001, 0, 0, 0], // tiny z avoids the polar=0 singularity; still clamped to minPolarAngle
} as const
const TARGET_BOUNDS = new Box3(new Vector3(-4, -0.5, -4), new Vector3(4, 2, 4)) // FR-21 pan box

export function CameraRig({ preset, cinematic, reducedMotion, storageKey = 'chess3d.cam' }) {
  const ref = useRef<CameraControlsImpl>(null)
  const interacting = useRef(false)

  // one-time setup: boundary, saved default seat, session restore (FR-25)
  useEffect(() => {
    const c = ref.current!
    c.setBoundary(TARGET_BOUNDS)
    const [px, py, pz, tx, ty, tz] = PRESETS.white
    c.setLookAt(px, py, pz, tx, ty, tz, false)
    c.saveState()                                // "Reset camera" target
    const saved = sessionStorage.getItem(storageKey)
    if (saved) c.fromJSON(saved, false)          // restores position/target/zoom/focalOffset
    const persist = () => sessionStorage.setItem(storageKey, c.toJSON())
    c.addEventListener('rest', persist)          // 'rest' = settled, cheaper than 'update'
    return () => c.removeEventListener('rest', persist)
  }, [])

  // animated preset transition (FR-23/24, FR-21c). ~800ms => smoothTime ≈ 0.35–0.4 (SmoothDamp approaches asymptotically).
  useEffect(() => {
    const c = ref.current!
    const [px, py, pz, tx, ty, tz] = PRESETS[preset]
    let cancelled = false
    ;(async () => {
      c.enabled = false                          // lock user input during the flip (FR-21c)
      const prev = c.smoothTime
      c.smoothTime = 0.4
      await c.normalizeRotations().setLookAt(px, py, pz, tx, ty, tz, !reducedMotion) // FR-21g: snap if reduced motion
      c.smoothTime = prev
      if (!cancelled) c.enabled = true
    })()
    return () => { cancelled = true; c.enabled = true }
  }, [preset, reducedMotion])

  // cinematic idle auto-orbit that stops on interaction (FR-24)
  useFrame((_, delta) => {
    const c = ref.current
    if (!c || !cinematic || interacting.current || !c.enabled) return
    c.rotate(0.15 * delta, 0, false)             // rad/s; enableTransition=false => applied this frame
  })

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minPolarAngle={10 * DEG}
      maxPolarAngle={85 * DEG}
      minDistance={4}                              // "a few squares"
      maxDistance={22}                             // "whole board plus room"
      smoothTime={0.25}
      draggingSmoothTime={0.1}
      dollySpeed={0.8}
      truckSpeed={1.5}
      dollyToCursor={false}
      boundaryFriction={0.2}
      mouseButtons={{ left: ACTION.ROTATE, middle: ACTION.DOLLY, right: ACTION.TRUCK, wheel: ACTION.DOLLY }}
      touches={{ one: ACTION.TOUCH_ROTATE, two: ACTION.TOUCH_DOLLY_TRUCK, three: ACTION.TOUCH_TRUCK }}
      onControlStart={() => { interacting.current = true; onUserInteracted?.() /* exit cinematic */ }}
      onControlEnd={() => { interacting.current = false }}
    />
  )
}
// Reset button: ref.current.reset(true)  (animates back to the saveState() seat)
// Wheel never fires controlstart/controlend: also treat onControl/'update' during cinematic as "user touched it" if you need wheel to cancel it.
```
Notes: `reset()` returns `Promise<void[]>`. Pass `enabled={false}` as a prop instead of mutating if you prefer React control (drei forwards it to the instance). With `frameloop="demand"` drei already `invalidate()`s on `control/update/transitionstart/wake`; the idle `rotate()` in `useFrame` needs `frameloop="always"` (or call `invalidate()` each tick).

### OrbitControls (alternative) — `three-stdlib` impl via drei `core/OrbitControls.d.ts`
Props: `makeDefault, camera, domElement, regress, enableDamping=true, dampingFactor (0.05), keyEvents=false, onChange, onStart, onEnd, target: Vector3|[x,y,z]`, plus instance props `enabled, autoRotate, autoRotateSpeed (2.0 = 30 s/rev), minDistance, maxDistance, minZoom, maxZoom, minPolarAngle, maxPolarAngle, minAzimuthAngle, maxAzimuthAngle, enableZoom, zoomSpeed, enableRotate, rotateSpeed, enablePan, panSpeed, screenSpacePanning, keyPanSpeed, zoomToCursor, mouseButtons, touches`; methods `saveState(), reset(), update(), getPolarAngle(), getAzimuthalAngle(), getDistance(), listenToKeyEvents(el), dispose()`. `[src: nm/.pnpm/three-stdlib@2.36.1_three@0.185.1/node_modules/three-stdlib/controls/OrbitControls.d.ts L7-44]` Events `change/start/end`. No animated transitions, no target boundary, `reset()` is instant → you'd hand-roll tweens; hence CameraControls is recommended.

---

## 6. three r185 essentials and gotchas

`[src: nm/three/src/*, nm/.pnpm/@types+three@0.185.4/.../src/*]`

- **WebGL2 only** (see §1). `alpha` default `false` in three but fiber passes `alpha: true`.
- `ColorManagement.enabled` default `true`; `renderer.outputColorSpace` default `SRGBColorSpace`. Colour textures (albedo, emissive) must have `texture.colorSpace = SRGBColorSpace`; data textures (normal/roughness/metalness/HDR) stay `LinearSRGBColorSpace`/`NoColorSpace`. GLTFLoader sets these automatically. `THREE.Color('#hex')` is interpreted as sRGB and converted to linear working space.
- Tone mapping constants (`import { ACESFilmicToneMapping } from 'three'`): `NoToneMapping 0, LinearToneMapping 1, ReinhardToneMapping 2, CineonToneMapping 3, ACESFilmicToneMapping 4, CustomToneMapping 5, AgXToneMapping 6, NeutralToneMapping 7`. Fiber default = ACES (FR-29). Set via `<Canvas gl={{ toneMapping: AgXToneMapping, toneMappingExposure: 1.1 }}>`. When postprocessing's `EffectComposer` handles tone mapping, materials rendered by the composer ignore `gl.toneMapping` (it applies `ToneMappingEffect`); `toneMapped={false}` on a material opts it out (useful for emissive highlight overlays so bloom sees raw HDR values > 1).
- Shadow map types: `BasicShadowMap 0, PCFShadowMap 1, PCFSoftShadowMap 2, VSMShadowMap 3`. `gl.shadowMap.{enabled, type, autoUpdate, needsUpdate}`. `shadow.mapSize` default 512² → use 1024–2048 for the board.
- Sides/blending: `FrontSide 0, BackSide 1, DoubleSide 2`, `AdditiveBlending 2`. `EquirectangularReflectionMapping 303`. `DynamicDrawUsage 35048` (for per-frame instance buffers).
- `MeshStandardMaterial` defaults: `roughness 1.0, metalness 0.0, envMapIntensity 1.0, emissiveIntensity 1.0`; props `color, map, normalMap, normalScale: Vector2, roughnessMap, metalnessMap, aoMap, aoMapIntensity, emissive: Color, emissiveMap, envMap, envMapRotation: Euler, flatShading`. Environment from `scene.environment` applies to all PBR materials automatically.
- `MeshPhysicalMaterial` (extends Standard) defaults: `transmission 0, thickness 0, ior 1.5, clearcoat 0, clearcoatRoughness 0, sheen 0, sheenRoughness 1, sheenColor #000, iridescence 0, iridescenceIOR 1.3, iridescenceThicknessRange [100,400], specularIntensity 1, specularColor #fff, attenuationDistance Infinity, attenuationColor #fff, anisotropy 0, dispersion 0`. Note `transmission/clearcoat/sheen/iridescence/dispersion/anisotropy` are getters/setters (setting from 0 → >0 triggers a shader recompile).
  - Glass pieces: `<meshPhysicalMaterial color="#eaf6ff" transmission={1} thickness={0.6} ior={1.5} roughness={0.08} metalness={0} clearcoat={1} attenuationColor="#bfe3ff" attenuationDistance={2} envMapIntensity={1.2} />` (needs an env map; transmission renders a per-frame transmission pass — expensive, High tier only; do not set `transparent`).
  - Marble: `<meshPhysicalMaterial color="#f2efe9" roughness={0.35} metalness={0} clearcoat={0.4} clearcoatRoughness={0.25} sheen={0.2} sheenColor="#fff" />` (+ a marble albedo/roughness texture if you have one).
  - Polished wood: `<meshStandardMaterial map={...} roughness={0.45} metalness={0.05} envMapIntensity={0.8} />`. Metal: `metalness={1} roughness={0.2}`.
- `LatheGeometry(points: Vector2[], segments = 12, phiStart = 0, phiLength = 2π)` — revolve a 2D profile (x = radius ≥ 0, y = height) around Y. Procedural pieces: pawn/bishop/queen/king bodies as lathes (`segments 32–48`), knight needs a GLB. `<latheGeometry args={[profile, 40]} />` then `geometry.computeVertexNormals()` is done by the constructor.
- `InstancedMesh(geometry, material, count)`: `setMatrixAt(i, Matrix4)`, `getMatrixAt`, `setColorAt(i, Color)` (creates `instanceColor`), then `instanceMatrix.needsUpdate = true` / `instanceColor.needsUpdate = true`; `count` can be lowered to hide tail instances; `computeBoundingBox/Sphere()` for culling; `instanceId` arrives in raycast events. Good for the 64 squares (one draw call) — drei `<Instances>/<Instance>` wraps this declaratively.
- `Box3`: `set(min,max)`, `setFromCenterAndSize(center,size)`, `setFromObject(obj, precise?)`, `setFromPoints`, `expandByPoint/expandByScalar`, `containsPoint(v)`, `clampPoint(v, out)`, `getCenter(out)`, `getSize(out)`, `union(box)`, `isEmpty()`. Used by `CameraControls.setBoundary` and `fitToBox`.
- `MathUtils`: `clamp, lerp(a,b,t), damp(x, y, lambda, dt)` (frame-rate independent exp decay: `lerp(x, y, 1 - exp(-lambda*dt))`), `smoothstep, smootherstep, mapLinear, inverseLerp, euclideanModulo, degToRad, radToDeg, DEG2RAD, RAD2DEG, pingpong, randFloat, generateUUID`.
- `Vector3`: `set, copy, clone, add, sub, multiplyScalar, length, normalize, lerp(v, a), lerpVectors(a, b, t), distanceTo, distanceToSquared, applyQuaternion, project(camera)/unproject(camera), setFromMatrixPosition(m)`. `Color`: `set(any), setHex, setRGB, setHSL(h,s,l), setStyle('#hex'), copy, clone, lerp(c, a), lerpColors(a,b,t), multiplyScalar, getHex(), getHexString(), convertSRGBToLinear()`.
- Disposal: `geometry.dispose()`, `material.dispose()`, `texture.dispose()`, `renderTarget.dispose()`, `renderer.dispose()`. Fiber auto-disposes objects it created when they unmount (opt out per element with `dispose={null}` — do this for shared GLTF geometries/materials from `useGLTF`, and for cached textures). `object.removeFromParent()`, `object.traverse(cb)`.
- `Object3D.userData` is free-form — tag square/piece meshes (`userData.square = 'e4'`) and read `e.object.userData` in handlers.

---

## 7. Quality tiers mapping (FR-31) — what to toggle

| Tier | Canvas | Board | Shadows | Env | Post |
|---|---|---|---|---|---|
| Low | `dpr={[1, 1.25]}`, `shadows="basic"` or `false`, `frameloop="demand"` optional | `meshStandardMaterial` (no reflector) | `<ContactShadows frames={1}>` re-keyed per move, or `<BakeShadows/>` | `Environment` with `background` but `blur` 0, `environmentIntensity` lower | off |
| Medium | `dpr={[1, 1.5]}`, `shadows` (PCFSoft) | `MeshReflectorMaterial resolution={256} blur={[200,100]}` | `ContactShadows` (`frames={Infinity}`, `resolution 512`) | full | off |
| High | `dpr={[1, 2]}`, `shadows="soft"` + `<SoftShadows/>` | `resolution={1024}` | directional light shadow map 2048 + ContactShadows | full + `Lightformer`s | bloom/SSAO (other doc) |

Auto-select from `navigator.hardwareConcurrency`, `window.devicePixelRatio`, `useDetectGPU().tier`; watchdog via `PerformanceMonitor` (§4). Changing `dpr` prop re-applies `setPixelRatio` reactively; changing `shadows` type re-flags `shadowMap.needsUpdate`.

---

## 8. Scene skeleton (verified component/prop names)

```tsx
'use client'
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, ContactShadows, PerformanceMonitor, AdaptiveDpr, Preload, SoftShadows, Stars } from '@react-three/drei'
import { ACESFilmicToneMapping } from 'three'

export default function Board3D({ tier, room, ...game }) {
  return (
    <Canvas
      shadows={tier === 'high' ? 'soft' : tier === 'medium' ? true : 'basic'}
      dpr={tier === 'high' ? [1, 2] : [1, 1.5]}
      camera={{ fov: 40, near: 0.1, far: 200, position: [0, 7.5, 9] }}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, preserveDrawingBuffer: false }}
      onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onGlLost() })}
      onPointerMissed={() => game.clearSelection()}
      className="h-full w-full touch-none"   // touch-none: stop browser gestures fighting CameraControls
    >
      <Suspense fallback={null}>
        <Environment files={`/hdri/${room.hdri}.hdr`} background blur={room.blur} environmentIntensity={room.envIntensity} />
        {room.id === 'space' && <Stars radius={80} depth={40} count={4000} factor={3} fade />}
        <directionalLight position={room.key.position} intensity={room.key.intensity} castShadow
          shadow-mapSize={[2048, 2048]} shadow-bias={-0.0002} shadow-normalBias={0.02}
          shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-camera-far={30} />
        {tier === 'high' && <SoftShadows size={20} samples={12} />}
        <BoardSurface room={room} />      {/* §4 reflector */}
        <Squares {...game} />
        <Pieces {...game} />
        <ContactShadows position={[0, 0.002, 0]} scale={10} blur={2} opacity={0.5} far={2} resolution={512} frames={tier === 'low' ? 1 : Infinity} />
        <CameraRig {...} />                {/* §5 */}
        <Preload all />
      </Suspense>
      <PerformanceMonitor ms={500} iterations={10} bounds={() => [30, 55]} onDecline={game.dropTier} />
      <AdaptiveDpr />
    </Canvas>
  )
}
```

---

## 9. Animation without extra libraries (FR-17, FR-30, NFR-10)

`@react-spring/three` is not installed. Two verified options:

**A. `THREE.MathUtils.damp` in `useFrame` (no deps)** — exponential ease-out, framerate independent; ~250 ms feel with `lambda ≈ 16`.

```tsx
function Piece({ target, lifted }: { target: [number, number, number]; lifted: boolean }) {
  const ref = useRef<THREE.Group>(null!)
  useFrame((_, dt) => {
    const p = ref.current.position
    p.x = MathUtils.damp(p.x, target[0], 16, dt)
    p.z = MathUtils.damp(p.z, target[2], 16, dt)
    p.y = MathUtils.damp(p.y, lifted ? 0.35 : 0, 12, dt)
  })
  return <group ref={ref}>...</group>
}
```

**B. `maath/easing` (already in node_modules as drei's dep; add `pnpm add maath@0.10.8` to import it)** — SmoothDamp with real `smoothTime` seconds, optional `maxSpeed`, easing, and a boolean "still animating" return. `[src: nm/.pnpm/maath@0.10.8.../dist/declarations/src/easing.d.ts]`

```ts
import { damp3, dampC, dampE, damp } from 'maath/easing'
// damp3(current: Vector3, target: Vector3 | [x,y,z] | number, smoothTime = 0.25, delta, maxSpeed?, easing?, eps?) => boolean
useFrame((_, dt) => {
  const moving = damp3(ref.current.position, target, 0.12, dt)       // ≈250 ms to settle
  dampC(matRef.current.emissive, selected ? '#ffd166' : '#000', 0.15, dt)
  if (!moving && wasMoving.current) onArrive()                         // fire capture-slide/sfx when settled
})
```
Also: `damp(obj, 'opacity', 1, 0.2, dt)`, `dampE(euler, [x,y,z], ...)`, `dampAngle` (shortest path), `dampQ`, `dampS(spherical, ...)`, `dampLookAt(obj, target, ...)`; easings `sine/cubic/quint/circ/quart/expo .in/.out/.inOut`, `rsqw`, `linear`, `exp`.

For a strict, deterministic 250 ms slide (FR-17) use a tiny time-based tween instead of damping (damping never "ends" exactly):

```ts
// start: from.copy(pos); t0 = clock.elapsedTime
useFrame(({ clock }) => {
  const k = Math.min(1, (clock.elapsedTime - t0) / 0.25)
  const e = k < 0.5 ? 4*k*k*k : 1 - Math.pow(-2*k + 2, 3) / 2   // easeInOutCubic
  pos.lerpVectors(from, to, e)
  pos.y = Math.sin(e * Math.PI) * 0.25                            // small arc
  if (k === 1) done()
})
```
Captured piece → tray (FR-17): tween to a tray slot position off the board, then set `visible=false` or reparent to a `<group>` in the tray. Pause piece tweens during the camera flip (NFR-10) by gating on a `flipping` flag.

**Pulsing emissive square overlay (FR-30):**

```tsx
function HighlightSquare({ square, kind }: { square: [number, number]; kind: 'legal' | 'capture' | 'check' | 'last' }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null!)
  const color = kind === 'check' ? '#ff3b3b' : kind === 'capture' ? '#ff9f43' : kind === 'last' ? '#ffd166' : '#5ee0a1'
  useFrame(({ clock }) => {
    const pulse = 0.55 + 0.45 * Math.sin(clock.elapsedTime * 3.0)   // 0.1..1, ~0.5 Hz
    mat.current.emissiveIntensity = 0.8 + 1.6 * pulse                 // >1 so bloom picks it up
    mat.current.opacity = 0.35 + 0.25 * pulse
  })
  return (
    <mesh position={[square[0] - 3.5, 0.004, square[1] - 3.5]} rotation-x={-Math.PI / 2} raycast={() => null} renderOrder={1}>
      <planeGeometry args={[0.92, 0.92]} />
      <meshStandardMaterial ref={mat} color={color} emissive={color} emissiveIntensity={1}
        transparent opacity={0.5} depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-1} />
    </mesh>
  )
}
```
`raycast={() => null}` keeps the overlay from stealing clicks from the square beneath; `toneMapped={false}` + `emissiveIntensity > 1` gives the bloom pass HDR energy; `depthWrite={false}` avoids z-fighting with the board and the reflector.

Selected-piece lift + outline: damp `position.y` to ~0.3 and render `<Outlines thickness={0.02} color="#ffd166" screenspace />` as a child of the piece mesh (Outlines needs the parent to be a `Mesh` with `geometry`; for a `<group>` GLB put it inside each mesh or use one lathe mesh).

---

## 10. Checklist of gotchas (all verified above)

1. three r185 has **no WebGL1 fallback**; probe `webgl2` before mounting `<Canvas>` — Canvas swallows the constructor error into an unhandled rejection; `fallback` prop does NOT cover it.
2. `next/dynamic(..., { ssr: false })` must live in a `'use client'` file (Next 16 errors otherwise).
3. `MeshReflectorMaterial` reflects around the mesh's local +Z → `rotation-x={-Math.PI/2}` on the mesh; it re-renders the scene every frame (disable on Low).
4. drei `Environment preset` = external CDN; ship `/hdri/*.hdr` (RGBELoader) and `useEnvironment.preload`.
5. `useGLTF` Draco decoder defaults to gstatic CDN → self-host or `setDecoderPath('/draco/')`; mark shared GLTF geometry/material `dispose={null}`.
6. camera-controls v3: call `normalizeRotations()` before `setLookAt/reset/setTarget/setPosition`; wheel emits no `controlstart/controlend`; use `'rest'` not `'sleep'` for "transition finished"; `enabled=false` locks input; all transition methods return promises.
7. `maath` and `camera-controls` are not hoisted by pnpm — `pnpm add maath` before importing `maath/easing`; use drei's `CameraControlsImpl` export instead of importing `camera-controls`.
8. `useThree(s => s.camera.zoom)` is not reactive (three internals); read in `useFrame`.
9. `shadows="soft"` == `true` == PCFSoft; `'variance'` (VSM) needs `shadow.blurSamples/radius` and light `shadow.camera` tuning; PCFSoft ignores `shadow.radius`.
10. `SoftShadows` and `legacy` are global side effects (shader chunk / `ColorManagement.enabled`) — mount once per app.
11. `PerformanceMonitor` stops sampling permanently after `onFallback`; re-mount (change `key`) to restart after a manual tier change.
12. `Canvas` wrapper is `position:relative; width/height:100%` — the parent needs an explicit height; add `touch-action: none` so touch orbit doesn't scroll the page.

---

## Unverified / open questions

- **fiber ErrorBoundary vs renderer creation**: verified from source that `configure()` runs in an un-caught async `run()`; not tested empirically whether Next's dev overlay surfaces the unhandled rejection. Wrap the pre-mount probe regardless.
- ~~**`transpilePackages: ['three']`**~~: **RESOLVED (empirically, in this repo)** - Next 16.3.4 + Turbopack needs **no** `transpilePackages` for `three`, `three/examples/jsm/*` or drei's `three-stdlib`; adding it is inert. See `docs/research/nextjs16-shadcn.md` → "Verified build smoke test" §3. Caveat §5: `three-stdlib` is **not** importable from app code under pnpm (transitive dep only) - `pnpm add three-stdlib` if you need it directly.
- **`smoothTime` ↔ perceived duration**: camera-controls uses SmoothDamp; "≈800 ms" for the flip with `smoothTime 0.35–0.4` is an estimate (asymptotic; the `rest` event / promise resolves when speed < `restThreshold`). Tune on stream.
- **MeshReflectorMaterial `mixBlur` default**: code default is `0`, drei docs comment says "default = 1"; code wins for 10.7.8.
- **`Environment ground` + `blur`**: source shows ground mode builds a `GroundProjectedEnv` mesh via `EnvironmentMap`; whether `backgroundBlurriness` still visually applies in that mode was not verified.
- **`ContactShadows` `frames={1}` re-bake trigger**: source shows a `count` guard vs `frames`; the recommended re-key (`key={moveNumber}`) approach is inferred, not run.
- **Draco decoder version**: drei 10.7.8 uses `https://www.gstatic.com/draco/versioned/decoders/1.5.5/`; the docs page says `v1/decoders/` — the installed code path is authoritative. Self-hosted decoders must match the DRACOLoader version in `three-stdlib@2.36.1`.
- ~~**`@types/three@0.185.4`** is only a transitive dep…~~ **RESOLVED: it is REQUIRED.** `next build` fails with `TS7016: Could not find a declaration file for module 'three'` without it. `pnpm add -D @types/three` (0.185.4) has been run in this repo. See "Verified build smoke test" §2.
- **NeutralToneMapping/AgX visual choice** vs FR-29 "ACES": FR-29 says ACES; both alternatives exist in r185 if the HDRI backgrounds look too desaturated under ACES.
- drei `Html`, `Text` (troika) and `Clouds` performance on the "smallest supported phone" (NFR-6) not measured.
