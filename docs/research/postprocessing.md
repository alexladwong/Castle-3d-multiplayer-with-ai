# Post-processing research: @react-three/postprocessing 3.1.1 + postprocessing 6.39.4

Scope: subtle bloom on highlighted squares / check indicator, ambient occlusion, ACES tone mapping,
selected-piece outline, quality tiers (FR-29, FR-30, FR-31, FR-32, NFR-2 in the requirements doc).

Verification sources (all read from this repo's `node_modules` unless noted):

- `RP-src` = `node_modules/@react-three/postprocessing/src/**/*.tsx` (3.1.1 source ships in the package)
- `RP-dts` = `node_modules/@react-three/postprocessing/dist/**/*.d.ts`
- `RP-tests` = `node_modules/@react-three/postprocessing/src/tests/*.test.tsx`
- `PP-dts` = `node_modules/postprocessing/build/types/index.d.ts` (6.39.4)
- `PP-js` = `node_modules/postprocessing/build/index.js`
- `N8AO-src` = `node_modules/.pnpm/n8ao@2.0.1_*/node_modules/n8ao/{README.md,src/N8AOPostPass.js}`
- `R3F-js` = `node_modules/@react-three/fiber/dist/events-156d8d12.esm.js` (9.7.0)
- `C7` = context7 `/pmndrs/react-postprocessing` docs
- `GH` = GitHub releases page for pmndrs/react-postprocessing (WebFetch)

---

## 0. TL;DR decisions for the chess project

1. Use `<N8AO>` (exported from `@react-three/postprocessing`, backed by `n8ao@2.0.1` which is already installed
   as a transitive dep) for ambient occlusion. Do NOT use `<SSAO>`: it requires `enableNormalPass`, its wrapper
   defaults are legacy values, and it is documented as deprecated-parameter-heavy. (RP-src `SSAO.tsx`, C7)
2. Put `<N8AO>` FIRST inside `<EffectComposer>`; put `<ToneMapping mode={ToneMappingMode.ACES_FILMIC}>` LAST.
3. For "subtle bloom on highlighted squares + check indicator", prefer plain `<Bloom mipmapBlur luminanceThreshold={1}>`
   with emissive highlight materials whose `emissiveIntensity > 1` (HalfFloat buffers keep HDR values). Use
   `<SelectiveBloom>` only if non-highlight geometry blooms. Do not combine `<Selection>` with a manual
   `selection` prop on another effect - context wins and the prop is ignored (see section 6).
4. `<Outline>` for the selected piece needs `<EffectComposer autoClear={false}>` (console warning otherwise).
5. The composer force-sets `gl.toneMapping = NoToneMapping` while MOUNTED (even when `enabled={false}`).
   For the Low tier ("no post"), UNMOUNT the composer rather than passing `enabled={false}`, otherwise the
   direct r3f render loses tone mapping. (RP-src `EffectComposer.tsx`)
6. `resolutionScale` on `<EffectComposer>` is NOT a global render-scale. It only feeds a
   `DepthDownsamplingPass` when `enableNormalPass` is on (and SSAO). Use `<Canvas dpr={...}>` for FR-32.
7. Default `multisampling={8}`. Set `multisampling={0}` on Medium/low-end and use `<SMAA>` if edges matter.

---

## 1. Imports

```ts
// React components (all named exports; RP-dts index.d.ts)
import {
  EffectComposer, EffectGroup,
  Selection, Select,
  Bloom, SelectiveBloom, Outline, ToneMapping,
  N8AO, SSAO,
  SMAA, FXAA, Vignette, Noise, BrightnessContrast, HueSaturation,
} from '@react-three/postprocessing'

// Enums / classes (PP-dts)
import {
  BlendFunction, ToneMappingMode, KernelSize, SMAAPreset, EdgeDetectionMode, PredicationMode,
  VignetteTechnique, Resolution,
  type BloomEffect, type SelectiveBloomEffect, type OutlineEffect, type ToneMappingEffect,
  type EffectComposer as EffectComposerImpl,
} from 'postprocessing'
```

Package facts (verified `package.json`s):

- `@react-three/postprocessing` 3.1.1 is ESM-only (`"type": "module"`, single `exports: "./dist/index.js"`),
  `sideEffects: false`. Dependencies: `maath ^0.10.8`, `n8ao ^2.0.0`.
- `postprocessing` 6.39.4 peer-depends on `three >= 0.168.0 < 0.186.0` -> installed three 0.185.1 is inside range.
- `n8ao` 2.0.1 is installed only in pnpm's virtual store (`node_modules/.pnpm/n8ao@2.0.1_...`). There is NO
  `node_modules/n8ao` at the project root, so `import { N8AOPostPass } from 'n8ao'` from app code will fail to
  resolve. You do not need it: `<N8AO>` is re-exported by `@react-three/postprocessing`. If you want the
  `N8AOPostPass` type for a ref, run `pnpm add n8ao`.
- Everything here must run in a client component (it is all inside `<Canvas>` anyway).

React 19 note: every component takes `ref` as a normal prop (typed `ref?: Ref<XEffect>`), no `forwardRef`.
(RP-dts)

---

## 2. `<EffectComposer>` (RP-src `EffectComposer.tsx`, RP-dts `EffectComposer.d.ts`)

```ts
type EffectComposerProps = {
  enabled?: boolean                 // default true
  children: ReactNode
  depthBuffer?: boolean             // passed to postprocessing EffectComposer (its default: true)
  enableNormalPass?: boolean        // adds NormalPass (+ DepthDownsamplingPass if resolutionScale set). Needed by SSAO only.
  stencilBuffer?: boolean           // postprocessing default false
  autoClear?: boolean               // default true. MUST be false for <Outline> (and GodRays)
  autoRenderToScreen?: boolean      // default true
  resolutionScale?: number          // ONLY used for DepthDownsamplingPass / SSAO fallback. Not a render scale.
  multisampling?: number            // default 8 (MSAA samples, WebGL2). 0 disables.
  frameBufferType?: TextureDataType // default HalfFloatType (HDR buffers -> bloom thresholds > 1 work)
  renderPriority?: number           // default 1 (useFrame priority; >0 disables r3f's own render)
  camera?: Camera; scene?: Scene    // override defaults from useThree()
  renderPass?: (scene, camera) => Pass  // default (s, c) => new RenderPass(s, c); keep identity stable
  mergeMode?: 'auto' | 'all' | 'none'   // default 'auto' (3.1.0+)
  ref?: Ref<EffectComposerImpl>
}
```

Behaviour verified in source:

- Composer is (re)created in a `useEffect` keyed on
  `[camera, gl, depthBuffer, stencilBuffer, multisampling, frameBufferType, autoRenderToScreen, renderPass, scene, enableNormalPass, resolutionScale]`.
  Changing any of those tears down and rebuilds every pass. Keep them stable per tier; do not animate them.
- Rendering: `useFrame((_, delta) => { ...; composer.render(delta) }, enabled ? renderPriority : 0)`.
  When `enabled={false}` the priority becomes 0 and r3f resumes its automatic `gl.render(scene, camera)`
  (R3F-js line ~16171: `if (!state.internal.priority && state.gl.render) state.gl.render(...)`).
  So `enabled={false}` is a cheap toggle that keeps the composer and its GPU buffers alive.
- Tone mapping guard: `useEffect(() => { gl.toneMapping = NoToneMapping; return release }, [gl])`.
  This runs for the lifetime of the mounted composer regardless of `enabled`. The original value is restored on
  unmount only if `gl.toneMapping` still equals `NoToneMapping` at that moment. Consequence: with
  `enabled={false}` the scene is rendered directly by r3f WITHOUT tone mapping (r3f's Canvas default is
  `ACESFilmicToneMapping` unless `flat`, R3F-js line ~15903). Unmount the composer for the "no post" tier.
- `autoClear`: the frame callback sets `gl.autoClear = autoClear` only around `composer.render()` and restores
  the previous value afterwards, so it does not leak into direct rendering.
- Pass building (`buildPasses`): consecutive `Effect` children are merged into one `EffectPass`; any bare `Pass`
  child (e.g. `<N8AO>`) is inserted as-is and splits the chain. In `'auto'` mode at most one CONVOLUTION effect
  per `EffectPass`. In postprocessing 6.39.4 the CONVOLUTION-flagged effects are `BokehEffect` (used by
  DepthOfField), `RealisticBokehEffect`, `ChromaticAberrationEffect` and `SMAAEffect` (PP-js lines 4368-4388,
  4576-4592, 9258-9296, 10949-10968). Bloom, Outline, ToneMapping, Vignette, Noise, BrightnessContrast,
  HueSaturation are not convolution and merge freely.
- If any child is an `EffectGroup` pass or `<N8AO>` (both registered in `groupPasses`), a trailing `CopyPass` is
  appended so disabling the last pass never blanks the canvas.
- Size is read from `gl.getSize()` every frame and `composer.setSize()` is called only when it changed.
- Children are not mounted until the composer exists (`if (!state) return null`).
- Multiple composers can share a renderer (ref-counted guards) but you do not need that here.

### `<EffectGroup>` (RP-src `EffectGroup.tsx`)

```tsx
<EffectGroup enabled={bloomOn}>   // groups children into ONE EffectPass; toggles Pass.enabled, no rebuild
  <Bloom ... />
</EffectGroup>
```

`enabled` flips `pass.enabled` in a layout effect - cheap. Use it to toggle individual features per tier at
runtime without reconstructing effects.

---

## 3. Ambient occlusion

### 3a. `<N8AO>` - recommended (RP-src `passes/N8AO.tsx`, RP-dts `passes/N8AO.d.ts`, N8AO-src)

```ts
type N8AOProps = {
  enabled?: boolean              // default true; flips pass.enabled (no reconstruction)
  aoRadius?: number              // default 5 (WORLD units; see sizing note)
  distanceFalloff?: number       // default 1 (ratio of radius; 1.0 is the safe value per n8ao README)
  intensity?: number             // default 1 in the wrapper (n8ao's own default is 5). pow(ao, intensity)
  quality?: 'performance' | 'low' | 'medium' | 'high' | 'ultra'   // maps to setQualityMode('Performance'|...)
  aoSamples?: number             // default 16
  denoiseSamples?: number        // default 4
  denoiseRadius?: number         // default 12
  color?: ReactThreeFiber.Color  // occlusion tint, sRGB, default black
  halfRes?: boolean              // compute AO at half res + depth-aware upscale (2-4x faster per README)
  depthAwareUpsampling?: boolean // default true; only matters with halfRes
  screenSpaceRadius?: boolean    // aoRadius becomes pixels (16-64), distanceFalloff becomes 0..1 ratio (0.2 typical)
  renderMode?: 0 | 1 | 2 | 3 | 4 // 0 Combined, 1 AO only, 2 No AO, 3 Split, 4 Split AO (debug views)
  ref?: Ref<N8AOPostPass>
}
```

Verified behaviour:

- Constructed once per `[camera, scene]` as `new N8AOPostPass(scene, camera)`; props are written into
  `pass.configuration` via r3f `applyProps` in a layout effect, then `quality` is applied via
  `setQualityMode(...)` in a later layout effect (so on mount `quality` overrides `aoSamples/denoiseSamples/denoiseRadius`;
  later changes to those props override again).
- r3f `applyProps` skips `undefined` values (R3F-js applyProps: `if (value === undefined) continue`), so leaving
  `halfRes` undefined leaves n8ao's default (`false`).
- Quality presets (N8AO-src README table): Performance 8/4/12, Low 16/4/12, Medium 16/8/12, High 64/8/6,
  Ultra 64/16/6 (aoSamples/denoiseSamples/denoiseRadius). n8ao 2.x also has `'Neural-Low' | 'Neural-Medium' |
  'Neural-High'` modes (N8AOPostPass.js `setQualityMode`) but the wrapper's `quality` type does not include them;
  reach them through `ref.current.setQualityMode('Neural-Medium')` if wanted (untyped).
- Changing `aoSamples`, `denoiseSamples`, `quality`, `halfRes`, `depthAwareUpsampling` recompiles shaders
  (README: "expensive... do this only once"). Do this at tier switch only, never per frame.
- `N8AOPostPass` has NO `dispose()` (grep of N8AOPostPass.js finds no dispose method; wrapper has a
  `// TODO: implement dispose upstream; this effect has memory leaks without` comment). Prefer
  `<N8AO enabled={aoOn}>` over mounting/unmounting it repeatedly.
- The wrapper registers the pass in `groupPasses`, so a trailing `CopyPass` is added automatically - disabling
  N8AO while it is the last pass still renders. (RP-tests `N8AO.test.tsx`)
- N8AO does not need `enableNormalPass` (C7 docs + source: it renders its own depth/normals).
- Gamma: `N8AOPostPass` auto-detects whether it is the last pass and applies gamma only then
  (N8AOPostPass.js line ~787: `autosetGamma ? this.renderToScreen : configuration.gammaCorrection`). With
  ToneMapping after it, it is not last, so no double correction.
- Placement: n8ao README - "N8AOPostPass requires a RenderPass before it". Make it the FIRST child of
  `<EffectComposer>` (the composer adds the RenderPass itself).
- MSAA: n8ao README says "hardware antialiasing does NOT work with ambient occlusion" and recommends SMAA.
  Plan for `multisampling={0}` + `<SMAA />` when AO is on; verify visually (see open questions).
- Sizing rule from README: radius should be 1-2 orders of magnitude below scene scale. A chess board that is
  8 world units across -> start with `aoRadius` 0.3-0.8, `distanceFalloff` 1, `intensity` 2-3
  (README: intensity 2 = soft, 5 = heavy).
- Transparency: transparent objects are auto-detected and rendered twice (`transparencyAware`). Emissive
  highlight overlays that are transparent will cost extra; set `mesh.userData.treatAsOpaque = true` on them or
  `mesh.userData.cannotReceiveAO = true` (README) if artifacts appear. `configuration.transparencyAware`,
  `accumulate`, `aoTones`, `biasOffset`, `biasMultiplier`, `gammaCorrection` exist on `ref.current.configuration`
  but are not wrapper props (N8AOPostPass.js lines 75-96).

### 3b. `<SSAO>` - still exists in 3.1.1, not recommended here (RP-src `effects/SSAO.tsx`, PP-dts)

- Requires `<EffectComposer enableNormalPass>`; without it the component logs
  `console.error('Please enable the NormalPass in the EffectComposer in order to use SSAO.')` and renders an
  empty `{}` primitive (no AO). The EffectComposer prop comment says "Only used for SSGI currently, leave it
  disabled for everything else unless it's needed" - in practice SSAO is the consumer.
- If the composer also has `resolutionScale`, a `DepthDownsamplingPass` is created and SSAO is built with
  `normalDepthBuffer` (deprecated in postprocessing) instead of the normal texture.
- Wrapper defaults: `blendFunction=BlendFunction.MULTIPLY, samples=30, rings=4, distanceThreshold=1.0,
  distanceFalloff=0.0, rangeThreshold=0.5, rangeFalloff=0.1, luminanceInfluence=0.9, radius=20, bias=0.5,
  intensity=1.0, depthAwareUpsampling=true`. postprocessing's own defaults differ (`samples=9, rings=7,
  radius=0.1825 "Range [1e-6, 1.0]", bias=0.025, luminanceInfluence=0.7`) and `distanceThreshold/distanceFalloff/
  rangeThreshold/rangeFalloff` are marked Deprecated in PP-dts in favour of `worldDistanceThreshold/
  worldDistanceFalloff/worldProximityThreshold/worldProximityFalloff`. Expect to retune everything.
- Full prop list (all live except resolution*/width/height which reconstruct): `blendFunction, samples, rings,
  distanceThreshold, distanceFalloff, rangeThreshold, rangeFalloff, luminanceInfluence, radius, bias, intensity,
  color, worldDistanceThreshold, worldDistanceFalloff, worldProximityThreshold, worldProximityFalloff,
  minRadiusScale, fade, depthAwareUpsampling, resolutionScale, resolutionX, resolutionY, width, height, ref`.
- Since 3.1.0 SSAO props update live and it falls back to the composer's `resolutionScale` (GH).

---

## 4. Bloom

### 4a. `<Bloom>` (RP-src `effects/Bloom.tsx`, PP-dts `BloomEffectOptions`)

```ts
interface BloomEffectOptions {           // PP-dts line 5261
  blendFunction?: BlendFunction          // wrapper default BlendFunction.ADD (postprocessing default SCREEN)
  luminanceThreshold?: number            // default 1.0  (construction-only -> reconstructs on change)
  luminanceSmoothing?: number            // default 0.03 (construction-only)
  mipmapBlur?: boolean                   // default true (construction-only)
  intensity?: number                     // default 1.0  (LIVE setter)
  radius?: number                        // default 0.85, mipmap blur only (construction-only)
  levels?: number                        // default 8 MIP levels, mipmap blur only (construction-only)
  kernelSize?: KernelSize                // Deprecated, ignored when mipmapBlur (live)
  resolutionScale?: number               // Deprecated (0.5), ignored when mipmapBlur
  width?, height?, resolutionX?, resolutionY?  // Deprecated
}
type BloomProps = BloomEffectOptions & { opacity?: number; ref?: Ref<BloomEffect> }
```

- Built with `createEffectComponent`; `blendFunction`/`opacity` are pierced to `effect.blendMode`.
- With `frameBufferType = HalfFloatType` (composer default), colours above 1.0 survive, so
  `luminanceThreshold={1}` blooms ONLY materials whose emissive output exceeds 1 (e.g.
  `<meshStandardMaterial emissive="#7cf" emissiveIntensity={2} toneMapped={false} />`). This is the cheapest way
  to get "bloom on highlighted squares + check indicator" without selection bookkeeping.
- Subtle settings to start from: `mipmapBlur intensity={0.35} luminanceThreshold={1} luminanceSmoothing={0.2}
  radius={0.6} levels={5}`. Lower `levels` = cheaper.
- Non-blooming lights/HDRI: raise `luminanceThreshold` or set `toneMapped={false}` only on highlight materials.

### 4b. `<SelectiveBloom>` (RP-src `effects/SelectiveBloom.tsx`, RP-dts)

```ts
type SelectiveBloomProps = BloomEffectOptions & Partial<{
  lights: Object3D[] | RefObject<Object3D | null>[]     // REQUIRED in practice: console.warn('SelectiveBloom requires lights to work.')
  selection: Object3D | Object3D[] | RefObject<Object3D|null> | RefObject<Object3D|null>[]
  selectionLayer: number                                // wrapper default 10 (postprocessing class default is 11)
  inverted: boolean                                     // live
  ignoreBackground: boolean                             // live
  ref?: Ref<SelectiveBloomEffect>
}>
```

- Constructed with `blendFunction: BlendFunction.ADD` hard-coded plus the construction-only bloom options
  (`luminanceThreshold, luminanceSmoothing, mipmapBlur, radius, levels, resolution*`); changing those rebuilds
  the effect. Live keys: `width, height, kernelSize, intensity, inverted, ignoreBackground`.
- `lights`: each light gets `light.layers.enable(effect.selection.layer)`; removed on cleanup; refs that have
  not attached yet are skipped safely (RP-tests). Every light that should illuminate bloomed objects must be
  listed, otherwise selected objects render black in the bloom pass.
- Selection can come from the `selection` prop OR from the `<Selection>/<Select>` context - see section 6 for
  the precedence rule.

---

## 5. `<Outline>` (RP-src `effects/Outline.tsx`, PP-dts `OutlineEffect`)

```ts
type OutlineProps = {
  selection?: Object3D | Object3D[] | RefObject<Object3D|null> | RefObject<Object3D|null>[]  // default []
  selectionLayer?: number            // default 10
  blendFunction?: BlendFunction      // default SCREEN; use BlendFunction.ALPHA for dark outlines (PP-dts)
  edgeStrength?: number              // default 1.0 (live)
  pulseSpeed?: number                // default 0.0 = no pulse (live)
  visibleEdgeColor?: ColorRepresentation  // default 0xffffff; strings like "#ffd166" OK (RP-tests #187) (live)
  hiddenEdgeColor?: ColorRepresentation   // default 0x22090a (live)
  kernelSize?: KernelSize            // default KernelSize.VERY_SMALL (live)
  blur?: boolean                     // default false (live)
  xRay?: boolean                     // default true: occluded parts drawn with hiddenEdgeColor (live)
  multisampling?: number             // default 0; setter disposes RT, only applied when changed (live)
  patternTexture?: Texture; patternScale?: number
  resolutionScale?: number           // default 0.5 (construction-only -> reconstructs)
  resolutionX?: number; resolutionY?: number   // construction-only
  width?: number; height?: number    // deprecated, live
  ref?: Ref<OutlineEffect>
}
```

- Constructed as `new OutlineEffect(scene, camera, { resolutionScale, resolutionX, resolutionY })` from the
  composer context; everything else applied live through `useLiveDefaults`. Removing a prop resets it to the
  constructor default (RP-tests "resets edgeStrength...").
- Emits `console.warn('Outline requires <EffectComposer autoClear={false}> to render correctly.')` unless the
  composer has `autoClear={false}`. Set it.
- C7 docs example uses `<EffectComposer depthBuffer>` (depthBuffer is already true by default in postprocessing).
- Chess-friendly values: `edgeStrength={4} visibleEdgeColor="#ffd166" hiddenEdgeColor="#ffd166" xRay={false}
  blur kernelSize={KernelSize.SMALL} pulseSpeed={0}`; `resolutionScale={0.5}` (default) is fine for a thick
  glow-style outline, use `1` for a crisp line on High.
- Selection precedence: see section 6.

---

## 6. `<Selection>` / `<Select>` and the selection precedence rule (RP-src `Selection.tsx`, `util.tsx` `useSelectionSync`)

```tsx
<Selection enabled>                       // context: { selected: Object3D[], select, enabled }
  <Select enabled={isSelected} {...groupProps}>   // a <group>; when enabled, traverses and claims every Mesh/Line/Points
    <Piece />
  </Select>
  <EffectComposer autoClear={false}>
    <Outline />                            // reads the context automatically
  </EffectComposer>
</Selection>
```

- `Select` default `enabled={false}`. It claims descendants with `isMesh || isLine || isPoints` (covers
  SkinnedMesh, RP-tests). Toggling `enabled` or unmounting removes only the objects it claimed.
- `useSelectionSync(effect, selection, selectionLayer)` (used by Outline and SelectiveBloom):
  1. `effect.selection.layer = selectionLayer` whenever it changes.
  2. If a `<Selection>` context exists anywhere above the effect, the manual `selection` prop is IGNORED
     (`if (api) return`), and `effect.selection.set(api.selected)` is used when `api.enabled && selected.length`.
  3. Without a context, the `selection` prop (objects or refs, nulls filtered) is applied; cleared on change.
- Consequence for chess: Outline (selected piece) and SelectiveBloom (highlight squares) want DIFFERENT object
  sets. Under one `<Selection>` both effects would receive the same `api.selected`. Options:
  - Preferred: do not use `<Selection>` at all. Keep `selectedPieceObject: Object3D | null` and
    `highlightMeshes: Object3D[]` in state/refs and pass `selection={...}` to each effect with distinct layers
    (`<Outline selectionLayer={10}>`, `<SelectiveBloom selectionLayer={11}>`). Pass stable arrays (memoised) -
    the sync effect depends on the array identity.
  - Or use plain `<Bloom>` (threshold-based, no selection) for highlights and `<Selection>/<Select>` for the outline.
- Layers: `postprocessing.Selection` enables the layer on selected objects (`exclusive` false by default, so
  objects stay on layer 0 and remain raycastable/visible). Layers 10/11 must not collide with your own layer use.

---

## 7. `<ToneMapping>` (RP-src `effects/ToneMapping.tsx`, PP-dts `ToneMappingEffect`, `ToneMappingMode`)

```ts
enum ToneMappingMode { LINEAR, REINHARD, REINHARD2, REINHARD2_ADAPTIVE, UNCHARTED2, OPTIMIZED_CINEON, CINEON, ACES_FILMIC, AGX, NEUTRAL }

type ToneMappingProps = {
  blendFunction?: BlendFunction   // default NORMAL
  mode?: ToneMappingMode          // default ACES_FILMIC (live setter)
  adaptive?: boolean              // Deprecated -> use mode REINHARD2_ADAPTIVE
  resolution?: number             // luminance texture size for adaptive mode, power of two, default 256 (live)
  whitePoint?: number             // default 4.0, Reinhard2 only
  middleGrey?: number             // default 0.6, Reinhard2 only
  minLuminance?: number           // default 0.01, construction-only (routed through args)
  maxLuminance?: number           // Deprecated = whitePoint, construction-only
  averageLuminance?: number       // Reinhard2 (non-adaptive)
  adaptationRate?: number         // adaptive only
  opacity?: number; ref?: Ref<ToneMappingEffect>
}
```

- `REINHARD2_ADAPTIVE` needs `EXT_shader_texture_lod` (PP-dts comment). Not needed for chess; use ACES_FILMIC
  (or try AGX / NEUTRAL, both present in 6.39.4).
- Renderer tone mapping: you do NOT disable anything yourself. `<EffectComposer>` sets
  `gl.toneMapping = NoToneMapping` while mounted (three cannot tone-map into render targets) and restores it on
  unmount. Therefore: post ON -> `<ToneMapping mode={ACES_FILMIC}>` as the LAST effect; post OFF (composer
  unmounted) -> r3f's default `ACESFilmicToneMapping` on the renderer applies again, so the look stays similar.
- Order: ToneMapping must be last so every other effect works on linear HDR data. Effects after it would operate
  on display-referred colour.
- Materials with `toneMapped={false}` are only exempt from the RENDERER's tone mapping; the ToneMapping EFFECT
  processes the whole frame including them. Emissive highlights will therefore be tone-mapped when post is on
  (desired: ACES rolls off the >1 values instead of clipping).

---

## 8. Other effects (verified constructor options, PP-dts; wrappers via `createEffectComponent`)

| Component | Props (defaults) | Notes |
|---|---|---|
| `<SMAA>` | `preset` (SMAAPreset.MEDIUM; LOW/MEDIUM/HIGH/ULTRA), `edgeDetectionMode` (EdgeDetectionMode.COLOR; DEPTH/LUMA/COLOR), `predicationMode` (PredicationMode.DISABLED; DEPTH/CUSTOM) | All three construction-only (routed via args -> rebuilds). SMAA is CONVOLUTION-flagged: it will not merge with another convolution effect in `'auto'` mode. Use when `multisampling={0}`. |
| `<FXAA>` | `blendFunction` (SRC) | Cheapest AA. |
| `<Vignette>` | `technique` (VignetteTechnique.DEFAULT / ESKIL), `eskil` (deprecated), `offset` (0.5), `darkness` (0.5), `blendFunction` (NORMAL) | Live via r3f reconciler. |
| `<Noise>` | `premultiply` (false), `blendFunction` (wrapper default COLOR_DODGE; class default SCREEN), `opacity` | Use `opacity={0.02}`-ish. |
| `<BrightnessContrast>` | `brightness` (0, -1..1), `contrast` (0, -1..1), `blendFunction` (NORMAL) | |
| `<HueSaturation>` | `hue` (0, radians), `saturation` (0, -1..1), `blendFunction` (NORMAL) | |

`BlendFunction` enum (PP-dts line 3918): `SKIP, SET, ADD, ALPHA, AVERAGE, COLOR, COLOR_BURN, COLOR_DODGE, DARKEN,
DIFFERENCE, DIVIDE, DST, EXCLUSION, HARD_LIGHT, HARD_MIX, HUE, INVERT, INVERT_RGB, LIGHTEN, LINEAR_BURN,
LINEAR_DODGE, LINEAR_LIGHT, LUMINOSITY, MULTIPLY, NEGATION, NORMAL, OVERLAY, PIN_LIGHT, REFLECT, SATURATION,
SCREEN, SOFT_LIGHT, SRC, SUBTRACT, VIVID_LIGHT`. `BlendFunction.SKIP` (= 0) hides an effect entirely - the wrapper
deliberately routes `blendFunction` through `useLiveDefaults` so that removing the prop never resets to 0.

`KernelSize` enum: `VERY_SMALL, SMALL, MEDIUM, LARGE, VERY_LARGE, HUGE`.

---

## 9. Ordering and performance rules

Order inside `<EffectComposer>` (top = applied first):

1. `<N8AO>` (bare pass; needs the RenderPass output/depth; auto gamma handled)
2. `<Outline>` (reads scene depth for occlusion; before bloom so the outline glows too if desired - or after
   bloom if you want a crisp non-bloomed line)
3. `<Bloom>` / `<SelectiveBloom>`
4. `<SMAA>` (if `multisampling={0}`)
5. `<Vignette>`, `<Noise>` (optional polish)
6. `<ToneMapping mode={ToneMappingMode.ACES_FILMIC}>` LAST

Performance notes (source-verified unless marked):

- `multisampling` default 8 on a HalfFloat target is the biggest fixed cost. Use 0 on Medium and rely on
  `<SMAA>`/`<FXAA>` or none; n8ao README says MSAA does not work with AO anyway.
- `resolutionScale` on the composer does nothing for render scale. Use `<Canvas dpr={[1, 2]}>` (FR-32 cap at 2)
  and lower `dpr` on Low. `Outline resolutionScale` (default 0.5) and N8AO `halfRes` are the real half-res knobs.
- Bloom cost scales with `levels` (mip chain depth); 4-5 levels are plenty for a subtle glow.
- N8AO: `quality="performance"` + `halfRes` for laptops/iGPUs; `"medium"` full-res for M1 (README tiers).
  Changing quality recompiles shaders - do it only on tier change.
- Every wrapper calls `invalidate()` after live updates, so `frameloop="demand"` works (RP-tests).
- Toggling: `enabled={false}` on `<EffectComposer>` skips `composer.render` and lets r3f render directly, but
  leaves `gl.toneMapping = NoToneMapping` (flat look) and keeps all GPU buffers allocated. Unmount for the Low
  tier; use `<EffectGroup enabled>` / `<N8AO enabled>` for per-feature toggles inside a mounted composer.
- Avoid changing composer-construction props (`multisampling`, `depthBuffer`, `stencilBuffer`, `frameBufferType`,
  `enableNormalPass`, `resolutionScale`, `renderPass` identity) at runtime except on a tier switch - each change
  rebuilds the composer and all passes.
- `N8AOPostPass` leaks on unmount (no dispose); a tier switch that unmounts/remounts it a handful of times is
  acceptable, per-frame or per-move toggling is not.

---

## 10. Verified full example (High tier) + tier variants

```tsx
'use client'
import { useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import {
  EffectComposer, EffectGroup, N8AO, Outline, Bloom, SelectiveBloom, SMAA, Vignette, ToneMapping,
} from '@react-three/postprocessing'
import { BlendFunction, KernelSize, SMAAPreset, ToneMappingMode } from 'postprocessing'
import type { Object3D, DirectionalLight, AmbientLight } from 'three'

export type QualityTier = 'low' | 'medium' | 'high'

type PostFXProps = {
  tier: QualityTier
  selectedPiece: Object3D | null      // the mesh/group of the currently selected piece
  highlightMeshes: Object3D[]         // legal-square overlays + check indicator (memoised array!)
  lights: React.RefObject<DirectionalLight | AmbientLight | null>[]   // only needed for SelectiveBloom
}

// Render this INSIDE <Canvas>. Returns null on 'low' so the composer unmounts
// (restores gl.toneMapping to r3f's ACESFilmicToneMapping default).
export function PostFX({ tier, selectedPiece, highlightMeshes, lights }: PostFXProps) {
  if (tier === 'low') return null

  const high = tier === 'high'
  // Stable arrays: useSelectionSync re-runs when the array identity changes.
  const outlineSelection = useMemo(() => (selectedPiece ? [selectedPiece] : []), [selectedPiece])

  return (
    <EffectComposer
      autoClear={false}          // required by <Outline>
      multisampling={0}          // MSAA + AO do not mix (n8ao README); SMAA below instead
      // depthBuffer defaults true; frameBufferType defaults HalfFloatType
    >
      {/* 1. AO first - it needs the RenderPass output; it is a bare Pass, so it splits the chain */}
      <N8AO
        aoRadius={0.5}           // board is ~8 world units wide -> 1-2 magnitudes smaller
        distanceFalloff={1}
        intensity={high ? 2.5 : 2}
        quality={high ? 'medium' : 'performance'}
        halfRes={!high}
        depthAwareUpsampling
      />

      {/* 2. Selected piece outline (manual selection, layer 10) */}
      <Outline
        selection={outlineSelection}
        selectionLayer={10}
        edgeStrength={high ? 4 : 3}
        visibleEdgeColor="#ffd166"
        hiddenEdgeColor="#ffd166"
        xRay={false}
        blur={high}
        kernelSize={KernelSize.SMALL}
        pulseSpeed={0}
        resolutionScale={high ? 1 : 0.5}   // construction-only; tier changes rebuild it, fine
      />

      {/* 3. Bloom. Option A (simplest): threshold bloom; only emissiveIntensity>1 materials glow */}
      <EffectGroup enabled>
        <Bloom
          mipmapBlur
          intensity={high ? 0.4 : 0.3}
          luminanceThreshold={1}
          luminanceSmoothing={0.2}
          radius={0.6}
          levels={high ? 6 : 4}
        />
      </EffectGroup>

      {/* Option B (only if A blooms things it should not): selective, layer 11, lights REQUIRED
      <SelectiveBloom
        selection={highlightMeshes}
        selectionLayer={11}
        lights={lights}
        mipmapBlur
        intensity={0.4}
        luminanceThreshold={0.2}
        luminanceSmoothing={0.1}
        radius={0.6}
        levels={4}
      /> */}

      {/* 4. AA (only because multisampling is 0) */}
      {high ? <SMAA preset={SMAAPreset.HIGH} /> : <SMAA preset={SMAAPreset.LOW} />}

      {/* 5. Polish */}
      {high && <Vignette offset={0.35} darkness={0.5} blendFunction={BlendFunction.NORMAL} />}

      {/* 6. Tone mapping LAST */}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
```

Highlight material that triggers Option A bloom (values > 1 survive because the composer's frame buffer is
HalfFloat):

```tsx
<mesh userData={{ treatAsOpaque: true }}>
  <planeGeometry args={[0.9, 0.9]} />
  <meshStandardMaterial
    color="#000"
    emissive="#66d9ff"
    emissiveIntensity={pulse /* animate 1.2..2.0 in useFrame for FR-30 pulse */}
    transparent opacity={0.85}
    toneMapped={false}
  />
</mesh>
```

Tier matrix (matches FR-31: Low = no post, Medium = no post per spec but this doc gives a "cheap post" option
if the watchdog allows it, High = everything):

| Tier | Composer | N8AO | Outline | Bloom | AA | ToneMapping |
|---|---|---|---|---|---|---|
| low | unmounted (`return null`); Canvas `dpr` lowered; r3f renderer ACES applies | - | none (fall back to emissive tint / lift only) | none | none (or `<Canvas gl={{ antialias: true }}>` MSAA on the default framebuffer) | renderer default (ACESFilmic) |
| medium (spec: no post) | unmounted, or mounted with `multisampling={0}` if the frame-time watchdog is happy | `quality="performance" halfRes` or disabled | `resolutionScale={0.5}` no blur | `levels={4}` intensity 0.3 | `<SMAA preset={LOW}>` or `<FXAA>` | ACES_FILMIC |
| high | mounted, `multisampling={0}` + SMAA HIGH (or `multisampling={4}` and no SMAA if AO artifacts are acceptable after testing) | `quality="medium"` full-res | `resolutionScale={1}` blur | `levels={6}` intensity 0.4 | SMAA HIGH | ACES_FILMIC |

Frame-time watchdog (FR-31): drop `tier` state; because `multisampling`, N8AO `quality`, Outline
`resolutionScale` and the composer mount all change on a tier switch, expect a one-frame hitch (shader recompiles
+ composer rebuild). Do the switch once, never oscillate.

---

## 11. Gotchas checklist

- [ ] `autoClear={false}` on the composer whenever `<Outline>` is used (console warning otherwise).
- [ ] Never pass `enabled={false}` to a composer you leave mounted if you care about tone mapping; unmount instead.
- [ ] `<Selection>` anywhere above the composer makes every `selection=` prop inside it a no-op.
- [ ] Outline and SelectiveBloom both default to `selectionLayer={10}`; give them different layers when both are used.
- [ ] `SelectiveBloom` without `lights` -> warning and black selection.
- [ ] `Bloom` `luminanceThreshold/luminanceSmoothing/mipmapBlur/radius/levels` are construction-only: changing them
      reconstructs the effect (allocations). Animate `intensity`/`opacity` instead.
- [ ] Composer `resolutionScale` is not render scale; use `<Canvas dpr>`.
- [ ] `import ... from 'n8ao'` in app code will not resolve under pnpm unless you `pnpm add n8ao`.
- [ ] N8AO cannot be disposed; prefer `enabled` toggles.
- [ ] Changing N8AO `quality/aoSamples/denoiseSamples/halfRes` recompiles shaders.
- [ ] `three` must stay `< 0.186.0` until postprocessing bumps its peer range.

---

## Unverified / open questions

1. Whether composer `multisampling > 0` actually produces artifacts with `N8AOPostPass` when used through
   `@react-three/postprocessing`. The claim comes from the n8ao README ("hardware antialiasing does NOT work with
   ambient occlusion"); I did not run a visual test. Try `multisampling={4}` + no SMAA on High and compare.
2. Exact perf numbers per tier on a 2020 MacBook Air / M1 (NFR-2) - not measured.
3. The GitHub releases page fetch returned dates that look inconsistent (3.1.0 dated before 3.0.0); treat the
   feature bullets (EffectGroup, mergeMode, createEffectComponent public, SSAO live props, N8AO `enabled`,
   Outline/GodRays autoClear warnings, Pixelation/ShockWave blendFunction removal) as confirmed by source, the
   dates as unreliable.
4. ~~Whether Next.js 16 / Turbopack needs `transpilePackages` for `postprocessing` or `n8ao`~~ **RESOLVED: no.**
   Verified empirically in this repo - both pure-ESM packages resolve in the browser bundle *and* during the Node
   prerender of a `"use client"` page with zero config, and an `EffectComposer` + `N8AO` + `Bloom` + `ToneMapping`
   stack compiles 18 shader programs and renders a correct frame. See `docs/research/nextjs16-shadcn.md` →
   "Verified build smoke test (three + postprocessing + worker + wasm)", §3 and §8.
5. The React Compiler (`babel-plugin-react-compiler` is in devDependencies): the wrappers mutate effect objects in
   layout effects and rely on array identity for `selection`; no known incompatibility, but untested here.
6. Whether `OutlineEffect` needs the composer's depth buffer for `xRay={false}` occlusion in this exact setup
   (docs example uses `depthBuffer`, which is already the default `true`) - not exercised.
7. `ToneMappingMode.AGX` / `NEUTRAL` visual comparison vs ACES for this scene - subjective, untested.
