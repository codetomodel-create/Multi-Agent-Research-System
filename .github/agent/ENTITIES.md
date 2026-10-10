# ENTITIES.md — Named structures and their contracts

Every data structure an agent may need to change, with owner module and consumers. Verified against commit `f23c06e` on 2026-08-01.
Update this file **and** `KNOWLEDGE_GRAPH.md` whenever a field, status value or storage file changes.

---

## 1. API request models (`backend/main.py`, Pydantic v2)

### `TaskModelConfig`
| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `provider` | `str` | yes | `ollama` / `openai` / `deepseek` / `gemini` / `qwen` / `anthropic` / `bedrock` |
| `model` | `str` | yes | Provider model name, e.g. `llama3.1:8b` |
| `api_key` | `str \| None` | no | Raw key; Bedrock packs `ACCESS:SECRET:REGION[:TOKEN]` |

### `UIModelConfig`
| Field | Type | Meaning |
| --- | --- | --- |
| `light_task` | `TaskModelConfig` | Research / Competitor / Pricing / Trend agents |
| `heavy_task` | `TaskModelConfig` | Coordinator / Writer / FactChecker agents |

### `SettingsSaveRequest` (body of `POST /settings`)
All fields optional: `light_provider`, `light_model`, `light_api_key`, `heavy_provider`, `heavy_model`, `heavy_api_key`, plus legacy `api_key`, `light_model_legacy`, `heavy_model_legacy`. Only truthy values are merged into `backend/config.json`; unset fields preserve existing values.

### `ResearchRequest` (body of `POST /research`)
| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `idea` | `str \| None` | `None` | Business idea; combined with `location` as `"{idea} in {location}"` |
| `location` | `str \| None` | `None` | Target market |
| `enable_web_search` | `bool` | `true` | Always overrides `features.web_search` in YAML |
| `config_overrides` | `dict[str,str] \| None` | `None` | Accepted but currently unused by the handler |
| `ui_model_config` | `UIModelConfig \| None` | `None` | Preferred model/key channel |
| `topic` | `str \| None` | `None` | Legacy direct topic |
| `business_idea` | `str \| None` | `None` | Legacy alias of `idea` |
| `config` | `SettingsSaveRequest \| None` | `None` | Legacy override channel; `provider/model` strings are split on `/` |

Topic resolution order: `topic` → `idea + location` → `business_idea + location` → `idea` → `business_idea`; empty result ⇒ HTTP 400.

### `ModelFetchRequest` (body of `POST /api/models`)
`provider` (required), `api_key`, `aws_access_key_id`, `aws_secret_access_key`, `region`, `aws_session_token`, `base_url` (Ollama, default `http://localhost:11434`).

---

## 2. Domain model

### `BusinessReport` (`backend/agent_orchestrator.py`) — the report contract
All fields are `str` and all are required.

| Field | Rendered in UI tab |
| --- | --- |
| `topic` | header tag |
| `title` | report header |
| `executive_summary` | Executive Summary |
| `market_overview` | Market & Competitors |
| `competitor_analysis` | Market & Competitors |
| `swot_analysis` | SWOT Analysis |
| `strategic_recommendations` | Executive Summary (bulleted) |
| `critique_notes` | Critique & Refinements |

Change protocol — all four in one change:
1. `BusinessReport` fields.
2. The inline `schema_info` JSON block in `run_market_research` (the prompt the model must satisfy).
3. Coercion field list in `run_market_research` (list → `- item`, dict → Markdown, `None` → `""`).
4. Report tabs and the Markdown export in `frontend/app/page.js`.

On validation failure a fallback dict with the same keys is written and the run is still reported as `success`.

---

## 3. On-disk entities

### `reports/<task_id>/meta.json`
| Field | Written by | Notes |
| --- | --- | --- |
| `task_id` | `trigger_research` | `str(uuid.uuid4())` |
| `topic` | `trigger_research` | Resolved topic |
| `created_at` | `trigger_research` | `datetime.utcnow().isoformat()` |
| `light_model` | `trigger_research`, then rewritten by `run_market_research` | Initially `provider/model`; the orchestrator rewrites it with the final LiteLLM id (Bedrock gains `converse|invoke` + region) |
| `heavy_model` | same | same |
| `status` | **not stored** | Injected by `GET /api/runs` from `progress.json` |

### `reports/<task_id>/progress.json`
```jsonc
{ "status": "running", "logs": [ { "timestamp": "<ISO UTC>", "stage": "Queue",
  "status": "running", "message": "…" } ] }
```
Top-level `status` always mirrors the last appended entry. Written only by `log_progress` (and by `cancel_run` for immediate UI feedback).

### `reports/<task_id>/report.json`
Serialised `BusinessReport` (or the fallback dict). Presence is what `GET .../report` checks; absence ⇒ HTTP 202.

