# MEMORY.md — Durable repository facts

Verified facts, invariants and gotchas that survive across tasks. Every line carries its source.
Read at the start of every task. Add a line when something is verified; delete a line when it becomes false.

Last verified: 2026-08-01 · commit `f23c06e`.

---

## Invariants (breaking these breaks the product)

- **Config precedence is `config/config.yaml` → `backend/config.json` → `GEMINI_API_KEY` → request body.** Implemented in `get_base_yaml_config()` / `get_resolved_config()` / `trigger_research()` in `backend/main.py`. Do not re-implement it elsewhere.
- **All agent prompts live in `config/config.yaml` under `prompts.*`** with `system_instruction` + `prompt_template`. The orchestrator only calls `.format(...)` on them. Placeholders in use: `{topic}`, `{search_results}`, `{draft_general}`, `{draft_competitor}`, `{draft_pricing}`, `{draft_trend}`, `{compiled_report}`. Adding a placeholder to YAML without adding the kwarg to `.format()` raises `KeyError` at runtime.
- **`log_progress(run_dir, stage, status, message, task_id)` is the only writer of `progress.json`** and the only trigger of SSE `progress` events. Always pass `task_id`, otherwise SSE clients see nothing.
- **Every LLM call goes through `run_litellm_agent()`** in `backend/agent_orchestrator.py`. It offloads to a thread executor, handles the Bedrock converse/invoke fallback, and restores mutated `AWS_*` env vars in `finally`.
- **Secrets never reach disk unmasked in logs.** `write_session_log` always runs `scrub_sensitive_data` on input (and on output for SUCCESS). Masking format is `first6...last4`; keys ≤ 8 chars become `****`.
- **`main.py` must not import LLM logic and `agent_orchestrator.py` must not import FastAPI.** Current import direction: `main → agent_orchestrator → {observability, search_tool}`, `main → model_fetcher`, `main → observability`.
- **The static mount is registered last** (`app.mount("/", StaticFiles(...))` at the bottom of `backend/main.py`) so API routes win. Adding routes after the mount makes them unreachable.

## Runtime behaviour

- Pipeline order: Coordinator (heavy) → 4 light agents **in parallel** via `asyncio.gather` → Writer (heavy) → FactChecker (heavy, `response_format={"type":"json_object"}`).
- Stages actually emitted: `Queue`, `Researching`, `Critique`, `Polishing`, plus `Setup`/`Startup` on early failure. **`Refining` is never emitted** even though `frontend/app/page.js` renders it as step 4.
- Statuses: `running`, `completed`, `success`, `failed`, `cancelled` (`queued` only in the `POST /research` response; `unknown` only in `GET /api/runs` when no progress file exists).
- Cancellation is cooperative: `cancel_events[task_id].is_set()` is checked **between stages only**, so an in-flight LLM call still completes.
- `cancel_events[task_id]` is deleted at the end of `run_market_research`; `POST /api/runs/{id}/cancel` on a finished task returns `{"status": "ignored"}` with HTTP 200.
- Mock mode triggers when the resolved `api_key` starts with `MOCK`. `setup_litellm_mock_local()` **permanently monkey-patches `litellm.completion` for the process** — a later real run in the same process still routes through the wrapper (it delegates to the original when the key is not `MOCK*`, so it works, but the patch is never removed).
- Web search: `enable_web_search` on the request always wins because `trigger_research` assigns it unconditionally; `features.web_search` in YAML is only consulted when the value is `None`.
- When search is disabled the orchestrator injects literal placeholder strings ("Web search is disabled…") into `{search_results}`.
- `web_search()` never raises — it returns an error string that is fed into the prompt.
- SSE: `subscribe_sse` per client, `asyncio.Queue(maxsize=64)`, events dropped on overflow, `: keepalive` comment every 30 s of silence, stream closes on `success` / `failed` / `cancelled` or `report_ready`.
- The client tries SSE first and falls back to 1.5 s polling of `/api/runs/{task_id}/progress` on `onerror` (`connectSSE` in `frontend/app/page.js`).
- Model lists are cached in-process for 300 s keyed by provider + first 8 chars of the key (`backend/model_fetcher.py`).
- Bedrock model id is built as `bedrock/{converse|invoke}/{region}/{model}`; `invoke` is used for prefixes `amazon.titan-`, `ai21.`, `cohere.`, `stability.`. Region is parsed from the packed key `ACCESS:SECRET:REGION[:TOKEN]`, defaulting to `us-east-1`.

