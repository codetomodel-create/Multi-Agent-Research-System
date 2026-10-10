# VALIDATION.md

Verified commands and which ones to run for which kind of change. All commands assume the **repository root** as the working directory.
Windows examples use the `py` launcher because `python` is not on PATH on this workstation (see `ERROR_LOG.md`, 2026-08-01).

Last verified: 2026-08-15 · Python 3.11.0 · Node v22.20.0 · npm 11.6.2.

---

## 0. Gate matrix (run in this order)

| # | Gate | Command | Result 2026-08-15 |
| --- | --- | --- | --- |
| G1 | Frontend lint | `npm --prefix frontend run lint` | PASS — 0 errors, 0 warnings |
| G2 | Frontend build | `npm --prefix frontend run build` | PASS — static export written to `frontend/out` |
| G3 | Backend unit + API contract | `py -m pytest backend/tests -q` | PASS — 149 passed |
| G4 | E2E journey | `npm --prefix frontend run test:e2e -- journey.spec.js` | PASS — 9 |
| G5 | E2E resilience | `… resilience.spec.js` | PASS — 8 |
| G6 | E2E accessibility | `… a11y.spec.js` | PASS — 10 (axe: 0 critical/serious in all 3 themes) |
| G7 | E2E performance | `… performance.spec.js` | PASS — 4 |
| G8 | E2E responsive | `… responsive.spec.js` (mobile project) | PASS — 3 |

`npm --prefix frontend run test:e2e` runs G4–G8 together (34 tests). The harness starts its
own `uvicorn` with `MOCK_LLM=1`, `MOCK_LLM_DELAY_MS=600` and `REPORTS_DIR=./.e2e-reports`,
so it needs no provider credentials, no Ollama and no network, and never touches `reports/`.

**Prerequisite for G2 and G4–G8:** `frontend/out` must be current — the backend serves the
static export, so re-run G2 after any frontend change before running E2E.

---

## 1. Command reference

| # | Purpose | Windows | POSIX | Expected result |
| --- | --- | --- | --- | --- |
| V1 | Create venv | `py -3.11 -m venv .venv` | `python3 -m venv .venv` | `.venv` exists |
| V2 | Install backend deps | `py -m pip install -r backend\requirements-dev.txt` | same via `python3` | fastapi ≥ 0.115, uvicorn, pydantic, pyyaml, litellm, duckduckgo-search, httpx, boto3, pytest |
| V3 | Import smoke test | `py -c "import backend.main"` | same | no traceback (must run from repo root) |
| V4 | Run API | `py -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload` | same | `Application startup complete`; `/docs` reachable |
| V5 | Offline pipeline run | `set MOCK_LLM=1` then V4, POST `/api/research` | `MOCK_LLM=1 py -m uvicorn …` | `report.json` appears; deterministic fixture content |
| V6 | Install frontend deps | `npm --prefix frontend install` | same | `frontend/node_modules` created |
| V7 | Install E2E browser | `npx --prefix frontend playwright install chromium` | same | chromium downloaded |
| V8 | Frontend dev server | `npm --prefix frontend run dev` | same | serves `http://localhost:3000`, talks to `:8000` |
| V9 | Frontend build | `npm --prefix frontend run build` | same | static export in `frontend/out` |
| V10 | Frontend lint | `npm --prefix frontend run lint` | same | eslint exits 0 |
| V11 | Backend tests | `py -m pytest backend/tests -q` | same | 149 passed |
| V12 | E2E suite | `npm --prefix frontend run test:e2e` | same | 34 passed |
| V13 | Single-origin run | V9, then V4 | same | UI at `http://localhost:8000`, API on the same origin |
| V14 | Health probe | `curl http://localhost:8000/api/health` | same | `{"status":"ok",…,"mock_llm":false}` |
| V15 | Runs listing | `curl http://localhost:8000/api/runs` | same | JSON array with `status`, `duration_ms`, `tokens`, `cost_usd` |
| V16 | Progress / SSE smoke | `curl http://localhost:8000/api/runs/<id>/progress` · `curl -N …/stream` | same | progress JSON with `stages`+`totals`; SSE emits `snapshot` then `progress` |
| V17 | Export smoke | `curl "http://localhost:8000/api/runs/<id>/export?format=markdown"` | same | Markdown with all six section headings |
| V18 | Compare smoke | `curl "http://localhost:8000/api/runs/compare?a=<id1>&b=<id2>"` | same | `{a,b,sections[]}` |
| V19 | Secret masking check | run V5, inspect the newest file under `logs/<YYYY-MM-DD>/` | same | keys appear as `first6...last4`, never in full |
| V20 | Container build | `docker build -t market-research .` | same | image built (frontend stage + python stage) |
| V21 | Container run | `docker run --rm -p 7860:7860 market-research` | same | UI on `http://localhost:7860` |
| V22 | Perf HUD | open `http://localhost:8000/?perf=1` | same | fps / draw calls / heap readout with a Low·Med·High switch |

Notes:
- V3–V5 must be run from the repository root — `backend/` is an implicit namespace package.
- Bedrock model listing needs `boto3`, which is in `requirements.txt` but **not** in the container image.
- `fastapi>=0.115` is a hard floor; older Starlette breaks `TestClient` against `httpx>=0.28`.

## 2. What to run for which change

| Change type | Minimum validation |
| --- | --- |
| Backend logic (`main.py`, `agent_orchestrator.py`) | V3, V5, V4 + V12/V13 |
| Report schema (`BusinessReport`, `schema_info`) | V5, then V4 + V14 and open the report tabs in the UI |
| Prompts (`config/config.yaml`) | V5 (catches `.format` `KeyError`) |
| Stage or status values | V5 + V4 + V15, and check the Tracker stepper in the UI |
| New/changed endpoint | V3, V4, targeted `curl`, plus the UI call site |
| `model_fetcher.py` / providers | V4 + `POST /api/models` for each affected provider |
| Observability / masking | V5 or V14, then V16 |
| Backend dependency change | fresh V1+V2, then V3, V5, then V10 |
| Frontend logic or styles | V6, V9, V8, plus a manual pass over the affected tab in all three themes |
| Frontend dependency change | V6, V9, V8, V10 |
| Dockerfile / deployment | V10 then V11, confirm the UI loads at `/` and `/api/runs` responds |
| Docs only (`.github/**`, `README.md`) | No commands; re-read the cited source files and confirm every claim |

## 3. Manual UI checklist (when the frontend changes)

1. Dashboard renders stat cards and run history; Sync refreshes.
2. LLM Providers tab: switching provider updates the model list; entering a key triggers a live fetch (or falls back silently).
3. New Research: launching switches to Tracker; the stepper advances; the log console streams.
4. Cancel and Delete act on the right run and the list updates.
5. Report tabs (Summary, Market, SWOT, Critique, Raw JSON) all render; Download Markdown produces a file.
6. All three themes (dark / light / solarized) remain legible.

## 4. Reporting results

Record each command and its outcome in the `TASK_STATE.md` validation table as `pass` / `fail` / `not run`. Never report a command as passing unless it was actually executed in this session.
