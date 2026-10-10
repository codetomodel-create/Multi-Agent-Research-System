"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, GitCompare } from "lucide-react";

import { api } from "../lib/api";
import { formatCost, formatDateTime, formatDuration, formatTokens } from "../lib/format";

/** Side-by-side diff of two finished runs, section by section. */
export default function CompareView({ runs, a, b, onPick }) {
  // `key` identifies the pair the stored result belongs to, so "loading" is
  // derived from a stale result rather than written in an effect.
  const [result, setResult] = useState({ key: null, data: null, error: "" });

  const finished = runs.filter((r) => r.status === "success");
  const key = a && b && a !== b ? `${a}|${b}` : null;
  const fresh = result.key === key;
  const status = !key ? "idle" : !fresh ? "loading" : result.error ? "error" : "ready";

  useEffect(() => {
    if (!key) return undefined;
    const controller = new AbortController();
    api
      .compare(a, b, controller.signal)
      .then((data) => setResult({ key, data, error: "" }))
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setResult({ key, data: null, error: err.message });
      });
    return () => controller.abort();
  }, [key, a, b]);

  return (
    <div className="view">
      <section className="panel pad">
        <div className="grid-2">
          <div className="field">
            <label htmlFor="cmp-a">Run A</label>
            <select
              id="cmp-a"
              className="input"
              value={a ?? ""}
              onChange={(e) => onPick("a", e.target.value)}
            >
              <option value="">Select a completed run…</option>
              {finished.map((r) => (
                <option key={r.task_id} value={r.task_id}>
                  {r.topic} — {formatDateTime(r.created_at)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cmp-b">Run B</label>
            <select
              id="cmp-b"
              className="input"
              value={b ?? ""}
              onChange={(e) => onPick("b", e.target.value)}
            >
              <option value="">Select a completed run…</option>
              {finished.map((r) => (
                <option key={r.task_id} value={r.task_id}>
                  {r.topic} — {formatDateTime(r.created_at)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {finished.length < 2 ? (
        <section className="panel">
          <div className="empty-state">
            <GitCompare size={40} aria-hidden="true" />
            <h3>Two completed runs are needed</h3>
            <p>Comparison unlocks once at least two runs have finished successfully.</p>
          </div>
        </section>
      ) : null}

      {status === "loading" ? (
        <section className="panel pad" aria-busy="true">
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
        </section>
      ) : null}

      {status === "error" ? (
        <section className="panel pad">
          <div className="alert error" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <div className="alert-body">
              <strong>Comparison failed.</strong> {result.error}
            </div>
          </div>
        </section>
      ) : null}

      {status === "ready" && result.data ? (
        <>
          <section className="panel pad">
            <div className="diff-grid">
              {["a", "b"].map((side) => {
                const run = result.data[side];
                return (
                  <div key={side} className="diff-cell">
                    <h3>{run.topic}</h3>
                    <div className="run-meta">
                      <span>{formatDateTime(run.created_at)}</span>
                      <span>{formatDuration(run.duration_ms)}</span>
                      <span>{formatTokens(run.tokens)} tokens</span>
                      <span>{formatCost(run.cost_usd)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {result.data.sections.map((section) => (
            <section className="panel pad" key={section.section}>
              <div className="row" style={{ marginBottom: "var(--sp-3)" }}>
                <h3>{section.label}</h3>
                <span className={`badge ${section.identical ? "success" : "cancelled"}`}>
                  {section.identical ? "identical" : "differs"}
                </span>
              </div>
              <div className="diff-grid">
                <div className={`diff-cell ${section.identical ? "" : "changed"}`}>
                  <p>{section.a || "—"}</p>
                </div>
                <div className={`diff-cell ${section.identical ? "" : "changed"}`}>
                  <p>{section.b || "—"}</p>
                </div>
              </div>
            </section>
          ))}
        </>
      ) : null}
    </div>
  );
}
