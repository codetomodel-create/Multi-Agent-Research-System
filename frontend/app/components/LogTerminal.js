"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, Copy, Search, Terminal } from "lucide-react";

import { formatTime } from "../lib/format";

const SEVERITIES = ["all", "running", "completed", "failed", "cancelled"];

/** Highlights the search term without dangerouslySetInnerHTML. */
function Highlighted({ text, term }) {
  if (!term) return text;
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return parts.map((part, i) =>
    part.toLowerCase() === term.toLowerCase() ? <mark key={i}>{part}</mark> : part,
  );
}

export default function LogTerminal({ logs = [], loading = false }) {
  const [filter, setFilter] = useState("all");
  const [term, setTerm] = useState("");
  const [pinned, setPinned] = useState(true);
  const [copied, setCopied] = useState(false);
  const consoleRef = useRef(null);
  const bottomRef = useRef(null);

  const visible = useMemo(
    () =>
      logs.filter(
        (l) =>
          (filter === "all" || l.status === filter) &&
          (!term || `${l.stage} ${l.message}`.toLowerCase().includes(term.toLowerCase())),
      ),
    [logs, filter, term],
  );

  useEffect(() => {
    if (pinned) bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [visible.length, pinned]);

  const onScroll = () => {
    const el = consoleRef.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  const copyAll = async () => {
    const text = visible
      .map((l) => `[${formatTime(l.timestamp)}] [${l.stage}] ${l.message}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="panel" aria-label="Execution log">
      <div className="log-toolbar">
        <Terminal size={16} aria-hidden="true" />
        <strong style={{ fontSize: "var(--t-sm)" }}>Execution stream</strong>

        <div className="row" style={{ marginLeft: "auto" }}>
          <label className="sr-only" htmlFor="log-search">
            Search log
          </label>
          <div className="row" style={{ gap: "var(--sp-1)" }}>
            <Search size={14} aria-hidden="true" />
            <input
              id="log-search"
              className="input"
              type="search"
              value={term}
              placeholder="Search…"
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>

          <label className="sr-only" htmlFor="log-filter">
            Filter by severity
          </label>
          <select
            id="log-filter"
            className="input"
            style={{ width: "auto", padding: "var(--sp-1) var(--sp-3)", fontSize: "var(--t-xs)" }}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All severities" : s}
              </option>
            ))}
          </select>

          <button type="button" className="btn btn-ghost btn-sm" onClick={copyAll}>
            <Copy size={14} aria-hidden="true" />
            <span className="label">{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>

      <div className="log-console" ref={consoleRef} onScroll={onScroll} tabIndex={0}>
        {loading && logs.length === 0 ? (
          <div aria-hidden="true">
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
          </div>
        ) : null}

        {!loading && visible.length === 0 ? (
          <p className="hint">
            {logs.length === 0 ? "No log entries yet." : "No entries match the current filter."}
          </p>
        ) : null}

        {visible.map((log, i) => (
          <div key={`${log.timestamp}-${i}`} className={`log-line ${log.status}`}>
            <span className="log-time">{formatTime(log.timestamp)}</span>
            <span className="log-stage">{log.stage}</span>
            <span className="log-msg">
              <Highlighted text={log.message} term={term} />
            </span>
          </div>
        ))}

        <div ref={bottomRef} />

        {!pinned ? (
          <button
            type="button"
            className="jump-pill"
            onClick={() => {
              setPinned(true);
              bottomRef.current?.scrollIntoView({ block: "nearest" });
            }}
          >
            <ArrowDownToLine size={12} aria-hidden="true" /> Jump to latest
          </button>
        ) : null}
      </div>
    </section>
  );
}
