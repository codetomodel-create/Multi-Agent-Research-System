# ERROR_LOG.md

Failures encountered while working in this repository, newest first. Read before retrying anything that has failed before; append an entry for **every** build, runtime, test or provider failure.

Entry template:

```markdown
## YYYY-MM-DD — <short title>
- **Context:** what was being attempted
- **Symptom:** exact error text / observed behaviour
- **Root cause:** verified cause, with file reference
- **Fix:** what resolved it
- **Prevention:** rule or check that stops a repeat
- **Status:** resolved | open | mitigated
```

---

## 2026-08-15 — Perf HUD occluded the "3D canvas" checkbox
- **Context:** Playwright performance gate, "the canvas releases its WebGL context when switched off".
- **Symptom:** `locator.uncheck` retried for 60 s: `<dt>draw calls</dt> from <div class="perf-hud"> subtree intercepts pointer events`.
- **Root cause:** `.perf-hud` was pinned to `left: var(--sp-4)`, i.e. directly over the rail footer where the canvas toggle and theme switcher live.
- **Fix:** `left: calc(var(--rail-width) + var(--sp-8))` so the HUD clears the rail, plus `pointer-events: none` on its `<dl>` readout.
- **Prevention:** Fixed overlays must be positioned relative to a layout token, never a bare spacing token, and the E2E suite exercises every rail control.
- **Status:** resolved

## 2026-08-15 — Cancel-mid-run E2E was inherently flaky
- **Context:** `e2e/resilience.spec.js`, cancelling a run from the telemetry view.
- **Symptom:** `isVisible()` returned true, then `click()` hung for the full 60 s timeout — the button had unmounted because the run finished first.
- **Root cause:** The fixture pipeline completes in <100 ms, so "running" is not a state the browser can reliably observe.
- **Fix:** Added `MOCK_LLM_DELAY_MS` (ADR-017) and set it to 600 in the Playwright web-server env; the test now asserts unconditionally instead of guarding with `isVisible()`.
- **Prevention:** Never guard an E2E assertion with `if (await x.isVisible())` — make the state deterministic instead.
- **Status:** resolved

## 2026-08-15 — `getByText` strict-mode violations from duplicated copy
- **Context:** Cancel and reading-mode E2E specs.
- **Symptom:** `strict mode violation: resolved to 2 elements` — the toast title "Cancellation signal sent" also appears in the log line "Cancellation signal sent. Aborting…"; the "Read" button collided with a toast's `Dismiss: Report ready`.
- **Root cause:** Substring matching across a UI that deliberately echoes the same message in two places.
- **Fix:** `{ exact: true }` on both, and assert *both* occurrences for cancel, since the log entry is itself part of the contract.
- **Prevention:** Prefer role + exact name; treat a strict-mode violation as a signal that two surfaces genuinely say the same thing.
- **Status:** resolved

## 2026-08-15 — `TestClient.__init__() got an unexpected keyword argument 'app'`
- **Context:** First run of `pytest backend/tests` on a clean install.
- **Symptom:** Every test using the `client` fixture errored in `starlette/testclient.py:399`.
- **Root cause:** `requirements.txt` floored FastAPI at `0.104.0`; pip resolved `fastapi 0.104.1` + `starlette 0.27.0`, which passes `app=` to `httpx.Client` — removed in `httpx 0.28`.
- **Fix:** Raised the floor to `fastapi>=0.115.0` (resolves `starlette 1.6.0`).
- **Prevention:** The floor is commented in `backend/requirements.txt` pointing at this entry.
- **Status:** resolved

## 2026-08-15 — React Compiler lint rejected the whole first frontend draft
- **Context:** `npm run lint` after landing the 3D shell.
- **Symptom:** 21 errors: `set-state-in-effect`, `Cannot call impure function during render` (`Math.random()` inside `useMemo`), `Cannot access refs during render` (`useRef(new THREE.Vector3()).current`), `This value cannot be modified` (mutating a memoised material).
- **Root cause:** Patterns that were idiomatic pre-React-19: mount-effect hydration, random values in memo bodies, ref-as-instance-variable read during render, imperative material mutation.
- **Fix:** External stores for browser state (ADR-016); a seeded LCG for the starfield; module-level `THREE.Vector3` constants; materials declared in JSX so R3F owns them.
- **Prevention:** Never silence these rules — they map onto real hydration and disposal bugs in a static export.
- **Status:** resolved

