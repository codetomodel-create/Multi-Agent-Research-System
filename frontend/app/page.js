"use client";

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, CheckCircle2, Command, Compass, GitCompare, History, Moon, Palette,
  Play, Plug, Settings2, Sparkles, Sun, Terminal, WifiOff, XCircle,
} from "lucide-react";

import CommandPalette from "./components/CommandPalette";
import CompareView from "./components/CompareView";
import DemoCue from "./components/DemoCue";
import LaunchForm from "./components/LaunchForm";
import LogTerminal from "./components/LogTerminal";
import Onboarding from "./components/Onboarding";
import PerfHUD from "./components/PerfHUD";
import ReportView, { REPORT_TABS } from "./components/ReportView";
import RunHistory from "./components/RunHistory";
import SettingsDrawer from "./components/SettingsDrawer";
import Timeline from "./components/Timeline";
import { ToastProvider, useToast } from "./components/Toasts";
import { api } from "./lib/api";
import { DEMO_LAUNCH } from "./lib/demo";
import { formatCost, formatTokens } from "./lib/format";
import {
  readStored, useDemoFlag, useHashParams, useHasWebGL, useIsSmallScreen, usePerfFlag,
  usePersistentState, usePrefersReducedMotion, writeHash,
} from "./lib/hooks";
import { THEMES, THEME_KEY, applyTheme } from "./lib/theme";
import { useRunStream } from "./lib/useRunStream";

const SceneCanvas = lazy(() => import("./components/canvas/SceneCanvas"));

const VIEWS = {
  dashboard: { title: "Research command center", sub: "Launch and audit multi-agent workflows." },
  launch: { title: "Configure market research", sub: "Route work across the light and heavy model tiers." },
  tracker: { title: "Pipeline telemetry", sub: "Live stage timings, cost and the execution stream." },
  report: { title: "Structured intelligence report", sub: "The audited output of the agent pipeline." },
  compare: { title: "Run comparison", sub: "Diff two completed runs section by section." },
};

const STAGE_ORDER = ["Queue", "Researching", "Critique", "Polishing"];

const EMPTY_RUNS = [];

const DEFAULT_SETTINGS = {
  light: { provider: "ollama", model: "llama3.1:8b", apiKey: "" },
  heavy: { provider: "ollama", model: "llama3.1:8b", apiKey: "" },
};

function activeStageOf(progress) {
  if (!progress) return -1;
  if (progress.status === "success") return STAGE_ORDER.length;
  const running = (progress.stages ?? []).find((s) => s.status === "running");
  if (running) return STAGE_ORDER.indexOf(running.name);
  const done = (progress.stages ?? []).filter((s) => s.status === "completed").length;
  return Math.min(done, STAGE_ORDER.length - 1);
}

