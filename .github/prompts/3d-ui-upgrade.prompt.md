---
name: "3D UI Upgrade & Stability Gauntlet"
description: "Rebuild the Multi-Agent Research System frontend as an immersive 3D/Canvas experience with a full UI/UX design system and add-on features, backed by complete FastAPI functionality, then prove stability through a phased, self-troubleshooting test gauntlet."
argument-hint: "Optional: scope (e.g. 'landing + report dashboard only') or constraints (e.g. 'no postprocessing, must run at 60fps on integrated GPU')"
agent: "agent"
tools: [search, edit, runCommands, runTasks, problems, testFailure, browser, todos]
---

# Mission

Convert the existing UI in [frontend/](../../frontend) into a production-grade 3D website with an attractive WebGL canvas, and extend [backend/main.py](../../backend/main.py) so **every** UI affordance is backed by a real endpoint. Then prove stability with a multi-phase test gauntlet, troubleshooting failures autonomously until all gates pass.

Read [project_documentation.md](../../project_documentation.md) and [.github/agent/ARCHITECTURE.md](../agent/ARCHITECTURE.md) before writing any code. Record decisions in [.github/agent/DECISIONS.md](../agent/DECISIONS.md), failures + fixes in [.github/agent/ERROR_LOG.md](../agent/ERROR_LOG.md), and gate results in [.github/agent/VALIDATION.md](../agent/VALIDATION.md).

## Operating Roles

Adopt the role that fits the current phase and state it in one line before acting:

| Role | Owns |
|------|------|
| Senior Product Owner | Scope, acceptance criteria, user journeys, cut-list when at risk |
| Senior Architect | Component boundaries, state flow, render budget, API contracts |
| Senior UI/UX Designer | Design tokens, information hierarchy, motion language, empty/loading/error states, a11y |
| Senior Frontend Developer | React Three Fiber scenes, shaders, accessibility, perf |
| Senior Backend Developer | FastAPI endpoints, schemas, streaming/polling, error contracts |
| Senior Tester | Manual exploratory passes, edge cases, negative paths |
| Senior Automation Tester | pytest + Playwright suites, CI-runnable commands |

## Non-Negotiables

- Stack is fixed: Next.js App Router + `@react-three/fiber` / `drei` / `postprocessing` + `three` (already in [frontend/package.json](../../frontend/package.json)); FastAPI + LiteLLM on the backend.
- Every existing feature must survive: theme switching, model/provider selection, API-key entry (masked), research submission, live progress log polling, run history, and the tabbed report dashboard.
- No secret ever reaches the browser unmasked or a log file in plaintext — preserve the scrubbing behavior in [backend/observability.py](../../backend/observability.py).
- 3D is progressive enhancement: ship a `<Suspense>` fallback and a reduced-motion / no-WebGL 2D path. `prefers-reduced-motion` must disable animation loops, not just slow them.
- Dispose geometries, materials, and textures on unmount. No `useFrame` allocations. No memory growth across route changes.
- Do not invent endpoints on the client. If the UI needs data, add the endpoint first.
- Add a backend `MOCK_LLM=1` mode that returns deterministic fixture reports, so every test gate runs without Ollama or API keys. Installing Playwright and a component-test runner is pre-authorized.

## Visual Direction & Design System

Aesthetic anchor: **"observatory"** — a dark, deep-space control room where each agent is a luminous body and the report is the constellation they resolve into. Cinematic, not toylike; restraint over spectacle.

- **Tokens first.** Extend [frontend/app/globals.css](../../frontend/app/globals.css) with a single token layer (color, spacing scale, radii, elevation, motion durations/easings, z-index ladder). All three themes — Dark, Light, Solarized — re-map tokens only; no component hardcodes a hex value. 3D materials read the same tokens so the canvas re-themes with the DOM.
- **Depth as hierarchy.** Foreground = action, mid = live state, background = ambience. Panels use glass/blur with a real shadow ramp; background particles never compete with text.
- **Type & rhythm.** One display face for headings, one legible sans for data. Fixed type scale, ≥1.5 line-height on body, ≤75ch measure in report prose.
- **Contrast is a hard rule.** All text ≥ 4.5:1 in every theme, including HTML overlaid on canvas — put a scrim behind it rather than hoping the backdrop is dark enough.
- **Motion language.** One easing family, three durations (100/200/400ms). Motion clarifies causality — never decorates. Everything is disabled under `prefers-reduced-motion`.
- **State completeness.** Every surface defines all five states: empty, loading (skeleton, not spinner), partial, error (with recovery action), success.

## Feature Add-Ons

Build these on top of feature parity. Cut from the bottom if the render budget or time is at risk — state what was cut and why.

**Core experience**
1. **Live agent constellation** — each agent an orb whose glow, pulse rate, and orbit reflect real pipeline state (queued / running / done / failed). Streams data from the existing progress endpoint.
2. **Pipeline timeline scrubber** — drag back through the run to replay what each agent produced and when; per-stage duration and token/cost readout.
3. **Command palette (`Ctrl/Cmd+K`)** — run research, jump to a past run, switch theme or model, open any report tab. Full keyboard journey with no mouse.
4. **Report reading mode** — a distraction-free 2D overlay that dims the canvas for long-form reading, print/PDF friendly.
5. **Run comparison** — pick two runs from history and diff SWOT, pricing, and competitor sections side by side.

