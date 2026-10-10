"use client";

import { AGENTS } from "./canvas/Observatory";

const STEPS = [
  {
    title: "Welcome to the observatory",
    body: "Each luminous body in the scene is one agent in the research pipeline. Their glow and pulse follow the real run state.",
  },
  ...AGENTS.map((agent) => ({
    title: agent.label,
    body:
      agent.id === "coordinator"
        ? "Plans the run and delegates to the specialists."
        : agent.id === "writer"
          ? "Compiles the four drafts into one executive narrative."
          : agent.id === "checker"
            ? "Audits the draft, fixes gaps and emits the structured report."
            : `Researches the ${agent.label.toLowerCase()} dimension of your market in parallel with its peers.`,
  })),
];

/**
 * First-visit camera tour. Skippable at every step, remembered in LocalStorage
 * by the caller, and it never blocks interaction with the rest of the app.
 */
export default function Onboarding({ step, onStep, onDone }) {
  const current = STEPS[step];
  if (!current) return null;

  return (
    <div className="tour" role="dialog" aria-label="Guided tour">
      <h3>{current.title}</h3>
      <p className="hint" style={{ marginTop: "var(--sp-2)" }}>
        {current.body}
      </p>
      <div className="tour-actions">
        <div className="tour-dots" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s.title} className={i === step ? "on" : ""} />
          ))}
        </div>
        <span className="spacer" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
          Skip tour
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => (step + 1 >= STEPS.length ? onDone() : onStep(step + 1))}
        >
          {step + 1 >= STEPS.length ? "Finish" : "Next"}
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        Tour step {step + 1} of {STEPS.length}: {current.title}
      </p>
    </div>
  );
}

export const TOUR_LENGTH = STEPS.length;
