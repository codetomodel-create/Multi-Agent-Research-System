"use client";

import { useEffect, useState } from "react";
import {
  Award, BookOpen, Copy, Download, FileCode, FileText, Link2, Printer, Sliders, TrendingUp, X,
} from "lucide-react";

import { api } from "../lib/api";
import { bullets, paragraphs, triggerDownload } from "../lib/format";
import { useFocusTrap } from "../lib/hooks";

export const REPORT_TABS = [
  { id: "summary", label: "Executive Summary", icon: FileText },
  { id: "market", label: "Market & Competitors", icon: TrendingUp },
  { id: "swot", label: "SWOT Analysis", icon: Award },
  { id: "critique", label: "Critique & Refinements", icon: Sliders },
  { id: "raw", label: "Raw JSON", icon: FileCode },
];

function Prose({ text }) {
  const paras = paragraphs(text);
  if (paras.length === 0) return <p className="hint">Nothing was written for this section.</p>;
  return paras.map((p, i) => <p key={i}>{p}</p>);
}

function TabBody({ tab, report }) {
  if (tab === "summary") {
    return (
      <div className="prose">
        <h3>Executive Summary</h3>
        <Prose text={report.executive_summary} />
        <h3>Strategic Recommendations</h3>
        <ul>
          {bullets(report.strategic_recommendations).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (tab === "market") {
    return (
      <div className="prose">
        <h3>Market Overview & Trends</h3>
        <Prose text={report.market_overview} />
        <h3>Competitive Landscape</h3>
        <Prose text={report.competitor_analysis} />
      </div>
    );
  }
  if (tab === "swot") {
    return (
      <div className="prose">
        <h3>SWOT Analysis</h3>
        <Prose text={report.swot_analysis} />
      </div>
    );
  }
  if (tab === "critique") {
    return (
      <div className="prose">
        <h3>Critique & Refinement Notes</h3>
        <Prose text={report.critique_notes} />
      </div>
    );
  }
  return (
    <div>
      <h3 style={{ marginBottom: "var(--sp-3)" }}>Raw JSON</h3>
      <pre className="code-block">{JSON.stringify(report, null, 2)}</pre>
    </div>
  );
}

function ReadingMode({ report, onClose }) {
  const trapRef = useFocusTrap(true);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sections = [
    ["Executive Summary", report.executive_summary],
    ["Market Overview & Trends", report.market_overview],
    ["Competitive Landscape", report.competitor_analysis],
    ["SWOT Analysis", report.swot_analysis],
    ["Strategic Recommendations", report.strategic_recommendations],
    ["Critique & Refinement Log", report.critique_notes],
  ];

  return (
    <div className="reader" role="dialog" aria-modal="true" aria-label="Reading mode" ref={trapRef}>
      <div className="reader-inner">
        <div className="reader-bar">
          <BookOpen size={16} aria-hidden="true" />
          <strong style={{ fontSize: "var(--t-sm)" }}>Reading mode</strong>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()}>
            <Printer size={14} aria-hidden="true" />
            <span className="label">Print / PDF</span>
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={14} aria-hidden="true" />
            <span className="label">Close</span>
          </button>
        </div>

        <h2>{report.title}</h2>
        <p className="hint">Target market: {report.topic}</p>

        {sections.map(([label, body]) => (
          <section key={label}>
            <h3>{label}</h3>
            <div className="prose">
              <Prose text={body} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function ReportView({
  report,
  taskId,
  tab,
  onTabChange,
  loading,
  error,
  onRetry,
  onToast,
}) {
  const [reading, setReading] = useState(false);

  if (loading) {
    return (
      <section className="panel pad" aria-busy="true" aria-label="Loading report">
        <div className="skeleton skeleton-row" style={{ width: "40%", height: 26 }} />
        <div className="skeleton skeleton-row" />
        <div className="skeleton skeleton-row" />
        <div className="skeleton skeleton-row" />
        <div className="skeleton skeleton-row" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel pad">
        <div className="alert error" role="alert">
          <X size={16} aria-hidden="true" />
          <div className="alert-body">
            <strong>Report unavailable.</strong> {error}
          </div>
        </div>
        <button type="button" className="btn btn-ghost" style={{ marginTop: "var(--sp-4)" }} onClick={onRetry}>
          Try again
        </button>
      </section>
    );
  }

  if (!report) {
    return (
      <section className="panel">
        <div className="empty-state">
          <FileText size={40} aria-hidden="true" />
          <h3>No report selected</h3>
          <p>Pick a completed run from the dashboard, or launch a new one to generate intelligence.</p>
        </div>
      </section>
    );
  }

  const copySection = async () => {
    const map = {
      summary: report.executive_summary,
      market: `${report.market_overview}\n\n${report.competitor_analysis}`,
      swot: report.swot_analysis,
      critique: report.critique_notes,
      raw: JSON.stringify(report, null, 2),
    };
    try {
      await navigator.clipboard.writeText(map[tab] ?? "");
      onToast?.({ tone: "success", title: "Section copied to clipboard" });
    } catch {
      onToast?.({ tone: "error", title: "Clipboard blocked by the browser" });
    }
  };

  const exportAs = async (format) => {
    try {
      const res = await api.exportRaw(taskId, format);
      const blob = await res.blob();
      const slug = (report.topic || "report").toLowerCase().replace(/[^a-z0-9]+/g, "_");
      triggerDownload(blob, `market_research_${slug}.${format === "markdown" ? "md" : "json"}`);
      onToast?.({ tone: "success", title: `Exported as ${format}` });
    } catch (err) {
      onToast?.({ tone: "error", title: "Export failed", text: err.message });
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#run=${taskId}&tab=${tab}`;
    try {
      await navigator.clipboard.writeText(url);
      onToast?.({ tone: "success", title: "Shareable link copied" });
    } catch {
      onToast?.({ tone: "error", title: "Clipboard blocked by the browser" });
    }
  };

  return (
    <>
      <section className="panel pad">
        <div className="row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2>{report.title}</h2>
            <div className="run-meta">
              <span className="tag">{report.topic}</span>
              <span className="badge success">verified</span>
            </div>
          </div>
          <div className="row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReading(true)}>
              <BookOpen size={14} aria-hidden="true" />
              <span className="label">Read</span>
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={copySection}>
              <Copy size={14} aria-hidden="true" />
              <span className="label">Copy section</span>
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={copyLink}>
              <Link2 size={14} aria-hidden="true" />
              <span className="label">Share link</span>
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportAs("markdown")}>
              <Download size={14} aria-hidden="true" />
              <span className="label">Markdown</span>
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportAs("json")}>
              <Download size={14} aria-hidden="true" />
              <span className="label">JSON</span>
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="report-tabs" role="tablist" aria-label="Report sections">
          {REPORT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className="report-tab"
              onClick={() => onTabChange(t.id)}
            >
              <t.icon size={14} aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section
        className="panel pad"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
      >
        <TabBody tab={tab} report={report} />
      </section>

      {reading ? <ReadingMode report={report} onClose={() => setReading(false)} /> : null}
    </>
  );
}