### `logs/<YYYY-MM-DD>/<user>_<session_id>.log`
Text records: header (IST time · API · agent · session) → `INPUT DATA` (scrubbed) → `SCENARIO` (`SUCCESS`|`FAILURE`) → `OUTPUT DATA`|`ERROR DATA`. File name is `localuser_<session_id>.log` when `environment` ∈ {`dev`,`local`,`development`}, otherwise `<osuser>_<session_id>.log`.

### `backend/config.json` (git-ignored)
Flat merge target for `POST /settings`: `light_provider`, `light_model`, `light_api_key`, `heavy_provider`, `heavy_model`, `heavy_api_key`, `api_key`. Plaintext keys.

---

## 4. Configuration entity (`config/config.yaml`)

| Key | Shape | Consumed by |
| --- | --- | --- |
| `environment` | `dev` \| other | `observability.get_log_filepath` |
| `features.web_search` | bool | `run_market_research` (only when the request value is `None`) |
| `features.streaming_ui` | bool | declared; not read by any module |
| `llm_defaults.{light,heavy}_{provider,model}` | str | `get_resolved_config`, `run_market_research` |
| `providers.<name>.base_url` | str | `get_api_base` → `api_base` kwarg for LiteLLM |
| `prompts.<agent>.system_instruction` | str template | orchestrator, `.format(topic=…)` |
| `prompts.<agent>.prompt_template` | str template | orchestrator, `.format(...)` |

Prompt keys in use: `coordinator`, `research_agent`, `competitor_agent`, `pricing_agent`, `trend_agent`, `writer_agent`, `fact_checker_agent`.

---

## 5. Agents

| Agent (log name) | Tier | Stage | Prompt key | Inputs → Output |
| --- | --- | --- | --- | --- |
| `CoordinatorAgent` | heavy | `Queue` | `coordinator` | topic → 1-sentence plan |
| `ResearchAgent` | light | `Researching` | `research_agent` | topic + search results → market overview draft |
| `CompetitorAgent` | light | `Researching` | `competitor_agent` | topic + search results → competitor draft |
| `PricingAgent` | light | `Researching` | `pricing_agent` | topic + search results → pricing draft |
| `TrendAgent` | light | `Researching` | `trend_agent` | topic + search results → trends draft |
| `WriterAgent` | heavy | `Critique` | `writer_agent` | 4 drafts → compiled report |
| `FactCheckerAgent` | heavy | `Polishing` | `fact_checker_agent` | compiled report + `schema_info` → `BusinessReport` JSON |
| `API Layer` | n/a | n/a | n/a | Pseudo-agent name used for HTTP-level session logs |

---

## 6. Enumerations

| Enumeration | Values | Source |
| --- | --- | --- |
| Stage | `Queue`, `Researching`, `Critique`, `Polishing`, `Setup`, `Startup` | `agent_orchestrator` |
| Stage (UI stepper) | `Queue`, `Researching`, `Critique`, **`Refining`** (never emitted), `Polishing` | `frontend/app/page.js` |
| Status | `running`, `completed`, `success`, `failed`, `cancelled`, `queued`, `unknown` | `agent_orchestrator`, `main` |
| SSE event `type` | `snapshot`, `progress`, `report_ready` | `main.stream_progress`, `agent_orchestrator._notify_sse` |
| Log scenario | `SUCCESS`, `FAILURE` | `observability.write_session_log` |
| Providers (backend `/api/models`) | `openai`, `anthropic`, `gemini`, `ollama`, `bedrock`, `deepseek`, `qwen` | `main.fetch_models` |
| Providers (YAML base URLs) | `ollama`, `openai`, `deepseek`, `gemini`, `qwen`, `bedrock` | `config/config.yaml` |
| Bedrock invoke-API prefixes | `amazon.titan-`, `ai21.`, `cohere.`, `stability.` | `BEDROCK_INVOKE_PREFIXES` |
| Themes | `dark`, `light`, `solarized` | `globals.css`, `page.js` |

---

## 7. Browser storage keys (`frontend/app/page.js`)

| Key | Store | Value |
| --- | --- | --- |
| `mr_theme` | localStorage | active theme |
| `mr_light_provider` / `mr_light_model` / `mr_light_api_key` | localStorage | light tier config |
| `mr_heavy_provider` / `mr_heavy_model` / `mr_heavy_api_key` | localStorage | heavy tier config |
| `mr_session_id` | sessionStorage | `sess_<5 chars>`, sent as `X-Session-ID` |

---

## 8. In-memory registries (`backend/agent_orchestrator.py`, `backend/model_fetcher.py`)

| Name | Type | Lifetime | Guard |
| --- | --- | --- | --- |
| `cancel_events` | `dict[str, asyncio.Event]` | per run, deleted at pipeline end | none (single-threaded event loop) |
| `_sse_subscribers` | `dict[str, list[asyncio.Queue]]` | per connected client | `_sse_lock` |
| `_model_cache` | `dict[str, tuple[float, list]]` | 300 s TTL | none |
| `_http_client` | `httpx.AsyncClient` singleton | process | recreated if closed |
