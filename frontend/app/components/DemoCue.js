"use client";

import { useEffect, useState } from "react";
import { Clapperboard, X } from "lucide-react";

import { DEMO_CUES } from "../lib/demo";

/**
 * Presenter teleprompter for ``?demo=1``. Hidden from the accessibility tree
 * of the main product so it cannot steal the keyboard journey.
 */
export default function DemoCue({ view }) {
  const lines = DEMO_CUES[view] ?? DEMO_CUES.dashboard;
  const [hidden, setHidden] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [view]);

  if (hidden) {
    return (
      <button
        type="button"
        className="demo-cue-show btn btn-ghost btn-sm"
        onClick={() => setHidden(false)}
      >
        <Clapperboard size={14} aria-hidden="true" />
        Show demo cues
      </button>
    );
  }

  const line = lines[Math.min(index, lines.length - 1)];

  return (
    <aside className="demo-cue panel pad" aria-label="LinkedIn demo speaking cue">
      <div className="row" style={{ marginBottom: "var(--sp-2)" }}>
        <strong className="demo-cue-kicker">LinkedIn demo · say this</strong>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setHidden(true)}
          aria-label="Hide demo cues"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <p className="demo-cue-line">{line}</p>
      <div className="row" style={{ marginTop: "var(--sp-3)" }}>
        <span className="hint">
          Line {Math.min(index, lines.length - 1) + 1} of {lines.length}
        </span>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={index >= lines.length - 1}
          onClick={() => setIndex((n) => Math.min(n + 1, lines.length - 1))}
        >
          Next line
        </button>
      </div>
    </aside>
  );
}
