"use client";

import {
  Activity, AlertTriangle, CheckCircle2, Eye, History, Play, RotateCw, Terminal, Trash2, XCircle,
} from "lucide-react";

import { formatCost, formatDateTime, formatDuration, formatTokens } from "../lib/format";

const STATUS_ICON = {
  success: CheckCircle2,
  running: Activity,
  failed: AlertTriangle,
  cancelled: XCircle,
};

export default function RunHistory({
  runs,
  loading,
  error,
  selectedId,
  onOpen,
  onRetry,
  onDelete,
  onNew,
  onReload,
}) {
  return (
    <section className="panel" aria-label="Research history">
      <div className="section-head">
        <History size={18} aria-hidden="true" />
        <h2>Research history</h2>
        <span className="spacer" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReload}>
          <RotateCw size={14} aria-hidden="true" />
          <span className="label">Refresh</span>
        </button>
      </div>

      {loading && runs.length === 0 ? (
        <div className="pad" aria-busy="true">
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
        </div>
      ) : null}

      {error && runs.length === 0 ? (
        <div className="pad">
          <div className="alert error" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <div className="alert-body">
              <strong>History unavailable.</strong> {error}
            </div>
          </div>
          <button type="button" className="btn btn-ghost" style={{ marginTop: "var(--sp-4)" }} onClick={onReload}>
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !error && runs.length === 0 ? (
        <div className="empty-state">
          <Terminal size={40} aria-hidden="true" />
          <h3>No runs yet</h3>
          <p>Launch a research task and the pipeline will appear here with full stage timings.</p>
          <button type="button" className="btn btn-primary" onClick={onNew}>
            <Play size={16} aria-hidden="true" /> Start the first run
          </button>
        </div>
      ) : null}

      {runs.length > 0 ? (
        <ul className="run-list" style={{ listStyle: "none", padding: 0 }}>
          {runs.map((run) => {
            const Icon = STATUS_ICON[run.status] ?? Terminal;
            return (
              <li key={run.task_id} className={`run-row ${run.task_id === selectedId ? "selected" : ""}`}>
                <div style={{ minWidth: 0 }}>
                  <div className="run-title">{run.topic || "Untitled run"}</div>
                  <div className="run-meta">
                    <span>{formatDateTime(run.created_at)}</span>
                    <span>{formatDuration(run.duration_ms)}</span>
                    <span>{formatTokens(run.tokens)} tokens</span>
                    <span>{formatCost(run.cost_usd)}</span>
                    <span className="tag">L {run.light_model}</span>
                    <span className="tag">H {run.heavy_model}</span>
                  </div>
                </div>

                <div className="run-actions">
                  <span className={`badge ${run.status}`}>
                    <Icon size={11} className={run.status === "running" ? "spin" : ""} aria-hidden="true" />
                    {run.status}
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpen(run)}>
                    <Eye size={14} aria-hidden="true" />
                    <span className="label">{run.status === "success" ? "Report" : "Logs"}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onRetry(run)}
                    title={`Re-run: ${run.topic}`}
                  >
                    <RotateCw size={14} aria-hidden="true" />
                    <span className="label">Re-run</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => onDelete(run)}
                    aria-label={`Delete run: ${run.topic}`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
