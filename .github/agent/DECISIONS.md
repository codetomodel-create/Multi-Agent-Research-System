# DECISIONS.md

Durable architectural decisions. ADR format, newest first. Read before changing an established pattern — most of these look "wrong" until you know why they exist.

`ACCEPTED` = in force · `OBSERVED` = reconstructed from the code, rationale inferred and marked as such · `SUPERSEDED` = replaced, kept for history.

Template:

```markdown
## ADR-NNN — <title>
- **Status:** ACCEPTED | OBSERVED | SUPERSEDED by ADR-MMM
- **Date:** YYYY-MM-DD
- **Context:** the forces at play
- **Decision:** what was chosen
- **Consequences:** what this costs and enables
- **Evidence:** files that implement it
```

---

## ADR-018 — The perf HUD is dev-only but opt-in with `?perf=1`
- **Status:** ACCEPTED
- **Date:** 2026-08-15
- **Context:** The renderer HUD (fps, draw calls, heap, quality switch) must not ship to end users, but the performance gate has to assert draw-call budgets and auto-degrade against the **production** build.
- **Decision:** Show the HUD when `NODE_ENV !== 'production'` **or** the URL carries `?perf=1`.
- **Consequences:** The gate tests the real feature rather than a hidden test hook. Users can enable it deliberately; nothing exposes it by accident.
- **Evidence:** `usePerfFlag` in `frontend/app/lib/hooks.js`, `showPerfHud` in `frontend/app/page.js`, `frontend/e2e/performance.spec.js`.

## ADR-017 — `MOCK_LLM_DELAY_MS` exists so mid-run UI states are reachable
- **Status:** ACCEPTED
- **Date:** 2026-08-15
- **Context:** The fixture pipeline finishes in under 100 ms, so "cancel mid-run", live progress and stalled-stream states were untestable — the first cancel E2E was flaky for exactly this reason.
- **Decision:** Add an env-controlled per-call sleep to the fixture responder, default `0`. The E2E harness sets `600`.
- **Consequences:** Unit tests stay fast; E2E gets deterministic mid-run states without sleeps in the test body or weakened assertions.
- **Evidence:** `mock_llm_delay_seconds` in `backend/agent_orchestrator.py`, `webServer.env` in `frontend/playwright.config.mjs`.

## ADR-016 — Browser state is read through `useSyncExternalStore`, not mount effects
- **Status:** ACCEPTED
- **Date:** 2026-08-15
- **Context:** The frontend is a static export, so localStorage, media queries, GPU capability and the URL hash cannot be known at prerender time. The previous code hydrated them in mount effects and had to disable `react-hooks/set-state-in-effect` to do it.
- **Decision:** Every external read is an external store with a cached snapshot and a stable `getServerSnapshot`. Loading states are *derived* (by comparing the id a result belongs to against the id being requested) rather than written at the top of an effect.
- **Consequences:** Zero lint suppressions, no hydration mismatches, no cascading renders. Fetches only call `setState` from promise callbacks.
- **Evidence:** `frontend/app/lib/hooks.js`, `useSceneTokens` in `frontend/app/lib/theme.js`, `reportFresh`/`runsLoading` in `frontend/app/page.js`, `CompareView`, `SettingsDrawer`.

## ADR-015 — 3D is progressive enhancement behind a single canvas
- **Status:** ACCEPTED
- **Date:** 2026-08-15
- **Context:** WebGL must not be a prerequisite for using the product, and the scene must never fight the text above it.
- **Decision:** One `<Canvas>` for the whole app, lazy-loaded, `aria-hidden`, replaced by a token gradient when WebGL is absent, the viewport is ≤860px, or the user turned the canvas off. `prefers-reduced-motion` switches `frameloop` to `demand`, which stops the loop rather than slowing it. Panels use a blurred **and** opaque scrim so contrast never depends on what is behind them.
- **Consequences:** The full journey works with no GPU. Two render paths to keep in step, both covered by E2E.
- **Evidence:** `frontend/app/components/canvas/SceneCanvas.js`, `frontend/e2e/a11y.spec.js`, `frontend/e2e/responsive.spec.js`.

## ADR-014 — One token layer feeds both the DOM and the 3D materials
- **Status:** ACCEPTED
- **Date:** 2026-08-15
- **Context:** Three themes must re-skin the canvas as well as the DOM, but `THREE.Color` cannot parse the `oklch()` values the CSS uses.
- **Decision:** Keep a `--three-*` hex mirror of the semantic ramp inside the same token block. `useSceneTokens()` watches `data-theme` with a `MutationObserver` and re-reads them.
- **Consequences:** Themes stay a token-only diff; the mirror must be updated alongside its CSS twin, which the token table in `project_documentation.md` calls out.
- **Evidence:** `frontend/app/globals.css` §1, `frontend/app/lib/theme.js`.

