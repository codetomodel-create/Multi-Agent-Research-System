"use client";

import { useEffect, useRef } from "react";

const LEVELS = ["low", "medium", "high"];

/**
 * Dev-only renderer readout with a manual quality switch.
 *
 * Auto-degrade: three consecutive one-second samples under 40fps step the
 * quality down one level. It never steps back up on its own — a scene that has
 * already stuttered should not oscillate.
 */
export default function PerfHUD({ stats, quality, onQuality }) {
  const lowSamples = useRef(0);

  useEffect(() => {
    if (!stats?.fps) return;
    if (stats.fps < 40) {
      lowSamples.current += 1;
      if (lowSamples.current >= 3) {
        lowSamples.current = 0;
        const index = LEVELS.indexOf(quality);
        if (index > 0) onQuality(LEVELS[index - 1]);
      }
    } else {
      lowSamples.current = 0;
    }
  }, [stats, quality, onQuality]);

  const heapMb =
    typeof performance !== "undefined" && performance.memory
      ? Math.round(performance.memory.usedJSHeapSize / 1048576)
      : null;

  return (
    <div className="perf-hud" role="status" aria-label="Renderer statistics">
      <dl>
        <dt>fps</dt>
        <dd>{stats?.fps ?? "—"}</dd>
        <dt>draw calls</dt>
        <dd>{stats?.calls ?? "—"}</dd>
        <dt>triangles</dt>
        <dd>{stats?.triangles?.toLocaleString() ?? "—"}</dd>
        <dt>geometries</dt>
        <dd>{stats?.geometries ?? "—"}</dd>
        {heapMb !== null ? (
          <>
            <dt>heap</dt>
            <dd>{heapMb} MB</dd>
          </>
        ) : null}
      </dl>
      <div className="segmented" role="group" aria-label="Render quality">
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            aria-pressed={quality === level}
            onClick={() => onQuality(level)}
          >
            {level[0].toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
