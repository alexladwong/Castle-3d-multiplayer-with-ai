// src/components/board3d/post-fx.tsx
// FR-29/FR-30/FR-31. Order is fixed by postprocessing.md §9:
//   N8AO -> Outline -> Bloom -> SMAA -> Vignette -> ToneMapping (last).
//
// Two rules that are easy to get wrong and both are load-bearing:
//  1. Tiers without post UNMOUNT this component. `<EffectComposer enabled={false}>`
//     leaves `gl.toneMapping = NoToneMapping` and the scene renders flat (§I-10).
//  2. `<Outline>` needs `autoClear={false}` or it warns and renders incorrectly.
//
// Bloom is threshold-based rather than selective: highlight materials are
// `toneMapped={false}` with `emissiveIntensity > 1`, and the composer's HalfFloat buffer
// keeps those values, so only the highlights glow. No <Selection> provider is mounted
// anywhere — it would silently override the manual `selection` prop.
"use client";
import { useMemo } from "react";
import {
  Bloom,
  EffectComposer,
  N8AO,
  Outline,
  SMAA,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction, KernelSize, SMAAPreset, ToneMappingMode } from "postprocessing";
import type { Object3D } from "three";
import type { QualityConfig } from "@/lib/camera";

const EMPTY_SELECTION: Object3D[] = [];

export interface PostFxProps {
  quality: QualityConfig;
  /** The selected piece mesh, registered by <PieceMesh> through a ref callback. */
  selected: Object3D | null;
  outlineColor: string;
}

export function PostFx({ quality, selected, outlineColor }: PostFxProps) {
  const post = quality.post;
  // `useSelectionSync` re-runs on array identity, so keep it stable.
  const selection = useMemo(() => (selected ? [selected] : EMPTY_SELECTION), [selected]);

  if (!post.composer) return null;

  return (
    <EffectComposer autoClear={false} multisampling={post.multisampling}>
      <N8AO
        enabled={post.n8ao.enabled}
        aoRadius={0.5}
        distanceFalloff={1}
        intensity={2.5}
        quality={post.n8ao.quality}
        halfRes={post.n8ao.halfRes}
        depthAwareUpsampling
      />
      {post.outline.enabled && (
        <Outline
          selection={selection}
          selectionLayer={10}
          edgeStrength={4}
          visibleEdgeColor={outlineColor}
          hiddenEdgeColor={outlineColor}
          xRay={false}
          blur={post.outline.blur}
          kernelSize={KernelSize.SMALL}
          pulseSpeed={0}
          resolutionScale={post.outline.resolutionScale}
        />
      )}
      {post.bloom.enabled && (
        <Bloom
          mipmapBlur
          intensity={post.bloom.intensity}
          luminanceThreshold={1}
          luminanceSmoothing={0.2}
          radius={0.6}
          levels={post.bloom.levels}
        />
      )}
      {post.smaa !== false && (
        <SMAA preset={post.smaa === "high" ? SMAAPreset.HIGH : SMAAPreset.LOW} />
      )}
      {post.vignette && (
        <Vignette offset={0.35} darkness={0.45} blendFunction={BlendFunction.NORMAL} />
      )}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