## ADR-013 — `MOCK_LLM=1` is the process-wide offline mode; `MOCK*` keys remain per-request
- **Status:** ACCEPTED
- **Date:** 2026-08-15
- **Context:** ADR-002's key-prefix trick requires the client to send a fake credential, which no browser-driven E2E should have to do. Test gates must run with no provider, no Ollama and no network.
- **Decision:** `MOCK_LLM=1` forces the fixture pipeline for the whole process, including `web_search()`. Reports are derived from the topic so two runs are byte-identical. `GET /api/health` reports `mock_llm`. The `MOCK*` key path from ADR-002 still works for a single run.
- **Consequences:** Every gate is reproducible from a clean checkout. The flag is read per call, so tests can toggle it with `monkeypatch.setenv`.
- **Evidence:** `mock_llm_enabled`, `mock_report_fixture` in `backend/agent_orchestrator.py`; `_mock_results` in `backend/search_tool.py`; `backend/tests/test_api_contract.py`.

## ADR-012 — Agent knowledge base lives in `.github/` and is maintained with the code
- **Status:** ACCEPTED
- **Date:** 2026-08-01
- **Context:** The repository has real drift between prose docs and code (`project_documentation.md` documents a non-existent test file). Agents need a source of truth they are required to keep current.
- **Decision:** `.github/CLAUDE.md` is the operating guide; `.github/agent/*` holds memory, architecture, entities, graph, errors, decisions, task state, validation and a knowledge changelog. Updating them is step 11 of the mandatory workflow. Existing `frontend/AGENTS.md` and `frontend/CLAUDE.md` are preserved and remain authoritative for Next.js specifics.
- **Consequences:** Small upkeep cost per change; contradictions must be removed rather than appended. Prose docs at the repo root stay user-facing.
- **Evidence:** `.github/CLAUDE.md`, `.github/agent/*`, `frontend/AGENTS.md`.

## ADR-011 — Prompts live in `config/config.yaml`, with one deliberate exception
- **Status:** OBSERVED (rationale inferred)
- **Date:** verified 2026-08-01
- **Context:** Prompt iteration should not require code changes; the product is described as "config-driven".
- **Decision:** All `system_instruction` / `prompt_template` pairs live under `prompts.*` in YAML and are `.format(...)`-ed by the orchestrator. The single exception is the `schema_info` JSON block appended to the fact-checker prompt, which is kept in Python next to the `BusinessReport` model so the schema description cannot drift from the model.
- **Consequences:** Prompt edits need no deploy; a placeholder added to YAML without a matching `.format` kwarg raises `KeyError` at runtime. Schema changes must be made in both `BusinessReport` and `schema_info`.
- **Evidence:** `config/config.yaml`, `run_market_research` in `backend/agent_orchestrator.py`.

## ADR-010 — Two-tier light/heavy model routing
- **Status:** OBSERVED
- **Date:** verified 2026-08-01
- **Context:** Four research drafts dominate token volume; planning, synthesis and audit dominate quality.
- **Decision:** Independent provider + model + API key per tier. Light = Research/Competitor/Pricing/Trend. Heavy = Coordinator/Writer/FactChecker.
- **Consequences:** Users can mix a local Ollama light tier with a cloud heavy tier. Every config path, request model and UI panel is duplicated per tier.
- **Evidence:** `llm_defaults` in `config/config.yaml`, `UIModelConfig`, `run_market_research`, config tab in `frontend/app/page.js`.

## ADR-009 — LiteLLM as the single provider abstraction
- **Status:** OBSERVED
- **Date:** verified 2026-08-01
- **Decision:** All completions go through `litellm.completion` inside `run_litellm_agent`, with `api_base` supplied from `providers.<name>.base_url`.
- **Consequences:** Adding a provider is mostly configuration. Provider-specific quirks must be handled inside `run_litellm_agent` — currently the Bedrock `converse`↔`invoke` fallback and the packed-credential parsing.
- **Evidence:** `backend/agent_orchestrator.py`.

## ADR-008 — Bedrock credentials are packed into one string
- **Status:** OBSERVED
- **Date:** verified 2026-08-01
- **Context:** The UI has one API-key field per tier; Bedrock needs 3–4 values.
- **Decision:** Accept `ACCESS_KEY:SECRET_KEY:REGION[:SESSION_TOKEN]` in the single key field, split it in `run_litellm_agent` and `fetch_models`, set `AWS_*` env vars for boto3 and restore them in `finally`. Model ids become `bedrock/{converse|invoke}/{region}/{model}`.
- **Consequences:** No UI change per provider, but the format is undiscoverable outside the placeholder text, and env mutation is process-global for the duration of the call.
- **Evidence:** `run_litellm_agent`, `_bedrock_model_id`, `fetch_models`, Bedrock placeholders in `frontend/app/page.js`.