function Workspace() {
  const toast = useToast();
  const reducedMotion = usePrefersReducedMotion();
  const hasWebGL = useHasWebGL();
  const isSmall = useIsSmallScreen();
  const hash = useHashParams();
  const perfFlag = usePerfFlag();
  const demoMode = useDemoFlag();

  const [view, setView] = useState("dashboard");
  const [theme, setTheme] = usePersistentState(THEME_KEY, "dark");
  const [canvasOn, setCanvasOn] = usePersistentState("mr_canvas", true);
  const [quality, setQuality] = usePersistentState("mr_quality", "medium");
  const [settings, setSettings] = usePersistentState("mr_settings", DEFAULT_SETTINGS);
  const [tourDone, setTourDone] = usePersistentState("mr_tour_done", false);
  const [, setLastRunId] = usePersistentState("mr_last_run", null);

  const [runs, setRuns] = useState(null);
  const [runsError, setRunsError] = useState("");
  const [backendDown, setBackendDown] = useState(false);
  const runsList = useMemo(() => runs ?? EMPTY_RUNS, [runs]);
  const runsLoading = runs === null && !runsError;

  // `null` means "follow the deep link"; any other value is an explicit choice.
  const [pickedRunId, setPickedRunId] = useState(null);
  const [pickedTab, setPickedTab] = useState(null);
  const activeRunId = pickedRunId ?? hash.run ?? null;
  const reportTab =
    pickedTab ?? (REPORT_TABS.some((t) => t.id === hash.tab) ? hash.tab : "summary");

  const [report, setReport] = useState({ id: null, data: null, error: "" });
  const reportFresh = report.id === activeRunId;
  const reportData = reportFresh ? report.data : null;
  const reportError = reportFresh ? report.error : "";
  const reportLoading = Boolean(activeRunId) && !reportFresh;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [launchError, setLaunchError] = useState("");
  const [tourStep, setTourStep] = useState(0);
  const [perfStats, setPerfStats] = useState(null);
  const [scrubbed, setScrubbed] = useState(null);
  const [compare, setCompare] = useState({ a: null, b: null });
  const [announcement, setAnnouncement] = useState("");

  const setReportTab = setPickedTab;

  /* ---- Theme ------------------------------------------------------------ */
  useEffect(() => applyTheme(theme), [theme]);

  /* ---- Runs ------------------------------------------------------------- */
  const restoreRef = useRef(false);

  const loadRuns = useCallback(
    (signal) =>
      api.runs(signal).then(
        (data) => {
          setRuns(data);
          setRunsError("");
          setBackendDown(false);

          // Session resilience: the first listing after load re-attaches to a
          // run that was still in flight when the tab was closed.
          if (!restoreRef.current) {
            restoreRef.current = true;
            const stored = readStored("mr_last_run", null);
            const deepLinked = Boolean(
              new URLSearchParams(window.location.hash.slice(1)).get("run"),
            );
            if (stored && !deepLinked && data.find((r) => r.task_id === stored)?.status === "running") {
              setPickedRunId(stored);
              setView("tracker");
              toast.push({ tone: "info", title: "Reconnected to your in-flight run" });
            }
          }
        },
        (err) => {
          if (err?.name === "AbortError") return;
          setRunsError(err.message);
          if (err.offline) setBackendDown(true);
        },
      ),
    [toast],
  );

  /* ---- Report ----------------------------------------------------------- */
  const loadReport = useCallback(
    (taskId) =>
      taskId
        ? api.report(taskId).then(
            (data) => setReport({ id: taskId, data, error: "" }),
            (err) => setReport({ id: taskId, data: null, error: err.message }),
          )
        : Promise.resolve(),
    [],
  );

  const onRunFinish = useCallback(
    (status, taskId) => {
      loadRuns();
      setAnnouncement(`Run ${status}.`);
      if (status === "success") {
        loadReport(taskId);
        setView("report");
        toast.push({ tone: "success", title: "Report ready", text: "The audited report is available." });
      } else if (status === "failed") {
        toast.push({ tone: "error", title: "Run failed", text: "Check the execution stream for the failing stage." });
      } else if (status === "cancelled") {
        toast.push({ tone: "warning", title: "Run cancelled" });
      }
    },
    [loadReport, loadRuns, toast],
  );

  const { progress, error: streamError, stalled, reconnect, refresh } = useRunStream(activeRunId, {
    onFinish: onRunFinish,
  });

  const isRunning = progress?.status === "running";

  /* ---- Mount: load history, then follow the deep link -------------------- */
  useEffect(() => {
    const controller = new AbortController();
    loadRuns(controller.signal);
    return () => controller.abort();
  }, [loadRuns]);

  useEffect(() => {
    if (activeRunId) loadReport(activeRunId);
  }, [activeRunId, loadReport]);

  // Warn before losing an in-flight run.
  useEffect(() => {
    if (!isRunning) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isRunning]);

  // Keep the shareable deep link in sync with what is on screen.
  useEffect(() => {
    writeHash(activeRunId, reportTab);
  }, [activeRunId, reportTab]);

  // Backend reachability banner.
  useEffect(() => {
    const id = setInterval(() => {
      api.health().then(
        () => setBackendDown(false),
        (err) => setBackendDown(Boolean(err.offline)),
      );
    }, 15000);
    return () => clearInterval(id);
  }, []);

  /* ---- LinkedIn presenter mode ------------------------------------------ */
  const demoSeeded = useRef(false);
  useEffect(() => {
    if (!demoMode || demoSeeded.current) return undefined;
    demoSeeded.current = true;
    setTourDone(true);
    let cancelled = false;
    api.seedDemo().then(
      (data) => {
        if (cancelled) return;
        loadRuns();
        const finished = (data.runs ?? []).map((r) => r.task_id);
        if (finished.length >= 2) {
          setCompare((current) => ({
            a: current.a || finished[0],
            b: current.b || finished[1],
          }));
        }
      },
      () => {
        demoSeeded.current = false;
      },
    );
    return () => {
      cancelled = true;
    };
  }, [demoMode, loadRuns, setTourDone]);

  /* ---- First-visit tour -------------------------------------------------- */
  const tourEligible = !demoMode && !tourDone && hasWebGL && !isSmall && !reducedMotion && canvasOn;
  const activeTourStep = tourEligible ? tourStep : -1;

  const endTour = useCallback(() => {
    setTourDone(true);
  }, [setTourDone]);

  /* ---- Actions ----------------------------------------------------------- */
  const launch = useCallback(
    async ({ idea, location, enable_web_search: web, overrideKey }) => {
      setSubmitting(true);
      setLaunchError("");
      try {
        const data = await api.research({
          idea,
          location,
          enable_web_search: web,
          ui_model_config: {
            light_task: {
              provider: settings.light.provider,
              model: settings.light.model,
              api_key: overrideKey || settings.light.apiKey || undefined,
            },
            heavy_task: {
              provider: settings.heavy.provider,
              model: settings.heavy.model,
              api_key: overrideKey || settings.heavy.apiKey || undefined,
            },
          },
        });
        setPickedRunId(data.task_id);
        setLastRunId(data.task_id);
        setReport({ id: data.task_id, data: null, error: "" });
        setView("tracker");
        setAnnouncement(`Run queued for ${data.topic}.`);
        toast.push({ tone: "info", title: "Task queued", text: data.topic });
        loadRuns();
      } catch (err) {
        setLaunchError(err.message);
        if (err.offline) setBackendDown(true);
      } finally {
        setSubmitting(false);
      }
    },
    [settings, loadRuns, setLastRunId, toast],
  );

  const openRun = useCallback(
    (run) => {
      setPickedRunId(run.task_id);
      setLastRunId(run.task_id);
      setView(run.status === "success" ? "report" : "tracker");
    },
    [setLastRunId],
  );

  const retryRun = useCallback(
    async (run) => {
      try {
        const data = await api.retry(run.task_id);
        setPickedRunId(data.task_id);
        setLastRunId(data.task_id);
        setView("tracker");
        toast.push({ tone: "info", title: "Re-running", text: data.topic });
        loadRuns();
      } catch (err) {
        toast.push({ tone: "error", title: "Could not re-run", text: err.message });
      }
    },
    [loadRuns, setLastRunId, toast],
  );

  const deleteRun = useCallback(
    async (run) => {
      const previous = runs;
      setRuns((list) => (list ?? []).filter((r) => r.task_id !== run.task_id));
      try {
        await api.remove(run.task_id);
        if (activeRunId === run.task_id) {
          setPickedRunId(null);
          setView("dashboard");
        }
        toast.push({ tone: "success", title: "Run deleted" });
      } catch (err) {
        setRuns(previous);
        toast.push({ tone: "error", title: "Delete failed", text: err.message });
      }
    },
    [runs, activeRunId, toast],
  );

  const cancelRun = useCallback(async () => {
    if (!activeRunId) return;
    try {
      await api.cancel(activeRunId);
      refresh();
      toast.push({ tone: "warning", title: "Cancellation signal sent" });
    } catch (err) {
      toast.push({ tone: "error", title: "Cancel failed", text: err.message });
    }
  }, [activeRunId, refresh, toast]);

  const saveSettings = useCallback(async () => {
    setSavingSettings(true);
    try {
      await api.saveConfig({
        light_provider: settings.light.provider,
        light_model: settings.light.model,
        light_api_key: settings.light.apiKey || undefined,
        heavy_provider: settings.heavy.provider,
        heavy_model: settings.heavy.model,
        heavy_api_key: settings.heavy.apiKey || undefined,
      });
      toast.push({ tone: "success", title: "Settings saved" });
      setSettingsOpen(false);
    } catch (err) {
      toast.push({
        tone: "warning",
        title: "Saved in this browser only",
        text: `The server copy was not updated: ${err.message}`,
      });
    } finally {
      setSavingSettings(false);
    }
  }, [settings, toast]);

  /* ---- Command palette ---------------------------------------------------- */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commands = useMemo(() => {
    const list = [
      { id: "nav-dashboard", group: "Navigate", label: "Go to dashboard", icon: History, run: () => setView("dashboard") },
      { id: "nav-launch", group: "Navigate", label: "New research", icon: Play, run: () => setView("launch") },
      { id: "nav-tracker", group: "Navigate", label: "Open pipeline telemetry", icon: Activity, run: () => setView("tracker") },
      { id: "nav-compare", group: "Navigate", label: "Compare runs", icon: GitCompare, run: () => setView("compare") },
      { id: "open-settings", group: "Navigate", label: "Open settings", icon: Settings2, hint: "S", run: () => setSettingsOpen(true) },
      ...THEMES.map((t) => ({
        id: `theme-${t}`,
        group: "Theme",
        label: `Switch to ${t} theme`,
        icon: t === "light" ? Sun : t === "dark" ? Moon : Palette,
        run: () => setTheme(t),
      })),
      {
        id: "toggle-canvas",
        group: "Display",
        label: canvasOn ? "Turn the 3D canvas off" : "Turn the 3D canvas on",
        icon: Sparkles,
        run: () => setCanvasOn(!canvasOn),
      },
      ...["low", "medium", "high"].map((q) => ({
        id: `quality-${q}`,
        group: "Display",
        label: `Render quality: ${q}`,
        icon: Sparkles,
        run: () => setQuality(q),
      })),
      ...REPORT_TABS.map((t) => ({
        id: `tab-${t.id}`,
        group: "Report",
        label: `Open report tab: ${t.label}`,
        icon: t.icon,
        run: () => {
          setReportTab(t.id);
          setView("report");
        },
      })),
      ...runsList.slice(0, 8).map((run) => ({
        id: `run-${run.task_id}`,
        group: "Recent runs",
        label: run.topic || run.task_id,
        keywords: run.status,
        icon: Terminal,
        run: () => openRun(run),
      })),
    ];
    return list;
  }, [runsList, canvasOn, openRun, setCanvasOn, setQuality, setTheme, setReportTab]);

  /* ---- Derived ------------------------------------------------------------ */
  const activeStage = activeStageOf(progress);
  const visibleLogs = scrubbed ?? progress?.logs ?? [];
  const stats = useMemo(
    () => ({
      total: runsList.length,
      done: runsList.filter((r) => r.status === "success").length,
      active: runsList.filter((r) => r.status === "running").length,
      tokens: runsList.reduce((n, r) => n + (r.tokens || 0), 0),
      cost: runsList.reduce((n, r) => n + (r.cost_usd || 0), 0),
    }),
    [runsList],
  );

  // Dev builds show the HUD by default; any build can opt in with ?perf=1.
  const showPerfHud =
    (process.env.NODE_ENV !== "production" || perfFlag) && canvasOn && hasWebGL && !isSmall;
  const meta = VIEWS[view];

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <Suspense fallback={<div className="scene-layer" aria-hidden="true" />}>
        <SceneCanvas
          activeStage={activeStage}
          status={progress?.status ?? "idle"}
          quality={quality}
          enabled={canvasOn}
          tourStep={activeTourStep > 0 ? activeTourStep - 1 : -1}
          onStats={showPerfHud ? setPerfStats : undefined}
          onPick={(agent) => toast.push({ tone: "info", title: agent.label, text: "Agent in the research pipeline." })}
        />
      </Suspense>

      <div className="app-shell">
        <nav className="rail panel" aria-label="Primary">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <Compass size={22} />
            </span>
            <span>
              <span className="brand-name">MarketAgent</span>
              <span className="brand-sub">Observatory</span>
            </span>
          </div>

          <div>
            <p className="rail-heading" id="rail-nav-heading">
              Workspace
            </p>
            <div className="rail-nav" aria-labelledby="rail-nav-heading">
              {[
                { id: "dashboard", label: "Dashboard", icon: History, count: stats.total },
                { id: "launch", label: "New research", icon: Play },
                { id: "tracker", label: "Telemetry", icon: Activity, count: stats.active || undefined },
                { id: "compare", label: "Compare", icon: GitCompare },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="nav-item"
                  aria-current={view === item.id ? "page" : undefined}
                  onClick={() => setView(item.id)}
                >
                  <item.icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.count != null ? <span className="count">{item.count}</span> : null}
                </button>
              ))}
              <button type="button" className="nav-item" onClick={() => setSettingsOpen(true)}>
                <Settings2 size={18} aria-hidden="true" />
                <span>Settings</span>
              </button>
            </div>
          </div>

          <div className="rail-foot">
            <div className="segmented" role="group" aria-label="Colour theme">
              {THEMES.map((t) => {
                const Icon = t === "light" ? Sun : t === "dark" ? Moon : Palette;
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={theme === t}
                    aria-label={`${t} theme`}
                    onClick={() => setTheme(t)}
                  >
                    <Icon size={16} aria-hidden="true" />
                  </button>
                );
              })}
            </div>

            <label className="checkbox">
              <input type="checkbox" checked={canvasOn} onChange={(e) => setCanvasOn(e.target.checked)} />
              3D canvas
            </label>

            <div className="status-pill">
              <span className={`dot ${backendDown ? "off" : "on"}`} aria-hidden="true" />
              <span>{backendDown ? "Backend unreachable" : "Backend connected"}</span>
            </div>
            {demoMode ? <span className="badge demo">LinkedIn demo</span> : null}

            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPaletteOpen(true)}>
              <Command size={14} aria-hidden="true" />
              Commands
              <kbd className="kbd">Ctrl K</kbd>
            </button>
          </div>
        </nav>

        <main className="main" id="main">
          <header className="topbar panel">
            <div>
              <h1>{meta.title}</h1>
              <p>{meta.sub}</p>
            </div>
            <div className="topbar-actions">
              {isRunning ? (
                <button type="button" className="btn btn-danger btn-sm" onClick={cancelRun}>
                  <XCircle size={14} aria-hidden="true" />
                  <span className="label">Cancel run</span>
                </button>
              ) : null}
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setView("launch")}>
                <Play size={14} aria-hidden="true" />
                <span className="label">New research</span>
              </button>
            </div>
          </header>
          {demoMode ? <DemoCue view={view} /> : null}

          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>

          <div className="viewport">
            {backendDown ? (
              <div className="offline-banner" role="alert" style={{ marginBottom: "var(--sp-4)" }}>
                <WifiOff size={16} aria-hidden="true" />
                <span>Backend unreachable. Live updates are paused.</span>
                <span className="spacer" />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadRuns()}>
                  Retry now
                </button>
              </div>
            ) : null}

            {view === "dashboard" ? (
              <div className="view">
                <div className="grid-3">
                  {[
                    { icon: Activity, value: stats.total, label: "Total orchestrations" },
                    { icon: CheckCircle2, value: stats.done, label: "Completed reports" },
                    { icon: Plug, value: `${formatTokens(stats.tokens)} · ${formatCost(stats.cost)}`, label: "Tokens & spend" },
                  ].map((card) => (
                    <div key={card.label} className="panel stat-card">
                      <span className="stat-icon" aria-hidden="true">
                        <card.icon size={20} />
                      </span>
                      <span>
                        <span className="stat-value">{card.value}</span>
                        <span className="stat-label">{card.label}</span>
                      </span>
                    </div>
                  ))}
                </div>

                <RunHistory
                  runs={runsList}
                  loading={runsLoading}
                  error={runsError}
                  selectedId={activeRunId}
                  onOpen={openRun}
                  onRetry={retryRun}
                  onDelete={deleteRun}
                  onNew={() => setView("launch")}
                  onReload={() => loadRuns()}
                />
              </div>
            ) : null}

            {view === "launch" ? (
              <LaunchForm
                onLaunch={launch}
                submitting={submitting}
                error={launchError}
                defaults={demoMode ? DEMO_LAUNCH : undefined}
              />
            ) : null}

            {view === "tracker" ? (
              <div className="view">
                {!activeRunId ? (
                  <section className="panel">
                    <div className="empty-state">
                      <Activity size={40} aria-hidden="true" />
                      <h3>No run selected</h3>
                      <p>Launch a task or open one from the dashboard to watch its pipeline live.</p>
                      <button type="button" className="btn btn-primary" onClick={() => setView("launch")}>
                        <Play size={16} aria-hidden="true" /> New research
                      </button>
                    </div>
                  </section>
                ) : (
                  <>
                    {stalled ? (
                      <div className="offline-banner" role="alert">
                        <WifiOff size={16} aria-hidden="true" />
                        <span>Live stream stalled. Progress may be behind.</span>
                        <span className="spacer" />
                        <button type="button" className="btn btn-ghost btn-sm" onClick={reconnect}>
                          Reconnect
                        </button>
                      </div>
                    ) : null}

                    {streamError ? (
                      <div className="alert error" role="alert">
                        <XCircle size={16} aria-hidden="true" />
                        <div className="alert-body">{streamError}</div>
                      </div>
                    ) : null}

                    <Timeline progress={progress} onScrub={setScrubbed} />
                    <LogTerminal logs={visibleLogs} loading={!progress && !streamError} />
                  </>
                )}
              </div>
            ) : null}

            {view === "report" ? (
              <div className="view">
                <ReportView
                  report={reportData}
                  taskId={activeRunId}
                  tab={reportTab}
                  onTabChange={setReportTab}
                  loading={reportLoading}
                  error={reportError}
                  onRetry={() => loadReport(activeRunId)}
                  onToast={toast.push}
                />
              </div>
            ) : null}

            {view === "compare" ? (
              <CompareView
                runs={runsList}
                a={compare.a}
                b={compare.b}
                onPick={(side, value) => setCompare((c) => ({ ...c, [side]: value || null }))}
              />
            ) : null}
          </div>
        </main>
      </div>

      <SettingsDrawer
        open={settingsOpen}
        settings={settings}
        onChange={setSettings}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettings}
        saving={savingSettings}
      />

      {paletteOpen ? (
        <CommandPalette onClose={() => setPaletteOpen(false)} commands={commands} />
      ) : null}

      {activeTourStep >= 0 ? (
        <Onboarding step={activeTourStep} onStep={setTourStep} onDone={endTour} />
      ) : null}

      {showPerfHud ? <PerfHUD stats={perfStats} quality={quality} onQuality={setQuality} /> : null}
    </>
  );
}

export default function Page() {
  return (
    <ToastProvider>
      <Workspace />
    </ToastProvider>
  );
}
