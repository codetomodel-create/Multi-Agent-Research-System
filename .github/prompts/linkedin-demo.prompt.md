---
name: "LinkedIn Product Demo"
description: "Use when preparing a LinkedIn demo, walkthrough, talking script, or video outline for the Multi-Agent Research System. Generates a start-here checklist, what to say, click-by-click path, and an end-to-end speaking script."
argument-hint: "Duration (60s / 3min / 8min), audience (recruiters / engineers / founders), format (live / recorded)"
agent: "agent"
tools: [search]
---

# Mission

Produce a **ready-to-speak LinkedIn demo pack** for this repository: the AI Market Research Assistant / Multi-Agent Research System. The user should be able to open the app, follow the click path, and read the script aloud without inventing structure on the fly.

Ground every claim in the repo. Prefer [project_documentation.md](../../project_documentation.md), [README.md](../../README.md), [frontend/app/page.js](../../frontend/app/page.js), and [backend/agent_orchestrator.py](../../backend/agent_orchestrator.py). Do not invent features, providers, tabs, or shortcuts that are not in the product.

If `$input` is empty, default to: **8-minute recorded LinkedIn demo**, audience **engineers + hiring managers**, tone **confident and concrete**, offline-safe with `MOCK_LLM=1`.

## Inputs to honor

Parse `$input` for any of:

| Signal | Effect |
| --- | --- |
| `60s` / `90s` / `3min` / `5min` / `8min` | Target runtime; cut features from the bottom of the beat sheet |
| `recruiters` / `engineers` / `founders` / `mixed` | Vocabulary and which proof points land first |
| `live` / `recorded` / `carousel` | Live = slower clicks + backup lines; recorded = tighter cuts; carousel = 8–10 slide captions, no click path |
| A topic/location | Use that as the on-screen research example |
| `real llm` / `ollama` / `openai` | Do **not** use mock mode; add a pre-warm step so the model is already loaded |

## Product facts you must get right

Use these names exactly when writing the script:

- Product framing: **AI Market Research Assistant** — a config-driven multi-agent pipeline that turns one business idea + optional location into a C-suite report.
- Seven agents: Coordinator → Research, Competitor, Pricing, Trends (parallel, light model) → Writer → Fact Checker (heavy model).
- UI views: Research command center → Configure market research → Pipeline telemetry → Structured intelligence report → Run comparison.
- Launch form title: **New market intelligence task**. Fields: **Business idea**, **Target location**.
- Live stages shown in the UI: Queue → Researching → Critique → Polishing.
- Report tabs: Executive Summary, Market & Competitors, SWOT Analysis, Critique & Refinements, Raw JSON.
- Keyboard: `Ctrl/Cmd+K` command palette.
- Themes: Dark, Light, Solarized.
- Trust points: masked API keys, IST session logs, secret scrubbing, `MOCK_LLM=1` deterministic offline mode, Playwright + pytest gauntlet.
- Visual metaphor: **observatory** — each agent is a luminous body; the report is the constellation they resolve into.
- First-visit **Skip tour** / **Next** overlay. Tell the presenter to skip it unless they want the 20-second agent naming beat.

Recommended demo topic unless the user supplied one:

- Idea: `AI-powered specialty coffee subscription for remote workers`
- Location: `Bengaluru`

Recommended local start (Windows-friendly, no credentials):

```bash
./start-linkedin-demo.sh
# Windows: start-linkedin-demo.cmd
# or: py -m backend.linkedin_demo
```

That opens `http://localhost:8000/?demo=1` with the tour skipped, the coffee / Bengaluru form prefilled, two Compare runs seeded, and on-screen speaking cues. Manual equivalent: `MOCK_LLM=1 MOCK_LLM_DELAY_MS=600 py -m uvicorn backend.main:app --port 8000` then POST `/api/demo/seed`.

## Output format

Write **one Markdown document** the user can paste into a teleprompter or Notes app. Use these exact headings, in this order:

### 1. Demo at a glance
- Runtime, audience, format
- One-sentence hook
- The single outcome the viewer should remember

### 2. Where to start (T-minus 10 minutes)
Numbered pre-flight checklist:
1. Which command to run
2. Which URL to open
3. Browser: 1280×800 or larger, Dark theme, canvas on, notifications off, bookmarks bar hidden
4. Skip or finish the onboarding tour
5. Optional: pre-seed one completed run so Compare is not empty
6. Backup plan if the backend is down or WebGL is off
7. What **not** to click (Settings keys, Perf HUD `?perf=1`, Raw JSON unless asked)

### 3. What to talk about (beat sheet)
A table: `Time | On screen | You say (one line) | Do not say`.
Cover, in order, only what fits the runtime:
1. Hook + problem
2. Architecture in one breath (light vs heavy, seven agents)
3. Launch the run
4. Live constellation + telemetry + log terminal
5. Report tabs + reading mode / export
6. Compare or command palette (cut first if short)
7. Trust: masking, tests, mock mode
8. Close + CTA

### 4. End-to-end speaking script
Write **spoken words**, not bullets. Use this pattern for every beat:

> **[mm:ss] On screen:** _exact click or view_
>
> **Say:**
> verbatim lines, short sentences, first person.
>
> **If it stalls:** one backup sentence so they never go silent.

Script the whole demo from “Hi, I’m …” through “If you want the repo / a walkthrough, comment demo.” Include natural pauses where a click or a stage transition happens.

### 5. Click-by-click path
A tight numbered list that matches the script (button labels as they appear in the UI).

### 6. LinkedIn packaging
- Post caption (≤ 1,300 characters), 5–8 hashtags, a first-line hook that works before “see more”
- 3 comment-seed replies the presenter can post under their own video
- Thumbnail text overlay (≤ 6 words)
- Alternate 60-second cut, 3 bullets only

### 7. Likely questions
Five Q&A pairs, 2–3 sentences each, grounded in this repo (cost routing, why 3D, secret handling, mock vs real LLM, how to run locally).

## Style rules

- Sound like a builder showing work, not a product-ad voiceover.
- No hype words: “revolutionary”, “disrupt”, “game-changer”, “just”, “simply”.
- No fake metrics. If you mention tokens, cost, or stage time, say “you can see the live numbers here”, do not invent values.
- Keep sentences under 20 words when they will be spoken.
- Call UI chrome by its real label.
- If a requested runtime cannot fit every feature, cut Compare, then Command Palette, then Critique tab — and say so in section 1.