## Gotchas

- Run backend commands **from the repository root**: imports are `backend.*` and `backend/` has no `__init__.py` (implicit namespace package).
- `WORKSPACE_DIR` defaults to the parent of `backend/`. In Docker it is `/app`. Anything computing paths must respect it.
- `backend/config.json` is git-ignored and often absent — code must tolerate its absence (it already does).
- `reports/` and `logs/` are git-ignored and are created on demand; they are not persisted between container restarts.
- `frontend/out` only exists after `npm --prefix frontend run build`; without it, `/` returns 404 from the API server.
- `API_BASE` in `frontend/app/lib/api.js` resolves to `http://localhost:8000` only for ports 3000/3001; every other origin talks to itself.
- Report JSON is coerced before validation: lists become `- item` lines, dicts become Markdown sections, `None` becomes `""`. If `BusinessReport(**data)` still fails, a fallback report is written and the run is still marked `success`.
- `test_orchestrator.py` writes to `./reports/test_litellm_run` relative to the **current working directory** and deletes it first.
- `python-dotenv` is declared but never imported — there is no `.env` loading. `features.streaming_ui` and `ResearchRequest.config_overrides` are likewise declared and never consumed.
- Per-tier key resolution starts with a typo'd lookup (`light_api_api_key` / `heavy_api_api_key`) that nothing ever writes; the effective chain is `<tier>_api_key or api_key or ""`.
- `httpx` is imported directly by `backend/model_fetcher.py` but is not in `requirements.txt` (available transitively via `litellm`). `boto3` is optional and guarded; Bedrock listing raises `RuntimeError` without it.
- `three` / `@react-three/*` now back the single shared `<Canvas>` in `frontend/app/components/canvas/`. The old hand-written `AgentOrb.js` SVG and `StatsCard3D.js` were removed in the 2026-08-15 rebuild.
- `datetime.utcnow()` is used in `backend/main.py` and `backend/agent_orchestrator.py`; deprecated on Python ≥ 3.12.
- `project_documentation.md` was rewritten on 2026-08-15 and is current: it carries the full API contract table, the design-token reference, `MOCK_LLM` usage and the 3D fallback story.
- Offline mode has two entry points: `MOCK_LLM=1` (process-wide, used by every gate) and a `MOCK*` API key (single run). `MOCK_LLM_DELAY_MS` adds artificial latency so mid-run UI states are reachable.
- `fastapi>=0.115` is a hard floor — older Starlette cannot build a `TestClient` against `httpx>=0.28`.

## Security notes (known debt — never widen)

- CORS is `allow_origins=["*"]` with `allow_credentials=True` in `backend/main.py`.
- API keys are stored in browser `localStorage` (`mr_light_api_key`, `mr_heavy_api_key`) and written in plaintext to `backend/config.json` by `POST /settings`.
- `task_id` path parameters are joined into filesystem paths without validation in `get_progress`, `stream_progress`, `get_report`, `cancel_run` and `delete_run` (`shutil.rmtree`). **Validate as UUID before any new filesystem use.**
- Error responses are intentionally generic; tracebacks go only to the session log.

## Environment (this workstation, 2026-08-01)

- Python 3.11.0 via the `py` launcher (`python`/`python3` are not on PATH in git-bash).
- Node v22.20.0, npm 11.6.2, Docker 29.6.2.
- `backend/.venv` and `frontend/node_modules` are **not** present — install before running anything.