## 2026-08-01 — Environment probe: `python` / `python3` not on PATH (Windows git-bash)
- **Context:** Verifying toolchain versions during the initial repository survey.
- **Symptom:** `bash: python: command not found`, `bash: python3: command not found`; `node --version` piped through `sed` printed `stdout is not a tty`.
- **Root cause:** Only the Windows `py` launcher (`C:\Windows\py.exe`) is installed; the `python.exe` shim is absent from PATH. Node's version output misbehaves when piped inside this shell.
- **Fix:** Use `py` (reports Python 3.11.0) and run `node --version` unpiped.
- **Prevention:** All Windows command examples in `CLAUDE.md` §4 and `VALIDATION.md` use `py` / `backend\.venv\Scripts\`.
- **Status:** resolved

---

## Known latent defects (verified by inspection, not yet triggered)

These are real code-level issues found while reading the source. They are recorded here so no agent "discovers" them twice. None has an owner yet.

### L1 — UI stage `Refining` is never emitted
- **Evidence:** `frontend/app/page.js` stepper lists `Refining`; `backend/agent_orchestrator.py` only emits `Queue`, `Researching`, `Critique`, `Polishing`.
- **Effect:** Step 4 never activates; the progress bar appears to skip.
- **Fix options:** remove the step from the UI, or emit a `Refining` stage in the pipeline. Requires updating `getActiveStageIndex()` and `AgentOrb`'s `orbToStage` map.
- **Status:** open

### L2 — `httpx` and `boto3` are undeclared dependencies
- **Evidence:** `backend/model_fetcher.py` imports `httpx` at module scope and `boto3` inside a guarded `try`; `backend/requirements.txt` lists neither.
- **Effect:** `httpx` happens to be present transitively via `litellm`; a future litellm release could break imports. `POST /api/models` with `provider=bedrock` raises `RuntimeError: boto3 is required…` in the Docker image.
- **Fix:** add `httpx` to `requirements.txt`; add `boto3` (or document Bedrock listing as unsupported).
- **Status:** open

### L3 — Unvalidated `task_id` used in filesystem paths
- **Evidence:** `get_progress`, `stream_progress`, `get_report`, `cancel_run`, `delete_run` in `backend/main.py` do `os.path.join(REPORTS_DIR, task_id)`; `delete_run` then calls `shutil.rmtree`.
- **Effect:** Path traversal — a crafted `task_id` can read or delete directories outside `reports/`.
- **Fix:** validate with `uuid.UUID(task_id)` (or a strict regex) and reject with 404/400 before touching the filesystem.
- **Status:** open — **do not add new `task_id`-derived path code without validation**

### L4 — CORS wildcard combined with credentials
- **Evidence:** `CORSMiddleware(allow_origins=["*"], allow_credentials=True, ...)` in `backend/main.py`.
- **Effect:** Invalid/unsafe combination per the CORS spec; browsers reject credentialed wildcard responses and the intent is unclear.
- **Fix:** restrict origins to the known frontend origins, or drop `allow_credentials`.
- **Status:** open

### L5 — API keys persisted in plaintext
- **Evidence:** `POST /settings` writes `light_api_key` / `heavy_api_key` / `api_key` to `backend/config.json`; the UI also stores them in `localStorage`.
- **Effect:** Credentials readable by anyone with filesystem or XSS access. The file is git-ignored, which limits leak-to-VCS risk only.
- **Fix:** encrypt at rest or stop persisting keys server-side.
- **Status:** mitigated (git-ignored + masked in logs) / open

### L6 — `features.web_search` in `config/config.yaml` is unreachable
- **Evidence:** `trigger_research` always sets `resolved_config["enable_web_search"] = req.enable_web_search` (default `True`); the YAML fallback in `run_market_research` only applies when the value is `None`.
- **Effect:** Disabling search in YAML has no effect for API-initiated runs.
- **Fix:** only override when the request field is explicitly provided.
- **Status:** open

### L7 — `setup_litellm_mock_local()` patches `litellm.completion` permanently
- **Evidence:** `backend/agent_orchestrator.py`; the original function is captured in a closure but never restored.
- **Effect:** After one `MOCK*` run, every completion in that process goes through the wrapper. It delegates for non-mock keys, so behaviour is correct, but repeated activation nests wrappers.
- **Fix:** guard with a module-level `_mock_installed` flag or restore in a context manager.
- **Status:** open

### L8 — Duplicate mock implementation
- **Evidence:** `setup_litellm_mock_local()` in `backend/agent_orchestrator.py` and `setup_litellm_mock()` in `backend/test_orchestrator.py` are near-identical with different canned payloads.
- **Effect:** Drift risk when the report schema changes.
- **Fix:** have the test script reuse the orchestrator's mock.
- **Status:** open

### L9 — `datetime.utcnow()` deprecation
- **Evidence:** used in `backend/main.py` and `backend/agent_orchestrator.py`.
- **Effect:** `DeprecationWarning` on Python ≥ 3.12; the image pins 3.11 so nothing breaks today.
- **Fix:** `datetime.now(timezone.utc)`.
- **Status:** open

### L10 — Documentation drift in `project_documentation.md`
- **Evidence:** documents `backend/test_live_apis.py` (absent), omits `backend/model_fetcher.py`, SSE, cancel/delete endpoints and the anthropic/bedrock providers; contains absolute `/Users/apple/...` paths.
- **Effect:** Agents relying on it make false statements.
- **Fix:** correct sections as they are touched; never cite it as evidence.
- **Status:** open

### L11 — Unused 3D dependencies in the frontend
- **Evidence:** `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing` in `frontend/package.json`; no source import (only a CSS comment in `globals.css`).
- **Effect:** Larger install and audit surface for no benefit.
- **Fix:** remove the dependencies, or actually use them in `AgentOrb`.
- **Status:** open

### L12 — Dead credential lookup keys `light_api_api_key` / `heavy_api_api_key`
- **Evidence:** `run_market_research` in `backend/agent_orchestrator.py` resolves `config_data.get("light_api_api_key") or config_data.get("light_api_key") or config_data.get("api_key")` (same for heavy). Nothing ever writes `*_api_api_key`.
- **Effect:** Harmless today — the second lookup wins — but the typo suggests an intended key name and will confuse the next reader.
- **Fix:** drop the first lookup.
- **Status:** open

### L13 — Declared-but-unused config and request fields
- **Evidence:** `python-dotenv` is in `backend/requirements.txt` but never imported; `features.streaming_ui` in `config/config.yaml` is never read; `ResearchRequest.config_overrides` is declared in `backend/main.py` and never consumed.
- **Effect:** False expectations — there is no `.env` loading and no server-side streaming toggle.
- **Fix:** remove them, or implement the intended behaviour.
- **Status:** open