## ADR-007 — Filesystem as the only persistence layer
- **Status:** OBSERVED
- **Date:** verified 2026-08-01
- **Decision:** `reports/<task_id>/{meta,progress,report}.json` plus `logs/<date>/*.log`. No database.
- **Consequences:** Zero infrastructure; `GET /api/runs` is an O(n) directory scan; `progress.json` is rewritten whole under a lock per entry; nothing survives a container restart; multi-instance deployment is unsafe.
- **Evidence:** `backend/main.py`, `log_progress`, `.gitignore`.

## ADR-006 — SSE first, polling as fallback
- **Status:** OBSERVED
- **Date:** verified 2026-08-01
- **Decision:** `GET /api/runs/{id}/stream` pushes a `snapshot` then incremental `progress` events from an in-process subscriber registry; the client falls back to 1.5 s polling of `/progress` on SSE error.
- **Consequences:** Low-latency UI without extra infrastructure, but subscriber state is per-process (single worker only) and queues are bounded at 64 with drop-on-overflow.
- **Evidence:** `stream_progress`, `_sse_subscribers`, `connectSSE` / `startPollingProgress`.

## ADR-005 — Cooperative, between-stage cancellation
- **Status:** OBSERVED
- **Date:** verified 2026-08-01
- **Decision:** `cancel_events[task_id]` is an `asyncio.Event` checked at the top of each stage; `POST /cancel` sets it and immediately writes a `cancelled` entry for instant UI feedback.
- **Consequences:** An in-flight LLM call still completes and is still billed. New stages must add their own check.
- **Evidence:** `cancel_events`, `cancel_run`.

## ADR-004 — Generic HTTP errors, detailed session logs
- **Status:** OBSERVED
- **Date:** verified 2026-08-01
- **Decision:** Handlers log the full traceback via `log_session_async(..., "FAILURE", ...)` and return a short generic `HTTPException` detail. The pipeline never propagates to the client; it writes a `failed` progress entry instead.
- **Consequences:** No internal detail leaks to the browser; debugging requires the session log. Keep the two channels separate when adding handlers.
- **Evidence:** `trigger_research`, `save_config`, outer `except` in `run_market_research`.

## ADR-003 — Fact-checker output is coerced, then validated, with a fallback
- **Status:** OBSERVED
- **Date:** verified 2026-08-01
- **Context:** LLMs return lists/objects/`null` where the schema wants strings, and often wrap JSON in code fences.
- **Decision:** Strip ``` fences, coerce lists to `- item` lines and dicts to Markdown sections, `None` to `""`, then validate with `BusinessReport`. If validation still fails, write a fallback report built from the intermediate drafts and mark the run `success`.
- **Consequences:** The UI always has renderable strings and users always get a report; a silent quality drop is possible — the parse error is recorded in `critique_notes`.
- **Evidence:** `run_market_research` fact-checker block.

## ADR-002 — `MOCK`-prefixed API keys enable offline dry runs
- **Status:** OBSERVED
- **Date:** verified 2026-08-01
- **Decision:** Any resolved key starting with `MOCK` installs a `litellm.completion` wrapper returning canned stage-appropriate responses; non-mock keys delegate to the real function.
- **Consequences:** Full pipeline testing with no tokens and no network — the primary validation path in this repo. The patch is never uninstalled (see `ERROR_LOG.md` L7), and the mock exists in two places (L8).
- **Evidence:** `setup_litellm_mock_local`, `setup_litellm_mock`.

## ADR-001 — Single container serves API and statically exported UI
- **Status:** OBSERVED
- **Date:** verified 2026-08-01
- **Context:** Hugging Face Spaces runs one container on one port.
- **Decision:** Build the Next.js app with `output: 'export'` in a `node:20-alpine` stage, copy `frontend/out` into a `python:3.11-slim` runtime, and mount it with `StaticFiles(html=True)` at `/` **after** all API routes. Serve on port 7860 as UID 1000.
- **Consequences:** One deployable, no CORS in production, and the client resolves `API_BASE` to its own origin. Cost: no server-side rendering, no Next.js route handlers, no image optimisation; new API routes must be declared before the mount.
- **Evidence:** `Dockerfile`, `frontend/next.config.mjs`, static mount at the bottom of `backend/main.py`, `README.md` front-matter.
