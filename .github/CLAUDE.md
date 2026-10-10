# CLAUDE.md — Agent Operating Guide

Primary control file for AI coding agents working in this repository.
Every statement here was verified against the source at the time of writing. If code and this file disagree, **the code is correct** — fix this file in the same change.

Last verified: 2026-08-01 · against commit `f23c06e` (branch `main`).

---

## 1. Repository identity

| Field | Value |
| --- | --- |
| Name | Multi-Agent-Research-System (product name: **AI Market Research Assistant**, UI brand "MarketAgent") |
| Purpose | Turn a single business idea + target location into a structured, C-suite market-intelligence report using a sequential multi-agent LLM pipeline |
| Repo type | Polyglot monorepo: Python FastAPI backend + Next.js static frontend, shipped as one Docker image |
| License | MIT (`LICENSE`) |
| Deploy target | Hugging Face Spaces (`sdk: docker` front-matter in `README.md`, port `7860`), or any container host |

### Business objectives
- Produce premium, structured business reports (executive summary, market overview, competitors, SWOT, recommendations, critique log) without manual analyst effort.
- Minimise LLM cost: cheap "light" models do the four research drafts; expensive "heavy" models do planning, synthesis and audit.
- Zero-backend-cost credential model: the user brings their own API key, stored in the browser.

### Technical objectives
- **Config-driven**: every agent prompt lives in `config/config.yaml`, not in Python.
- **Provider-agnostic**: all LLM calls go through `litellm`, so Ollama / OpenAI / Gemini / DeepSeek / Qwen / Anthropic / AWS Bedrock are interchangeable at runtime.
- **Observable**: every API call and agent invocation is written to a date-partitioned session log with secrets masked.
- **Non-blocking**: blocking work (LLM calls, web search, file logging) is pushed off the FastAPI event loop.

### Users / consumers
- End users: founders/analysts using the web UI (Dashboard, New Research, LLM Providers, Tracker, Report tabs).
- Machine consumers: the Next.js client calls the JSON REST API + SSE stream; any HTTP client can do the same.

