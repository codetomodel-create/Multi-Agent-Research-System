"use client";

import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";

/**
 * Perf budget: two effects, no depth-of-field, no SSAO. Bloom is what makes the
 * orbs read as light sources; the vignette pushes focus toward the centre so
 * the panels above the canvas stay legible.
 *
 * Lazy-loaded and only mounted at medium/high quality with motion enabled.
 */
export default function Effects() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom intensity={0.65} luminanceThreshold={0.35} luminanceSmoothing={0.5} mipmapBlur />
      <Vignette offset={0.28} darkness={0.5} eskil={false} />
    </EffectComposer>
  );
}
