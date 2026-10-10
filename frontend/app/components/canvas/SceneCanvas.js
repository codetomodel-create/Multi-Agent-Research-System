"use client";

import { Suspense, lazy, useCallback, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";

import { usePrefersReducedMotion, useHasWebGL, useIsSmallScreen } from "../../lib/hooks";
import { useSceneTokens } from "../../lib/theme";

const Observatory = lazy(() => import("./Observatory"));
const Effects = lazy(() => import("./Effects"));

const DPR = { low: [1, 1], medium: [1, 1.5], high: [1, 2] };

/**
 * The single WebGL surface for the whole app.
 *
 * 3D is progressive enhancement: without WebGL, on a small/low-power device, or
 * with the canvas preference off, this renders the token gradient alone and no
 * animation loop ever starts.
 */
export default function SceneCanvas({
  activeStage = -1,
  status = "idle",
  quality = "medium",
  enabled = true,
  tourStep = -1,
  onPick,
  onStats,
}) {
  const reducedMotion = usePrefersReducedMotion();
  const hasWebGL = useHasWebGL();
  const isSmall = useIsSmallScreen();
  const tokens = useSceneTokens();
  const frames = useRef({ count: 0, last: 0 });

  const show = enabled && hasWebGL && !isSmall;
  const animate = show && !reducedMotion;

  const handleFrame = useCallback(
    (state) => {
      if (!onStats) return;
      const f = frames.current;
      f.count += 1;
      const now = state.clock.elapsedTime;
      if (now - f.last >= 1) {
        onStats({
          fps: Math.round(f.count / (now - f.last)),
          calls: state.gl.info.render.calls,
          triangles: state.gl.info.render.triangles,
          geometries: state.gl.info.memory.geometries,
          textures: state.gl.info.memory.textures,
        });
        f.count = 0;
        f.last = now;
      }
    },
    [onStats],
  );

  if (!show) {
    return <div className="scene-layer" aria-hidden="true" data-scene="static" />;
  }

  return (
    <div className="scene-layer" aria-hidden="true" data-scene="webgl">
      <Canvas
        dpr={DPR[quality] ?? DPR.medium}
        frameloop={animate ? "always" : "demand"}
        camera={{ position: [0, 0.5, 13], fov: 46, near: 0.1, far: 90 }}
        gl={{ antialias: quality !== "low", powerPreference: "high-performance", alpha: false }}
        performance={{ min: 0.4 }}
      >
        <Suspense fallback={null}>
          <Observatory
            activeStage={activeStage}
            status={status}
            tokens={tokens}
            animate={animate}
            quality={quality}
            tourStep={tourStep}
            onPick={onPick}
          />
          {quality !== "low" && animate ? <Effects /> : null}
          {onStats ? <FrameTicker onFrame={handleFrame} /> : null}
        </Suspense>
      </Canvas>
    </div>
  );
}

/** Samples renderer counters once a second for the dev perf HUD. */
function FrameTicker({ onFrame }) {
  useFrame(onFrame);
  return null;
}