### Supported platforms and runtimes
- Python **3.11** (Docker base `python:3.11-slim`; `py --version` on this workstation reports 3.11.0).
- Node **20** in the Docker build stage; Node **22.20.0** / npm **11.6.2** present locally. Next.js 16 requires Node ≥ 20.
- OS: developed on macOS/Linux paths; runs on Windows (use `py` and `backend\.venv\Scripts\`). Docker 29.6.2 available locally.
- Optional local dependency: Ollama on `http://localhost:11434` for the default zero-key configuration.

### Maturity and known limitations
Working project with an enforced test gauntlet (161 backend tests, 34 Playwright E2E tests). No CI wiring yet, no database.

1. **Tests are the contract.** `pytest backend/tests` covers every API row; `npm --prefix frontend run test:e2e` runs journey, resilience, a11y, performance and responsive layers against a real server with `MOCK_LLM=1`. Run both before claiming a change works. `backend/test_orchestrator.py` remains as a manual script and is *not* the gate.
2. **Gate order matters.** `frontend/out` is what the backend serves, so re-run `npm --prefix frontend run build` after any frontend change *before* the E2E suite.
3. **`fastapi>=0.115` is a hard floor.** Older Starlette cannot construct a `TestClient` against `httpx>=0.28`; the whole suite errors out. See `ERROR_LOG.md` 2026-08-15.
4. **Undeclared runtime deps are fixed** — `httpx` and `boto3` are now in `backend/requirements.txt`, but `boto3` is still absent from the Docker image, so Bedrock listing fails there.
5. **The token layer is the only place colours live.** `frontend/app/globals.css` §1. Themes re-map semantic tokens; the `--three-*` hex mirrors must be updated alongside their CSS twins or the canvas drifts from the DOM.
6. **Never suppress the React Compiler lint rules.** Browser state is read through `useSyncExternalStore`, and loading states are derived, precisely so no suppression is needed (ADR-016).
7. **`features.web_search: false` in `config/config.yaml` is effectively dead** — `POST /research` always sets `enable_web_search` from the request (default `true`), so the YAML flag is only reachable when the field is `None`.
8. **Security debt (do not copy these patterns):** API keys are accepted in request bodies and persisted in plaintext to `backend/config.json`, and stored in browser `localStorage`. CORS is now an explicit allow-list with credentials disabled, and `task_id` is validated against `^[A-Za-z0-9_-]{1,64}$` and resolved inside `REPORTS_DIR` before any filesystem access — **keep it that way in new code.**
9. **State is filesystem-only.** `reports/` and `logs/` are git-ignored and ephemeral inside a container; there is no persistence layer.
10. `datetime.utcnow()` is used throughout and is deprecated on Python ≥ 3.12.

---

## 2. Technology stack

### Backend (`backend/`)
| Concern | Choice | Where |
| --- | --- | --- |
| Language | Python 3.11 | `Dockerfile` |
| Web framework | FastAPI + Pydantic v2 | `backend/main.py` |
| ASGI server | Uvicorn | `Dockerfile` CMD |
| LLM gateway | `litellm>=1.40.0` | `backend/agent_orchestrator.py` |
| Config format | YAML (`pyyaml`) + JSON overrides | `config/config.yaml`, `backend/config.json` |
| Web search | `duckduckgo-search` (`DDGS().text`) | `backend/search_tool.py` |
| HTTP client | `httpx.AsyncClient` (pooled singleton) | `backend/model_fetcher.py` |
| AWS SDK | `boto3` (optional, import guarded) | `backend/model_fetcher.py` |
| Package manager | `pip` + `backend/requirements.txt` | — |

Declared dependencies: `fastapi>=0.104.0`, `uvicorn>=0.24.0`, `pydantic>=2.5.0`, `pyyaml>=6.0.1`, `litellm>=1.40.0`, `duckduckgo-search`, `python-dotenv>=1.0.0`.

### Frontend (`frontend/`)
| Concern | Choice |
| --- | --- |
| Framework | Next.js **16.2.7**, App Router, `output: 'export'` (static export → `frontend/out`) |
| UI runtime | React **19.2.4** / react-dom 19.2.4 |
| Icons | `lucide-react` ^1.17.0 |
| Styling | Single hand-written stylesheet `frontend/app/globals.css` (CSS custom properties, `oklch()` colours, 3 themes) |
| Lint | ESLint 9 flat config + `eslint-config-next` |
| Package manager | `npm` (`frontend/package-lock.json` committed) |

> `frontend/AGENTS.md` (mirrored by `frontend/CLAUDE.md`) warns that this Next.js version has breaking changes versus older training data — **read `frontend/node_modules/next/dist/docs/` before writing Next.js-specific code.** That rule still applies and is not superseded by this file.

### Datastores / external services
- **No database, no queue, no cache server.** Durable state is JSON on disk under `reports/<task_id>/` and text logs under `logs/<YYYY-MM-DD>/`. In-process caches only: `backend/model_fetcher.py` `_model_cache` (5-minute TTL), `backend/agent_orchestrator.py` `_sse_subscribers` and `cancel_events`.
- **External services:** LLM providers via LiteLLM (`ollama`, `openai`, `deepseek`, `gemini`, `qwen`, `anthropic`, `bedrock`), provider model-list endpoints, DuckDuckGo search.
- Provider base URLs live in `config/config.yaml` → `providers.*.base_url`.

---

## 3. Repository structure

```
.
├── Dockerfile                     # 2-stage build: Next.js static export → Python 3.11 runtime (port 7860)
├── README.md                      # HF Spaces front-matter + short intro (partially stale)
├── project_documentation.md       # Long-form spec (PARTIALLY STALE — see §1 limitations)
├── project_documentation.docx     # Binary duplicate of the above; do not hand-edit
├── LICENSE
├── .gitignore / .dockerignore     # ignore logs/, reports/, backend/config.json, node_modules/, out/
├── config/
│   └── config.yaml                # SOURCE OF TRUTH: environment, feature flags, model defaults,
│                                  # provider base URLs, and ALL agent prompts
├── backend/
│   ├── main.py                    # FastAPI app: routes, config resolution, SSE endpoint, static mount
│   ├── agent_orchestrator.py      # Pipeline, LiteLLM invocation, progress log, SSE registry, mock mode
│   ├── model_fetcher.py           # Provider model-list fetchers + TTL cache + shared httpx client
│   ├── observability.py           # IST session logging, secret masking, thread-offloaded writes
│   ├── search_tool.py             # DuckDuckGo wrapper
│   ├── test_orchestrator.py       # Manual end-to-end script (not pytest)
│   └── requirements.txt
├── frontend/
│   ├── app/layout.js              # Root layout + metadata
│   ├── app/page.js                # ENTIRE UI: one client component, 5 tabs (~1.3k lines)
│   ├── app/globals.css            # Design tokens + 3 themes (dark / light / solarized)
│   ├── app/components/AgentOrb.js # SVG pipeline visualisation
│   ├── app/components/StatsCard3D.js
│   ├── AGENTS.md / CLAUDE.md      # Next.js-16-specific agent rules (keep in force)
│   ├── next.config.mjs            # output: 'export', images.unoptimized
│   └── eslint.config.mjs, jsconfig.json (`@/*` alias)
└── .github/
    ├── CLAUDE.md                  # ← this file
    └── agent/                     # durable agent knowledge base (§6)
```

### Entry points
| Entry point | Command / file |
| --- | --- |
| Backend HTTP API | `backend.main:app` (ASGI) — run from **repository root**, `backend` is an implicit namespace package (no `__init__.py`); imports are absolute (`from backend.x import y`) |
| Pipeline entry | `run_market_research(topic, config_data, task_id, run_dir, session_id)` in `backend/agent_orchestrator.py` |
| Frontend | `frontend/app/page.js` (`export default function Home`) |
| Manual E2E script | `backend/test_orchestrator.py` (`python backend/test_orchestrator.py` from repo root) |
| Container | `Dockerfile` → `uvicorn backend.main:app --host 0.0.0.0 --port 7860` |

### Configuration locations (resolution order, last wins)
1. `config/config.yaml` → `llm_defaults`, `providers`, `features`, `environment`, `prompts`.
2. `backend/config.json` — UI overrides written by `POST /settings`. **Git-ignored, may not exist, contains plaintext keys.**
3. Environment: `GEMINI_API_KEY` (seeds `api_key`), `WORKSPACE_DIR` (root for `config/`, `reports/`, `logs/`, `frontend/out`), `PORT` (declared in `Dockerfile`; the CMD hard-codes 7860).
4. Per-request body: `ui_model_config` (preferred) or legacy `config` on `POST /research`.

Resolution code: `get_base_yaml_config()` → `get_resolved_config()` → `trigger_research()` in `backend/main.py`.

### Tests
`backend/test_orchestrator.py` only. There is no `tests/` directory and no test runner configured.

### Generated / do-not-hand-edit
- `frontend/out/`, `frontend/.next/`, `frontend/node_modules/` (git-ignored build output).
- `frontend/package-lock.json` — change only via `npm install`.
- `reports/**`, `logs/**` — runtime output.
- `backend/config.json` — written by the API.
- `project_documentation.docx` — binary; if content changes, update `project_documentation.md`.

### Where agent knowledge lives
| File | Contains |
| --- | --- |
| `.github/CLAUDE.md` | This guide: identity, stack, structure, workflow, rules, standards |
| `.github/agent/MEMORY.md` | Durable facts, invariants and gotchas that survive across tasks |
| `.github/agent/ARCHITECTURE.md` | Layers, request/pipeline flows, concurrency and deployment model |
| `.github/agent/ENTITIES.md` | Every named data structure, its fields, owner module and consumers |
| `.github/agent/KNOWLEDGE_GRAPH.md` | Nodes (modules/entities/endpoints) and typed edges between them |
| `.github/agent/ERROR_LOG.md` | Failures encountered, root cause, fix, prevention |
| `.github/agent/DECISIONS.md` | ADR-style durable decisions with rationale and consequences |
| `.github/agent/TASK_STATE.md` | Current in-flight task: plan, progress, blockers |
| `.github/agent/VALIDATION.md` | Verified commands and which to run for which change type |
| `.github/agent/CHANGELOG.md` | History of changes to this knowledge base |

---

## 4. Development workflow

All commands assume the **repository root** as the working directory. Windows uses the `py` launcher; POSIX equivalents are given where they differ. Full matrix with expected output: `.github/agent/VALIDATION.md`.

### Install
```powershell
# Backend (Windows PowerShell / cmd)
py -3.11 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install --upgrade pip
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt

# Frontend
npm --prefix frontend install
```
```bash
# POSIX equivalent
python3 -m venv backend/.venv && source backend/.venv/bin/activate
pip install --upgrade pip && pip install -r backend/requirements.txt
npm --prefix frontend install
```
If you touch `backend/model_fetcher.py` Bedrock paths, also `pip install boto3` — it is not in `requirements.txt`.

### Environment configuration
- No `.env` file is committed and none is required. `python-dotenv` is a declared dependency but is **not imported anywhere** — do not assume `.env` loading happens.
- Optional: `GEMINI_API_KEY` (default `api_key`), `WORKSPACE_DIR` (override repo root), `AWS_*` (set transiently by `run_litellm_agent` for Bedrock and restored in its `finally` block).
- Zero-key default path: run Ollama locally and keep `llama3.1:8b` for both tiers.
- Offline/dry run: set any API key to a value starting with `MOCK` (e.g. `MOCK_KEY`) — `setup_litellm_mock_local()` patches `litellm.completion` and returns canned responses.

### Run locally
```powershell
backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
npm --prefix frontend run dev      # second terminal → http://localhost:3000
```
- API: `http://localhost:8000`, Swagger: `http://localhost:8000/docs`.
- The client picks its API base in `frontend/app/page.js`: ports `3000`/`3001` → `http://localhost:8000`; anything else → `window.location.origin` (the single-container case).

### Build
```powershell
npm --prefix frontend run build     # emits frontend/out (static export)
docker build -t market-research .   # full image; serves API + static UI on 7860
docker run --rm -p 7860:7860 market-research
```
`backend/main.py` mounts `frontend/out` at `/` **only if the directory exists**, and the mount is registered last so API routes keep precedence.

### Test
```powershell
backend\.venv\Scripts\python.exe backend\test_orchestrator.py
```
Runs config load → web search → full pipeline into `./reports/test_litellm_run`. Without `GEMINI_API_KEY` it self-activates the LiteLLM mock. Success criteria: `report.json` created and printed title/summary.
There is no `pytest` target yet — see "Testing" in §7 for what to do when adding tests.

### Lint / format
```powershell
npm --prefix frontend run lint      # eslint (flat config)
```
No Python linter or formatter is configured (no ruff/black/flake8 config in the repo). Match the surrounding style; do not introduce a formatter as a side effect of an unrelated change.

### Migrations
None — there is no database. "Schema changes" here mean changing `BusinessReport` in `backend/agent_orchestrator.py` **and** the inline `schema_info` prompt block next to it **and** the report tabs in `frontend/app/page.js`. All three must move together.

### Debugging
- Pipeline trace: `reports/<task_id>/progress.json` (also streamed over SSE) — stages, statuses, messages.
- Full agent I/O: `logs/<YYYY-MM-DD>/localuser_<session_id>.log` (IST timestamps, secrets masked).
- Server logs: `logging.basicConfig(level=logging.INFO)` in `backend/main.py`; orchestrator mirrors every progress entry via `logger.info`.
- Client: the Tracker tab shows the live console; SSE failures fall back to 1.5 s polling of `/api/runs/{task_id}/progress`.
- Reproduce without spending tokens: use a `MOCK`-prefixed key.

### Deployment
Hugging Face Spaces via Docker (`sdk: docker` in `README.md` front-matter, `EXPOSE 7860`, user UID 1000). Any container host works. `logs/` and `reports/` are created with `chmod 777` in the image because the runtime user is non-root; they are **not** persistent volumes.

---

## 5. Agent operating rules (mandatory)

Follow this loop for **every** coding task in this repository.

1. **Read `.github/CLAUDE.md`** (this file) first.
2. **Read the relevant files under `.github/agent/`** — at minimum `MEMORY.md`; add `ARCHITECTURE.md` for cross-module work, `ENTITIES.md`/`KNOWLEDGE_GRAPH.md` for data or contract changes, `ERROR_LOG.md` before re-attempting anything that failed before, `DECISIONS.md` before changing an established pattern.
3. **Inspect the implementation before assuming.** Open the actual file. This repo has real drift between prose docs and code (§1). Never cite `project_documentation.md` as evidence.
4. **Identify blast radius**: which entities, modules, endpoints, prompts, graph edges and UI panes are affected. Contract changes almost always span `config/config.yaml` ↔ `backend/agent_orchestrator.py` ↔ `backend/main.py` ↔ `frontend/app/page.js`.
5. **Create or update `.github/agent/TASK_STATE.md`** with goal, plan, affected files and validation plan before editing code.
6. **Make the smallest complete change.** No opportunistic refactors, no drive-by reformatting, no new abstractions for single call sites.
7. **Add or update tests.** Until a runner exists, extend `backend/test_orchestrator.py` and state explicitly in your summary what is *not* covered.
8. **Run the validation commands** that match the change type (`.github/agent/VALIDATION.md`). Never claim a command passed without running it.
9. **Record failures in `.github/agent/ERROR_LOG.md`** — symptom, root cause, fix, prevention. One entry per distinct failure, newest first.
10. **Record durable decisions in `.github/agent/DECISIONS.md`** — anything a future agent could otherwise "fix" by mistake.
11. **Update knowledge files when repository knowledge changes:**
    - new/changed data structure → `ENTITIES.md` (+ `KNOWLEDGE_GRAPH.md` edges)
    - new module, flow or dependency → `ARCHITECTURE.md` + `KNOWLEDGE_GRAPH.md`
    - new invariant, gotcha or verified fact → `MEMORY.md`
    - new/changed command → `VALIDATION.md` + §4 of this file
    - anything that invalidates a statement in this file → edit this file and bump "Last verified"
    - every knowledge-base edit → one line in `CHANGELOG.md`
12. **Summarise**: what changed, which validations ran and their result, remaining risks, which documentation files were updated. Then clear or archive `TASK_STATE.md`.

### Hard rules
- Never commit or print real API keys. Never remove masking in `backend/observability.py`.
- Never edit generated artefacts (§3).
- Never widen CORS, auth or filesystem access as a side effect. If you touch a `task_id`-derived path, validate it as a UUID first.
- Never add a dependency without adding it to `backend/requirements.txt` or `frontend/package.json`.
- Prompts belong in `config/config.yaml`, not in Python string literals — the one deliberate exception is the `schema_info` block in `run_market_research` (see `DECISIONS.md`).
- Respect `frontend/AGENTS.md`: verify Next.js 16 APIs against `frontend/node_modules/next/dist/docs/` before using them.

---

## 6. Knowledge base usage (`.github/agent/`)

| File | Read when | Write when | Format |
| --- | --- | --- | --- |
| `MEMORY.md` | Start of every task | A durable fact/invariant/gotcha is learned or invalidated | Bulleted facts, each with a source file |
| `ARCHITECTURE.md` | Cross-module or flow changes | A layer, flow, dependency or deployment detail changes | Sections + mermaid diagrams |
| `ENTITIES.md` | Any data/contract change | A structure, field, status value or storage file changes | One table per entity |
| `KNOWLEDGE_GRAPH.md` | Impact analysis before edits | A module/endpoint/entity relationship is added or removed | Node list + typed edge list + mermaid |
| `ERROR_LOG.md` | Before retrying a known-risky action | Any failure (build, runtime, test, provider) occurs | Newest-first entries: symptom / cause / fix / prevention |
| `DECISIONS.md` | Before changing an established pattern | A durable decision is made or superseded | ADR: context / decision / consequences / status |
| `TASK_STATE.md` | Start and resumption of a task | Before editing code, after each milestone, at completion | Goal / plan / progress / blockers / validation |
| `VALIDATION.md` | Before running checks | A command is added, changed or found unreliable | Command table + change-type matrix |
| `CHANGELOG.md` | Rarely — for history | Every knowledge-base edit | `YYYY-MM-DD — file — change` |

Keep every file short enough to read in full. Prefer deleting stale lines over appending contradictions.

---

## 7. Coding standards

### Naming
- **Python**: `snake_case` functions/variables, `PascalCase` Pydantic models, `_leading_underscore` for module-private helpers (`_notify_sse`, `_get_client`, `_progress_lock`), `UPPER_SNAKE` for module constants (`WORKSPACE_DIR`, `BEDROCK_INVOKE_PREFIXES`, `_CACHE_TTL`).
- **API payloads**: `snake_case` JSON keys (`light_provider`, `task_id`, `enable_web_search`). Headers use `X-Session-ID` (matched case-insensitively as `x-session-id`).
- **Agent names in logs**: `PascalCase` + `Agent` suffix (`CoordinatorAgent`, `ResearchAgent`, `FactCheckerAgent`); the API layer logs as `API Layer`.
- **Pipeline stages**: capitalised singular words — `Queue`, `Researching`, `Critique`, `Polishing` (plus `Setup`/`Startup` on early failure).
- **Statuses**: lowercase — `running`, `completed`, `success`, `failed`, `cancelled`, `queued`, `unknown`.
- **React**: `PascalCase` components/files, `camelCase` state and handlers with a `handle` prefix for event handlers. Browser storage keys are prefixed `mr_` (`mr_theme`, `mr_light_provider`, `mr_session_id`).
- **CSS**: kebab-case classes (`glass-panel`, `report-tab-btn`), tokens as `--primary`, `--accent`, `--secondary`.

### Module boundaries
- `main.py` = HTTP/transport only: request models, config resolution, task directory creation, response shaping. It must not contain LLM logic.
- `agent_orchestrator.py` = pipeline + LiteLLM + progress/SSE emission. It must not import FastAPI.
- `model_fetcher.py` = outbound provider metadata calls + cache. Pure functions over HTTP/boto3.
- `observability.py` = logging and masking only. No business logic.
- `search_tool.py` = one function, `web_search`, returning a formatted string; it swallows its own exceptions by design.
- Direction of dependency is strictly `main.py → agent_orchestrator.py → {observability, search_tool}` and `main.py → model_fetcher.py`. Do not create back-edges.
- Frontend: all state and API calls live in `frontend/app/page.js`; `app/components/*` are presentational and take props only.

### Error handling
- Route handlers catch broadly, log the full traceback through `log_session_async(..., scenario="FAILURE", ...)`, then raise `HTTPException` with a **generic user-facing message** — internal detail must not leak into HTTP responses. Preserve this split.
- Re-raise `HTTPException` unchanged in `except HTTPException:` blocks before the generic handler (see `trigger_research`).
- Status semantics already in use: `400` bad input, `404` unknown task, `202` report not ready yet, `500` internal/failed run, `502` upstream provider failure.
- The pipeline lets agent exceptions propagate to the outer `try` in `run_market_research`, which writes a `failed` progress entry; it never re-raises to the caller (it runs as a background task).
- `FactCheckerAgent` JSON parsing has a deliberate fallback structure instead of failing the run — keep that behaviour.
- Cancellation uses `asyncio.CancelledError` raised from explicit `cancel_events[task_id].is_set()` checks between stages; add a check at the top of any new stage.

### Logging
- Two channels, both required for new agent/API work:
  1. `logger` (stdlib `logging`) for operator-facing lines.
  2. `await log_session_async(api_name, agent_name, session_id, input_data, scenario, output_or_error_data)` for the auditable session log — `scenario` is exactly `"SUCCESS"` or `"FAILURE"`.
- User-visible pipeline state goes through `log_progress(run_dir, stage, status, message, task_id)`; always pass `task_id` so SSE subscribers receive the event.
- Never `print()` in backend modules (`test_orchestrator.py` is the one exception).
- All secret-bearing payloads must pass through `scrub_sensitive_data` — that happens automatically inside `write_session_log`; do not log raw request bodies elsewhere.
- Timestamps: session logs use IST via `get_ist_time()`; progress/meta entries use ISO-8601 UTC.

### Configuration and secrets
- Read config through `get_resolved_config()` / `load_yaml_config()`; never re-implement the precedence chain.
- Keys arrive per-request; treat them as tainted, never echo them back unmasked (`get_config` masks as `first6...last4`).
- Bedrock credentials use the packed form `ACCESS_KEY:SECRET_KEY:REGION[:SESSION_TOKEN]`; environment mutation for boto3 must be restored in a `finally` block, as `run_litellm_agent` already does.

### Async and threading
- Anything blocking (LiteLLM completion, DuckDuckGo search, file writes) must be offloaded: `loop.run_in_executor(None, ...)` or `asyncio.to_thread(...)`.
- Shared mutable state is guarded by module-level `threading.Lock`s: `_progress_lock` (progress.json), `_log_lock` (log file append), `_sse_lock` (subscriber registry). Take the lock for the shortest possible span; never `await` while holding one.
- SSE queues are bounded (`maxsize=64`) and drop on overflow — do not switch to unbounded queues.

### Frontend standards
- `frontend/app/page.js` starts with `"use client"`; keep new interactive code in client components. The build is a **static export** — no server components with runtime data, no API routes, no `next/image` optimisation (`images.unoptimized: true`).
- Use `API_BASE` for every fetch; never hardcode `http://localhost:8000`.
- Send `X-Session-ID` on mutating requests so backend logs stay correlated.
- Style via existing classes and CSS variables in `globals.css`; inline styles only for one-off layout, as the current code does.
- Keep the three themes working — anything added must resolve through `--*` tokens under `:root`, `[data-theme="light"]` and `[data-theme="solarized"]`.

### Testing
- Minimum bar today: extend `backend/test_orchestrator.py` and run it with the mock key so the change is exercised end-to-end offline.
- If you introduce `pytest`, add it to `backend/requirements.txt`, put tests under `backend/tests/`, keep them offline by default (mock key / no network), and update §4, `VALIDATION.md` and `DECISIONS.md` in the same change.
- Any change to `BusinessReport`, the `schema_info` prompt, or a progress `stage` value must be verified through a full mock pipeline run plus a UI check of the affected tab.

### Documentation
- Code changes that alter behaviour must update, in the same change: this file (if §1–§4 statements change), the relevant `.github/agent/` files, and `README.md` only if user-facing setup changed.
- `project_documentation.md` is a narrative document with known drift; correct it only when your change touches the section in question, and never treat it as a source of truth.
