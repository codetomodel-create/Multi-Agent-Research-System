"use client";

import { useState } from "react";
import { AlertTriangle, Briefcase, Globe, Loader2, MapPin, Play } from "lucide-react";

/**
 * Optimistic submit: the moment a task is queued the caller swaps this form for
 * the live status card. There is never a blocking spinner over the whole page.
 */
export default function LaunchForm({ onLaunch, submitting, error, defaults }) {
  const [idea, setIdea] = useState(defaults?.idea ?? "");
  const [location, setLocation] = useState(defaults?.location ?? "");
  const [webSearch, setWebSearch] = useState(true);
  const [overrideKey, setOverrideKey] = useState("");
  const [useOverride, setUseOverride] = useState(false);
  const [touched, setTouched] = useState(false);

  const ideaError = touched && !idea.trim() ? "Describe the business idea to research." : "";

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!idea.trim()) return;
    onLaunch({
      idea: idea.trim(),
      location: location.trim(),
      enable_web_search: webSearch,
      overrideKey: useOverride ? overrideKey.trim() : "",
    });
  };

  return (
    <form className="panel pad view" onSubmit={submit} noValidate>
      <div>
        <h2>New market intelligence task</h2>
        <p className="hint" style={{ marginTop: "var(--sp-2)" }}>
          Seven agents will plan, research in parallel, synthesise and audit a C-suite report.
        </p>
      </div>

      {error ? (
        <div className="alert error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <div className="alert-body">
            <strong>Could not launch.</strong> {error}
          </div>
        </div>
      ) : null}

      <div className="grid-2">
        <div className="field">
          <label htmlFor="idea">
            <Briefcase size={14} aria-hidden="true" /> Business idea
          </label>
          <input
            id="idea"
            className="input"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="e.g. Specialty coffee shop"
            aria-invalid={Boolean(ideaError)}
            aria-describedby={ideaError ? "idea-error" : undefined}
            maxLength={2000}
          />
          {ideaError ? (
            <span className="hint error" id="idea-error" role="alert">
              {ideaError}
            </span>
          ) : (
            <span className="hint">Required. Up to 2000 characters.</span>
          )}
        </div>

        <div className="field">
          <label htmlFor="location">
            <MapPin size={14} aria-hidden="true" /> Target location
          </label>
          <input
            id="location"
            className="input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Brooklyn, NY"
            maxLength={2000}
          />
          <span className="hint">Optional. Narrows the market to a geography.</span>
        </div>
      </div>

      <label className="checkbox">
        <input type="checkbox" checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} />
        <Globe size={14} aria-hidden="true" />
        Enable web search (DuckDuckGo)
      </label>

      <div className="card" style={{ padding: "var(--sp-4)" }}>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={useOverride}
            onChange={(e) => setUseOverride(e.target.checked)}
          />
          Override the API key for this run only
        </label>
        {useOverride ? (
          <div className="field" style={{ marginTop: "var(--sp-3)" }}>
            <label htmlFor="override-key">One-off API key</label>
            <input
              id="override-key"
              className="input"
              type="password"
              autoComplete="off"
              value={overrideKey}
              onChange={(e) => setOverrideKey(e.target.value)}
              placeholder="Leave blank to keep the saved key"
            />
            <span className="hint">Never stored. Sent with this request only.</span>
          </div>
        ) : null}
      </div>

      <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
        {submitting ? (
          <Loader2 size={16} className="spin" aria-hidden="true" />
        ) : (
          <Play size={16} aria-hidden="true" />
        )}
        Launch agent pipeline
      </button>
    </form>
  );
}