**Interaction & feedback**
6. **Optimistic submit with progressive disclosure** — form collapses into a live status card the instant a task is queued; never a blocking spinner.
7. **Streaming log terminal** — auto-scroll with a "jump to latest" pill, severity coloring, filter, copy, and search.
8. **Toast + inline error contract** — transient toasts for background events, inline errors for field-level problems, a persistent banner when the backend is unreachable, each with a retry action.
9. **Onboarding flythrough** — a skippable first-visit camera tour that names each agent; remembered in LocalStorage.
10. **Micro-interactions** — hover elevation, focus rings that read on glass, click ripples on 3D objects via raycast, subtle idle drift so the scene is never static.

**Trust & utility**
11. **Settings drawer with key health** — provider/model pickers with search, masked key entry, and a "test connection" call that reports latency and reachability.
12. **Export & share** — download report as JSON/Markdown, copy section to clipboard, shareable deep link to a run and tab.
13. **Session resilience** — restore in-flight run state on reload, warn before navigating away mid-run, and surface a reconnect banner when polling stalls.
14. **Perf HUD (dev-only)** — FPS, draw calls, memory, and a manual quality toggle (Low/Medium/High) that also auto-degrades on sustained frame drops.

**Access & responsiveness**
15. **Responsive down to 360px** — canvas simplifies to a static gradient on small/low-power devices; panels become a stacked sheet UI with touch gestures.
16. **Full a11y layer** — semantic landmarks, `aria-live` for pipeline status, visible focus order, skip-to-content, and a canvas-off preference toggle honored across sessions.

## Phase Plan

Track every phase with the todo list. Do not start a phase until the prior gate is green.

**Phase 0 — Audit & Contract**
Inventory current UI state, props, and network calls. Produce the API contract table (route, method, request, response, error shape). Flag every UI element with no backing endpoint.

**Phase 1 — Backend Completeness**
Implement/repair endpoints so the contract is fully satisfied, including what the add-on features need: run comparison, export, connection test, cancel/retry a run, and per-stage timing/cost in progress payloads. Add Pydantic response models, explicit HTTP error codes, input validation, and the `MOCK_LLM` fixture path. Gate: `pytest backend/tests -q` passes; every contract row has a test.

**Phase 2 — Design System & 3D Foundation**
Land the token layer and theme re-mapping first, then the single shared `<Canvas>`, scene graph, lighting rig, camera controller, and a perf-budgeted postprocessing stack. Instance repeated meshes. Gate: app builds; canvas mounts and unmounts cleanly with zero console errors; all three themes pass contrast checks on a token-only diff.

**Phase 3 — Feature Port & Add-Ons**
Port every legacy view into the 3D shell, then layer the add-ons in listed order. Each feature ships with all five UI states wired. Gate: full user journey works against a live backend, and against `MOCK_LLM=1`.

**Phase 4 — Stability Gauntlet**
Run all layers, fix, re-run:
1. Static — `npm run lint`, `npm run build`, `#problems` clean.
2. Unit — pytest backend, component tests frontend.
3. Integration — API contract tests against a running server.
4. E2E — Playwright over the real browser against `MOCK_LLM=1`: submit research, watch progress, open every report tab, switch themes, run the command palette, export a report, compare two runs, reload mid-run.
5. Resilience — backend down, 500s, malformed JSON, empty report, network stall, rapid double-submit, cancel mid-run, browser back/forward.
6. Performance — frame time, draw calls, heap growth over a 5-minute session; verify auto-degrade and the low-power fallback.
7. Accessibility — axe scan with zero critical issues, keyboard-only journey, focus visibility on glass, `aria-live` status announcements, reduced-motion and canvas-off paths.
8. Responsive/visual — 360px, tablet, desktop, ultrawide; contrast verified in all three themes.

**Phase 5 — Sign-off**
Update [project_documentation.md](../../project_documentation.md) with the new architecture, design-token reference, run commands, `MOCK_LLM` usage, the add-on feature list, and the 3D fallback story. Report the gate matrix.

## Self-Troubleshooting Loop

On any failure: reproduce → read the actual error and stack → form one hypothesis → apply the smallest fix → re-run the failing gate → re-run the prior gate for regressions. Log the entry in ERROR_LOG.md. After three failed hypotheses on the same defect, change approach rather than retrying; if the defect is environmental (missing GPU, absent model server), say so explicitly instead of masking it.

Never weaken a test, delete an assertion, or add a sleep to make a gate pass.

## Definition of Done

Report a table with one row per gate: `Phase | Gate | Command | Result | Evidence`. Claim completion only when every row is green and reproducible from a clean checkout. If any gate cannot be run in this environment, mark it `BLOCKED` with the reason — do not mark it passed.
