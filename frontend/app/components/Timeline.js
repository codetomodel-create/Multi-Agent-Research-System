"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CircleDashed, Loader2, X } from "lucide-react";

import { formatCost, formatDuration, formatTime, formatTokens } from "../lib/format";

const STAGE_LABELS = {
  Queue: "Coordinate",
  Researching: "Research",
  Critique: "Synthesise",
  Polishing: "Audit",
};

function stageClass(status) {
  if (status === "completed" || status === "success") return "done";
  if (status === "running") return "active";
  if (status === "failed") return "failed";
  return "";
}

function StageIcon({ status }) {
  if (status === "completed" || status === "success") return <Check size={14} aria-hidden="true" />;
  if (status === "running") return <Loader2 size={14} className="spin" aria-hidden="true" />;
  if (status === "failed" || status === "cancelled") return <X size={14} aria-hidden="true" />;
  return <CircleDashed size={14} aria-hidden="true" />;
}

/**
 * Stage table plus a scrubber that replays the run. Dragging back rewinds the
 * log and the stage readouts to the state at that moment — the same data the
 * live view uses, just clipped to a point in time.
 */
export default function Timeline({ progress, onScrub }) {
  const logs = useMemo(() => progress?.logs ?? [], [progress]);
  // `null` means "follow the live tail"; a number pins the replay to that point.
  const [pinned, setPinned] = useState(null);
  const index = pinned === null ? logs.length : Math.min(pinned, logs.length);
  const live = pinned === null;

  useEffect(() => {
    onScrub?.(live ? null : logs.slice(0, index));
  }, [index, live, logs, onScrub]);

  const stages = progress?.stages ?? [];
  const totals = progress?.totals ?? { tokens: 0, cost_usd: 0, duration_ms: 0 };
  const at = logs[Math.max(0, index - 1)];

  return (
    <section className="panel" aria-label="Pipeline timeline">
      <div className="stage-track">
        {stages.length === 0
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} className="stage">
                <div className="skeleton skeleton-row" style={{ width: "70%" }} />
                <div className="skeleton skeleton-row" style={{ width: "45%" }} />
              </div>
            ))
          : stages.map((stage) => (
              <div key={stage.name} className={`stage ${stageClass(stage.status)}`}>
                <div className="stage-name">
                  <StageIcon status={stage.status} />
                  <span>{STAGE_LABELS[stage.name] ?? stage.name}</span>
                </div>
                <div className="stage-stats">
                  <span title="Stage duration">{formatDuration(stage.duration_ms)}</span>
                  <span title="Tokens used">{formatTokens(stage.tokens)} tok</span>
                  <span title="Estimated cost">{formatCost(stage.cost_usd)}</span>
                </div>
              </div>
            ))}
      </div>

      <div className="scrubber">
        <label className="sr-only" htmlFor="scrubber">
          Replay position
        </label>
        <input
          id="scrubber"
          type="range"
          min={0}
          max={Math.max(1, logs.length)}
          value={Math.max(1, index)}
          disabled={logs.length === 0}
          onChange={(e) => setPinned(Number(e.target.value))}
        />
        <span className="scrubber-readout">
          {logs.length === 0
            ? "no events"
            : `${index}/${logs.length} · ${formatTime(at?.timestamp)}`}
        </span>
        <button
          type="button"
          className={`btn btn-sm ${live ? "btn-ghost" : "btn-primary"}`}
          onClick={() => setPinned(null)}
          disabled={live}
        >
          {live ? "Live" : "Resume live"}
        </button>
      </div>

      <div className="scrubber" style={{ paddingTop: 0 }}>
        <span className="scrubber-readout">Total {formatDuration(totals.duration_ms)}</span>
        <span className="scrubber-readout">{formatTokens(totals.tokens)} tokens</span>
        <span className="scrubber-readout">{formatCost(totals.cost_usd)}</span>
      </div>
    </section>
  );
}
