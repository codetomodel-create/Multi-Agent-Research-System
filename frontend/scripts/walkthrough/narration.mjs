/**
 * Narration for the product walkthrough video.
 *
 * Each segment is one spoken paragraph plus the on-screen callout shown while
 * it plays. `action` names a step in record.mjs that drives the UI for that
 * segment. Keep `say` conversational: it is read by a TTS voice.
 */

export const VIDEO_TITLE = "MarketAgent Observatory — Product Walkthrough";

export const DEMO_IDEA = "Electric bike rental for university campuses";
export const DEMO_LOCATION = "Pune";

export const SEGMENTS = [
  // ── Opening ──────────────────────────────────────────────────────────────
  {
    id: "title",
    chapter: "Welcome",
    action: "titleCard",
    callout: null,
    say:
      "Welcome to MarketAgent Observatory. In the next few minutes you will learn everything you need to run a complete market research study on your own: what the product does, how to set it up, how to launch research, how to read the results, and how to compare studies side by side.",
  },
  {
    id: "overview",
    chapter: "Welcome",
    action: "overviewCard",
    callout: null,
    say:
      "Here is the idea in one sentence. You type a business idea and, optionally, a city. Seven specialised A.I. agents then plan the study, research the market in parallel, write an executive report, and fact-check it. The result is a structured, board-ready market report, not a chat transcript. It is built for founders, product managers and analysts who need a first-pass market view in minutes instead of days.",
  },
  {
    id: "roles",
    chapter: "Welcome",
    action: "rolesCard",
    callout: null,
    say:
      "There are two kinds of people who use it. Researchers launch studies and read reports. Whoever sets up the workspace picks the A.I. providers and keys once, in Settings. In a small team, that is usually the same person. There are no separate logins: anyone who can open the app can do both.",
  },

  // ── First visit ──────────────────────────────────────────────────────────
  {
    id: "tour-1",
    chapter: "First visit",
    action: "openApp",
    callout: {
      position: "top",
      title: "Guided tour on first visit",
      text: "A short tour explains the 3D observatory. Click Next to step through it, or Skip tour.",
    },
    say:
      "When you open the app for the first time, a short guided tour appears. The animated scene behind the interface is the observatory. Every glowing body is one of the seven agents, and its glow follows the real state of your current run. You can step through the tour with Next, or dismiss it with Skip tour. You will not see it again on this browser.",
  },
  {
    id: "tour-2",
    chapter: "First visit",
    action: "tourNext",
    callout: {
      position: "top",
      title: "Meet the agents",
      text: "Coordinator plans · four research agents gather · Writer synthesises · Fact Checker audits.",
    },
    say:
      "The tour introduces each agent. The Coordinator plans the study. Four research agents gather general market data, competitors, pricing, and trends, all at the same time. The Writer turns their drafts into one narrative, and the Fact Checker audits it and produces the final structured report.",
  },
  {
    id: "tour-finish",
    chapter: "First visit",
    action: "tourFinish",
    callout: {
      position: "top",
      title: "Dashboard",
      text: "Your home screen. The left rail is the whole product.",
    },
    say:
      "Let's finish the tour and look at the dashboard, which is your home screen.",
  },

  // ── Dashboard ────────────────────────────────────────────────────────────
  {
    id: "rail",
    chapter: "Dashboard",
    action: "highlightRail",
    callout: {
      title: "Left rail",
      text: "Dashboard · New research · Telemetry · Compare · Settings. Theme, 3D canvas and backend status live at the bottom.",
    },
    say:
      "The left rail is the entire product. Dashboard shows your history. New research starts a study. Telemetry shows a run in progress with live timings and cost. Compare puts two finished reports side by side. Settings is where the A.I. providers are configured. At the bottom you can switch the colour theme, turn the 3D canvas off on a slow laptop, and see whether the backend is connected. The green dot means everything is working.",
  },
  {
    id: "stats",
    chapter: "Dashboard",
    action: "highlightStats",
    callout: {
      title: "Workspace at a glance",
      text: "Total orchestrations · Completed reports · Tokens & spend across all runs.",
    },
    say:
      "The three cards summarise the workspace: how many studies have been run, how many finished with a report, and the total tokens and estimated spend across all of them. This is how a team keeps an eye on A.I. costs.",
  },
  {
    id: "history",
    chapter: "Dashboard",
    action: "highlightHistory",
    callout: {
      title: "Research history",
      text: "Every run with date, duration, tokens, cost, and the light and heavy models used. Report opens it; Re-run repeats it; the bin deletes it.",
    },
    say:
      "Below is the research history. Each row is one study, with when it ran, how long it took, how many tokens it used, what it cost, and which light and heavy models were used. The status badge tells you whether it succeeded, is still running, failed, or was cancelled. Report opens the finished report. Re-run repeats the same study with your current settings, which is useful after you change models. The red bin deletes the run permanently.",
  },

  // ── Settings ─────────────────────────────────────────────────────────────
  {
    id: "settings-open",
    chapter: "Settings",
    action: "openSettings",
    callout: {
      title: "Settings — two model tiers",
      text: "Light tier runs the four parallel research agents. Heavy tier runs the Coordinator, Writer and Fact Checker.",
    },
    say:
      "Before your first study, open Settings. The pipeline uses two tiers of models. The light tier runs the four parallel research agents, so pick something fast and inexpensive here. The heavy tier runs the Coordinator, the Writer and the Fact Checker, where quality matters most, so pick your strongest model here.",
  },
  {
    id: "settings-provider",
    chapter: "Settings",
    action: "settingsProvider",
    callout: {
      title: "Provider, model, API key",
      text: "Ollama (local, free) · OpenAI · Anthropic · Gemini · DeepSeek · Qwen · AWS Bedrock. Keys are stored in this browser only and always shown masked.",
    },
    say:
      "For each tier choose a provider: Ollama for free local models, or OpenAI, Anthropic, Gemini, DeepSeek, Qwen and A.W.S. Bedrock. Once a key is entered the model list is fetched live from that provider, and you can type to filter it. API keys are stored in this browser only and are always shown masked. Test connection checks that the key works and shows the response time and how many models are available. Save settings when you are done. A good starting point is a small local model for the light tier and a top-tier cloud model for the heavy tier.",
  },
  {
    id: "settings-close",
    chapter: "Settings",
    action: "closeSettings",
    callout: null,
    say: "Let's close Settings and launch a study.",
  },

  // ── Launch ───────────────────────────────────────────────────────────────
  {
    id: "launch-form",
    chapter: "New research",
    action: "openLaunch",
    callout: {
      title: "New market intelligence task",
      text: "Business idea is required. Target location is optional and narrows the market to one geography.",
    },
    say:
      "Click New research. The form has just two fields. Business idea is required and can be anything from a one-liner to a full paragraph. Target location is optional; adding a city or region focuses the competitor and pricing research on that market.",
  },
  {
    id: "launch-fill",
    chapter: "New research",
    action: "fillLaunch",
    callout: {
      title: "Real-world example",
      text: `"${DEMO_IDEA}" in ${DEMO_LOCATION}.`,
    },
    say:
      "Here is a real example. Our idea is an electric bike rental service for university campuses, and the target market is Pune. Be specific: name the customer, the offer and the place, and the report will be specific too.",
  },
  {
    id: "launch-options",
    chapter: "New research",
    action: "highlightLaunchOptions",
    callout: {
      title: "Options",
      text: "Enable web search pulls live DuckDuckGo results into the research agents. Override the API key uses a one-off key for this run only — never stored.",
    },
    say:
      "Two options sit below the fields. Enable web search lets the research agents pull live results from DuckDuckGo, so the report reflects the current market rather than the model's memory. Leave it on unless you are offline. Override the API key lets you use a different key just for this run, for example a client's own account. That key is sent once and never stored.",
  },
  {
    id: "launch-go",
    chapter: "New research",
    action: "submitLaunch",
    callout: {
      title: "Launch agent pipeline",
      text: "The form hands over to Telemetry immediately. Nothing blocks you while the agents work.",
    },
    say:
      "Click Launch agent pipeline. The task is queued instantly and the screen switches to Telemetry so you can watch it happen.",
  },

  // ── Telemetry (live) ─────────────────────────────────────────────────────
  {
    id: "telemetry-stages",
    chapter: "Telemetry",
    action: "highlightTimeline",
    callout: {
      title: "Four stages",
      text: "Coordinate → Research → Synthesise → Audit. Each shows duration, tokens and cost as it runs.",
    },
    say:
      "The pipeline timeline shows the four stages. Coordinate is the planning step. Research runs the four light agents in parallel. Synthesise is the Writer composing the report, and Audit is the Fact Checker. Each stage lights up as it runs and records its own duration, tokens and estimated cost, so you can see exactly where time and money go. Behind the panels, the agent that is working glows in the observatory.",
  },
  {
    id: "telemetry-stream",
    chapter: "Telemetry",
    action: "highlightLog",
    callout: {
      title: "Execution stream",
      text: "Every event the agents emit, in order. Search it, filter by severity, or copy it for a bug report.",
    },
    say:
      "The execution stream underneath is the live log: every message the agents emit, in order. You can search it, filter it to only failures, or copy the whole thing when you need to share it with a colleague.",
  },
  {
    id: "telemetry-cancel",
    chapter: "Telemetry",
    action: "highlightCancel",
    callout: {
      title: "Cancel run",
      text: "Available while a run is in progress. The pipeline stops at the next stage boundary.",
    },
    say:
      "While a run is in progress, a Cancel run button appears at the top. Use it if you launched the wrong idea or want to stop spending. The pipeline stops cleanly at the next stage boundary and the run is kept in history marked as cancelled.",
  },

  // ── Report ───────────────────────────────────────────────────────────────
  {
    id: "report-ready",
    chapter: "Report",
    action: "waitForReport",
    callout: {
      title: "Report ready",
      text: "The app switches to the report automatically when the audit completes.",
    },
    say:
      "When the audit finishes, the app opens the report for you. The header shows the generated title, the topic, and a verified badge, meaning it passed the fact-check stage.",
  },
  {
    id: "report-summary",
    chapter: "Report",
    action: "reportTabSummary",
    callout: {
      title: "Executive Summary",
      text: "The one-page answer plus Strategic Recommendations. Start here.",
    },
    say:
      "The report is organised into tabs. Executive Summary is the one-page answer: the opportunity in plain language, followed by Strategic Recommendations, which are the concrete next steps. If you only read one tab, read this one.",
  },
  {
    id: "report-market",
    chapter: "Report",
    action: "reportTabMarket",
    callout: {
      title: "Market & Competitors",
      text: "Market overview and trends, then the competitive landscape for your location.",
    },
    say:
      "Market and Competitors covers the market overview and trends, then the competitive landscape. With a location set, this is where the local players and their pricing appear.",
  },
  {
    id: "report-swot",
    chapter: "Report",
    action: "reportTabSwot",
    callout: {
      title: "SWOT Analysis",
      text: "Strengths, Weaknesses, Opportunities and Threats in a four-quadrant grid.",
    },
    say:
      "SWOT Analysis lays out strengths, weaknesses, opportunities and threats in the familiar four-quadrant grid. It is a good slide to paste straight into a pitch deck.",
  },
  {
    id: "report-critique",
    chapter: "Report",
    action: "reportTabCritique",
    callout: {
      title: "Critique & Refinements",
      text: "What the Fact Checker challenged or corrected. Read this before you trust a number.",
    },
    say:
      "Critique and Refinements is unique to this product. It is the Fact Checker's own notes: which claims it challenged, what it corrected, and where the evidence was thin. Read it before you quote a figure to your board. Raw JSON, the last tab, is the machine-readable version for developers who want to feed the report into another system.",
  },
  {
    id: "report-actions",
    chapter: "Report",
    action: "highlightReportActions",
    callout: {
      title: "Share and export",
      text: "Read opens a clean reading mode with Print / PDF. Markdown and JSON download real files. Share link copies a deep link to this exact tab.",
    },
    say:
      "The toolbar above the tabs handles sharing. Read opens a distraction-free reading mode with a Print or P.D.F. button. Markdown and JSON download the report as real files you can attach to an email or commit to a repository. Copy section copies the current tab as text, and Share link copies a link that opens this exact run and tab for anyone with access to the app.",
  },
  {
    id: "report-read",
    chapter: "Report",
    action: "openReadingMode",
    callout: {
      title: "Reading mode",
      text: "The whole report on one page. Press Escape or Close to return.",
    },
    say:
      "Here is reading mode: the whole report on one scrollable page, in order, ready to print. Press Escape or click Close to return.",
  },

  // ── Telemetry (replay) ───────────────────────────────────────────────────
  {
    id: "replay",
    chapter: "Telemetry replay",
    action: "openTelemetryReplay",
    callout: {
      title: "Review a finished run",
      text: "Telemetry keeps the full stage table and log. The Replay position slider scrubs the log back in time; Resume live returns to the end.",
    },
    say:
      "You can go back to Telemetry for any finished run. The stage table now shows final durations, tokens and cost, with totals underneath. The replay slider lets you scrub the log back to any point in the run, which is the fastest way to understand a failure. Resume live jumps back to the end.",
  },

  // ── Compare ──────────────────────────────────────────────────────────────
  {
    id: "compare",
    chapter: "Compare",
    action: "openCompare",
    callout: {
      title: "Run comparison",
      text: "Pick Run A and Run B from any two completed studies. Each section is diffed and marked where it differs.",
    },
    say:
      "Compare answers the question: what changes if I change the brief? Pick any two completed runs as Run A and Run B. The app lines up each report section side by side, marks the sections that differ, and shows duration, tokens and cost for both. Use it to compare two cities, two customer segments, or the same idea run with a cheaper model.",
  },

  // ── Keyboard & themes ────────────────────────────────────────────────────
  {
    id: "palette",
    chapter: "Power features",
    action: "openPalette",
    callout: {
      title: "Command palette — Ctrl K",
      text: "Jump to any view, open a report tab, switch theme or render quality, or open a recent run, all from the keyboard.",
    },
    say:
      "For power users there is a command palette on Control K. Type a few letters to jump to any view, open a specific report tab, switch theme or render quality, or open one of your recent runs. Everything in the app is reachable from the keyboard.",
  },
  {
    id: "themes",
    chapter: "Power features",
    action: "cycleThemes",
    callout: {
      title: "Themes and display",
      text: "Light, dark or auto. Turn the 3D canvas off to save battery; the workflow is identical without it.",
    },
    say:
      "Choose light, dark, or follow the system. Your choice is remembered. If you are on a slow machine or a projector, untick 3D canvas: the observatory is decoration, and every feature works exactly the same without it.",
  },

  // ── Tips ─────────────────────────────────────────────────────────────────
  {
    id: "tips",
    chapter: "Tips",
    action: "tipsCard",
    callout: null,
    say:
      "A few tips from experience. Be specific in the business idea: customer, offer and place. Keep web search on for current data. Use a cheap light model and a strong heavy model to get the best quality per dollar. Always read the Critique tab before quoting numbers. If the rail says Backend unreachable, the server is down or still starting; the app pauses live updates and recovers on its own when it is back. If a live stream stalls, click Reconnect. And when you need two versions of a study, use Re-run and then Compare.",
  },

  // ── Summary ──────────────────────────────────────────────────────────────
  {
    id: "summary",
    chapter: "Summary",
    action: "summaryCard",
    callout: null,
    say:
      "To recap the complete process. One: open Settings and choose a light and a heavy model. Two: click New research, describe the idea and the location, and launch. Three: watch the four stages in Telemetry, with live cost. Four: read the report, starting with the Executive Summary and the Critique, then export it as Markdown, JSON or P.D.F. Five: use Compare to test a different brief. That is MarketAgent Observatory. You are ready to run your first study.",
  },
];
