import os
import re
import json
import logging
import time
import traceback
import threading
import yaml
from datetime import datetime, timezone
import asyncio
from typing import Optional
from backend.observability import log_session_async
import litellm
from pydantic import BaseModel
from backend.search_tool import web_search

logger = logging.getLogger(__name__)


def utc_now_iso() -> str:
    """Timezone-aware UTC timestamp so browsers do not read it as local time."""
    return datetime.now(timezone.utc).isoformat()


# Structured model output schema
class BusinessReport(BaseModel):
    topic: str
    title: str
    executive_summary: str
    market_overview: str
    competitor_analysis: str
    swot_analysis: str
    strategic_recommendations: str
    critique_notes: str

_TRUTHY = {"1", "true", "yes", "on"}


def mock_llm_enabled() -> bool:
    """``MOCK_LLM=1`` forces the deterministic fixture pipeline process-wide.

    Read on every call rather than cached at import so tests and the E2E
    harness can flip it with ``monkeypatch.setenv`` / a restarted server.
    """
    return os.getenv("MOCK_LLM", "").strip().lower() in _TRUTHY


def mock_llm_delay_seconds() -> float:
    """Artificial per-call latency for the fixture pipeline.

    Without it a mock run finishes in under a tenth of a second, which makes
    every mid-run state (cancel, live progress, stalled stream) unreachable
    from an end-to-end test. Defaults to 0 so unit tests stay fast.
    """
    try:
        return max(0.0, float(os.getenv("MOCK_LLM_DELAY_MS", "0"))) / 1000.0
    except ValueError:
        return 0.0


def _is_mock_key(api_key: str | None) -> bool:
    return bool(api_key) and str(api_key).startswith("MOCK")


def mock_report_fixture(topic: str) -> dict:
    """Deterministic report used by ``MOCK_LLM=1`` and ``MOCK*`` API keys.

    Values are derived from the topic only, so two runs of the same topic
    produce byte-identical reports and E2E assertions can be exact.
    """
    return {
        "topic": topic,
        "title": f"C-Suite Strategic Outlook: {topic}",
        "executive_summary": (
            f"{topic} is expanding steadily across every measured segment. "
            "Demand is concentrated in urban clusters while supply remains "
            "fragmented, leaving room for a focused operator to take share.\n\n"
            "Capital intensity is moderate and the regulatory picture is stable, "
            "so the dominant risk is execution rather than market timing."
        ),
        "market_overview": (
            f"The addressable market for {topic} is projected to compound at "
            "11% annually through 2030, driven by policy support, falling unit "
            "costs and a broadening customer base.\n\n"
            "Growth is not uniform: the premium tier grows fastest in absolute "
            "revenue while the value tier grows fastest in volume."
        ),
        "competitor_analysis": (
            "Three incumbents hold roughly 48% of the market between them, "
            "competing on distribution rather than product.\n\n"
            "A long tail of regional specialists holds the remainder and is "
            "consolidating, which compresses the window for organic entry."
        ),
        "swot_analysis": (
            "Strengths: durable demand, low switching friction, favourable "
            "incentive regime.\n\n"
            "Weaknesses: thin operating margins, dependence on a small supplier "
            "base.\n\n"
            "Opportunities: underserved secondary cities, subscription pricing, "
            "adjacent service revenue.\n\n"
            "Threats: incumbent price response, input cost volatility, "
            "regulatory change at the municipal level."
        ),
        "strategic_recommendations": (
            "1. Enter through a single beachhead segment and win it outright "
            "before broadening.\n"
            "2. Lock multi-year supply agreements to insulate margin.\n"
            "3. Price on value with a subscription tier to stabilise revenue.\n"
            "4. Instrument unit economics from day one and review monthly."
        ),
        "critique_notes": (
            "Fixture pipeline (MOCK_LLM). SWOT cross-checked against the market "
            "overview; competitor share figures reconciled; recommendations "
            "traced back to a stated weakness or opportunity."
        ),
    }


# Fixed per-stage token counts keep MOCK_LLM cost/token readouts deterministic.
_MOCK_USAGE = {"prompt_tokens": 512, "completion_tokens": 256, "total_tokens": 768}


class _MockMessage:
    def __init__(self, content):
        self.content = content


class _MockChoice:
    def __init__(self, content):
        self.message = _MockMessage(content)


class _MockUsage(dict):
    """Usage object that answers both attribute and mapping access."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.__dict__.update(kwargs)


class _MockResponse:
    def __init__(self, content):
        self.choices = [_MockChoice(content)]
        self.usage = _MockUsage(**_MOCK_USAGE)
        self.model = "mock/fixture"


# The fact-checker prompt embeds the topic as "...draft report for '<topic>'";
# recovering it keeps the fixture report tied to what the user actually asked for.
_MOCK_TOPIC_RE = re.compile(r"draft report for ['\"]([^'\"]{1,200})['\"]")


def _mock_content_for(prompt: str, model: str, kwargs: dict) -> str:
    """Chooses the canned response that matches the requesting agent."""
    if "structured schema" in prompt or "MUST output valid JSON" in prompt or kwargs.get("response_format"):
        found = _MOCK_TOPIC_RE.search(prompt)
        return json.dumps(mock_report_fixture(found.group(1).strip() if found else "the requested market"))
    if "Compile these four research drafts" in prompt:
        return "Consolidated draft covering general, competitor, pricing and trend findings."
    if "Initiate the research phases" in prompt:
        return "Coordinator Planning Completed: Launching 4 parallel search branches."
    return f"Draft research generated for the requested parameters using model {model}."


# The offline mock replaces ``litellm.completion`` process-wide, so the real
# implementation is captured once at import time and the patch is applied at
# most once. Re-applying it would wrap the mock in itself on every request.
_ORIGINAL_COMPLETION = litellm.completion
_mock_installed = False


def setup_litellm_mock_local():
    global _mock_installed
    if _mock_installed:
        return
    original_completion = _ORIGINAL_COMPLETION

    def mock_completion(**kwargs):
        api_key = kwargs.get("api_key", "")
        if not (mock_llm_enabled() or _is_mock_key(api_key)):
            return original_completion(**kwargs)

        delay = mock_llm_delay_seconds()
        if delay:
            # Runs on the executor thread, so the event loop keeps serving.
            time.sleep(delay)

        model = kwargs.get("model", "")
        messages = kwargs.get("messages", [])
        prompt = messages[-1]["content"] if messages else ""
        return _MockResponse(_mock_content_for(prompt, model, kwargs))

    litellm.completion = mock_completion
    _mock_installed = True


def teardown_litellm_mock_local():
    """Restores the real LiteLLM completion function (used by tests)."""
    global _mock_installed
    litellm.completion = _ORIGINAL_COMPLETION
    _mock_installed = False

# Config path
WORKSPACE_DIR = os.getenv("WORKSPACE_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG_FILE = os.path.join(WORKSPACE_DIR, "config", "config.yaml")

def load_yaml_config() -> dict:
    """Loads default configuration from config.yaml."""
    if not os.path.exists(CONFIG_FILE):
        raise FileNotFoundError(f"Configuration file not found at: {CONFIG_FILE}")
    with open(CONFIG_FILE, "r") as f:
        return yaml.safe_load(f)

_progress_lock = threading.Lock()
cancel_events: dict[str, asyncio.Event] = {}

# ── SSE subscriber registry ──────────────────────────────────────────────────
# Maps task_id → list[asyncio.Queue].  Each connected SSE client gets a queue.
_sse_subscribers: dict[str, list[asyncio.Queue]] = {}
_sse_lock = threading.Lock()


def _notify_sse(task_id: str, event_data: dict):
    """Push an event dict to every SSE subscriber for *task_id*."""
    with _sse_lock:
        queues = _sse_subscribers.get(task_id, [])
        for q in queues:
            try:
                q.put_nowait(event_data)
            except asyncio.QueueFull:
                pass  # drop if consumer is too slow


def subscribe_sse(task_id: str) -> asyncio.Queue:
    """Register a new SSE consumer queue for *task_id*."""
    q: asyncio.Queue = asyncio.Queue(maxsize=64)
    with _sse_lock:
        _sse_subscribers.setdefault(task_id, []).append(q)
    return q


def unsubscribe_sse(task_id: str, q: asyncio.Queue):
    """Remove a consumer queue when the SSE connection closes."""
    with _sse_lock:
        queues = _sse_subscribers.get(task_id, [])
        if q in queues:
            queues.remove(q)
        if not queues:
            _sse_subscribers.pop(task_id, None)


# The UI stepper renders stages in this order; a stage absent from the run
# still gets a "pending" row so the timeline never reflows mid-run.
PIPELINE_STAGES = ["Queue", "Researching", "Critique", "Polishing"]

# Terminal statuses for a stage — anything else keeps the stage "running".
_STAGE_END_STATUSES = {"completed", "success", "failed", "cancelled"}


def _blank_stage(name: str) -> dict:
    return {
        "name": name,
        "status": "pending",
        "started_at": None,
        "ended_at": None,
        "duration_ms": None,
        "tokens": 0,
        "cost_usd": 0.0,
    }


def _empty_progress(task_id: str | None = None, topic: str | None = None) -> dict:
    return {
        "task_id": task_id,
        "topic": topic,
        "status": "running",
        "started_at": utc_now_iso(),
        "updated_at": utc_now_iso(),
        "stages": [_blank_stage(name) for name in PIPELINE_STAGES],
        "totals": {"tokens": 0, "cost_usd": 0.0, "duration_ms": 0},
        "logs": [],
    }


def _ms_between(start_iso: str | None, end_iso: str | None) -> int | None:
    if not start_iso or not end_iso:
        return None
    try:
        delta = datetime.fromisoformat(end_iso) - datetime.fromisoformat(start_iso)
    except ValueError:
        return None
    return max(0, int(delta.total_seconds() * 1000))


def _apply_stage_update(data: dict, entry: dict, usage: dict | None) -> None:
    """Folds one progress entry into the stage table and run totals."""
    stages = data.setdefault("stages", [_blank_stage(n) for n in PIPELINE_STAGES])
    stage = next((s for s in stages if s.get("name") == entry["stage"]), None)
    if stage is None:
        stage = _blank_stage(entry["stage"])
        stages.append(stage)

    if stage["started_at"] is None:
        stage["started_at"] = entry["timestamp"]
    stage["status"] = entry["status"]

    if entry["status"] in _STAGE_END_STATUSES:
        stage["ended_at"] = entry["timestamp"]
        stage["duration_ms"] = _ms_between(stage["started_at"], stage["ended_at"])

    if usage:
        stage["tokens"] = stage.get("tokens", 0) + int(usage.get("total_tokens", 0) or 0)
        stage["cost_usd"] = round(stage.get("cost_usd", 0.0) + float(usage.get("cost_usd", 0.0) or 0.0), 6)

    data["updated_at"] = entry["timestamp"]
    data["totals"] = {
        "tokens": sum(int(s.get("tokens", 0) or 0) for s in stages),
        "cost_usd": round(sum(float(s.get("cost_usd", 0.0) or 0.0) for s in stages), 6),
        "duration_ms": _ms_between(data.get("started_at"), entry["timestamp"]) or 0,
    }


def log_progress(
    run_dir: str,
    stage: str,
    status: str,
    message: str,
    task_id: str | None = None,
    usage: dict | None = None,
):
    """Logs progress of a run to a progress.json file for UI polling and SSE push."""
    progress_file = os.path.join(run_dir, "progress.json")
    os.makedirs(run_dir, exist_ok=True)

    log_entry = {
        "timestamp": utc_now_iso(),
        "stage": stage,
        "status": status,
        "message": message,
    }

    snapshot_stages: list = []
    snapshot_totals: dict = {}
    try:
        with _progress_lock:
            if os.path.exists(progress_file):
                with open(progress_file, "r") as f:
                    data = json.load(f)
            else:
                data = _empty_progress(task_id)

            data.setdefault("logs", []).append(log_entry)
            data["status"] = status
            data.setdefault("started_at", log_entry["timestamp"])
            _apply_stage_update(data, log_entry, usage)
            snapshot_stages = data["stages"]
            snapshot_totals = data["totals"]

            with open(progress_file, "w") as f:
                json.dump(data, f, indent=2)

        logger.info(f"[{stage}] {status}: {message}")
    except Exception as e:
        logger.error(f"Failed to log progress: {e}")

    # Push to any connected SSE clients
    if task_id:
        _notify_sse(task_id, {
            "type": "progress",
            "entry": log_entry,
            "status": status,
            "stages": snapshot_stages,
            "totals": snapshot_totals,
        })

def get_api_base(provider: str, yaml_config: dict) -> Optional[str]:
    """Helper to look up provider base URL from yaml config."""
    providers = yaml_config.get("providers", {})
    provider_config = providers.get(provider, {})
    return provider_config.get("base_url")


def _content_of(response) -> str:
    """Extracts message content, tolerating providers that return null content.

    Gemini safety blocks, tool-only OpenAI replies and some Bedrock models all
    return ``content=None``; returning "" keeps the pipeline on its documented
    degradation path instead of raising AttributeError further downstream.
    """
    try:
        content = response.choices[0].message.content
    except (AttributeError, IndexError, TypeError):
        logger.warning("LLM response had no choices/message; treating as empty.")
        return ""
    if content is None:
        logger.warning("LLM returned null content; treating as empty response.")
        return ""
    return content


def _usage_of(response) -> dict:
    """Extracts token counts and cost, tolerating providers that omit usage."""
    usage = getattr(response, "usage", None)
    if usage is None:
        return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "cost_usd": 0.0}

    def _field(name: str) -> int:
        value = getattr(usage, name, None)
        if value is None and isinstance(usage, dict):
            value = usage.get(name)
        try:
            return int(value or 0)
        except (TypeError, ValueError):
            return 0

    cost = 0.0
    try:
        cost = float(litellm.completion_cost(completion_response=response) or 0.0)
    except Exception:
        # Unknown or mocked models have no price sheet; token counts still stand.
        cost = 0.0

    return {
        "prompt_tokens": _field("prompt_tokens"),
        "completion_tokens": _field("completion_tokens"),
        "total_tokens": _field("total_tokens"),
        "cost_usd": round(cost, 6),
    }


# Injecting AWS credentials into os.environ mutates global process state, so the
# Bedrock path is serialised: the four light agents otherwise run concurrently
# and would restore each other's backups.
_aws_env_lock = asyncio.Lock()

async def run_litellm_agent(
    model: str, 
    system_instr: str, 
    prompt: str, 
    api_key: str, 
    api_base: Optional[str] = None, 
    response_json: bool = False,
    usage_out: Optional[dict] = None,
) -> str:
    """Invokes LiteLLM completion API dynamically.

    ``usage_out`` is filled in place with token counts and cost so concurrent
    agents can each report their own spend without shared mutable state.
    """
    kwargs = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_instr},
            {"role": "user", "content": prompt}
        ],
        "api_key": api_key,
        "temperature": 0.2
    }
    if api_base:
        kwargs["api_base"] = api_base
    if response_json:
        kwargs["response_format"] = {"type": "json_object"}
        
    # Bedrock requires specific kwargs if using raw IAM credentials passed via api_key
    needs_aws_env = bool(model.startswith("bedrock/") and api_key and ":" in api_key
                         and len([p for p in api_key.split(":")]) >= 3)
    if needs_aws_env:
        async with _aws_env_lock:
            return await _invoke_litellm(model, kwargs, api_key, usage_out)
    return await _invoke_litellm(model, kwargs, api_key, usage_out)


async def _invoke_litellm(model: str, kwargs: dict, api_key: str, usage_out: Optional[dict] = None) -> str:
    aws_env_backup = {}
    if model.startswith("bedrock/") and api_key and ":" in api_key:
        # Split on first 3 colons only — session token may itself contain colons
        parts = api_key.split(":", 3)
        if len(parts) >= 3:
            kwargs["aws_access_key_id"] = parts[0].strip()
            kwargs["aws_secret_access_key"] = parts[1].strip()
            # Explicitly set region for LiteLLM (covers both possible param names)
            kwargs["aws_region_name"] = parts[2].strip()
            kwargs["aws_region"] = parts[2].strip()

            # Also set in os.environ to guarantee boto3 picks it up, even if litellm doesn't propagate it
            aws_env_backup["AWS_ACCESS_KEY_ID"] = os.environ.get("AWS_ACCESS_KEY_ID")
            aws_env_backup["AWS_SECRET_ACCESS_KEY"] = os.environ.get("AWS_SECRET_ACCESS_KEY")
            aws_env_backup["AWS_REGION"] = os.environ.get("AWS_REGION")
            aws_env_backup["AWS_DEFAULT_REGION"] = os.environ.get("AWS_DEFAULT_REGION")
            os.environ["AWS_ACCESS_KEY_ID"] = parts[0].strip()
            os.environ["AWS_SECRET_ACCESS_KEY"] = parts[1].strip()
            os.environ["AWS_REGION"] = parts[2].strip()
            os.environ["AWS_DEFAULT_REGION"] = parts[2].strip()

            if len(parts) >= 4:
                # parts[3] is everything after the 3rd colon — the full session token
                kwargs["aws_session_token"] = parts[3].strip()
                aws_env_backup["AWS_SESSION_TOKEN"] = os.environ.get("AWS_SESSION_TOKEN")
                os.environ["AWS_SESSION_TOKEN"] = parts[3].strip()
            # Keep the api_key in kwargs so litellm can parse region and credentials
            
    # Run LiteLLM completion in a separate thread so it doesn't block the async event loop
    loop = asyncio.get_running_loop()
    try:
        response = await loop.run_in_executor(
            None, 
            lambda: litellm.completion(**kwargs)
        )
        if usage_out is not None:
            usage_out.update(_usage_of(response))
        return _content_of(response)
    except Exception as e:
        err_str = str(e)
        # ── Bedrock API path fallback ─────────────────────────────────────
        # If we get UnknownOperationException, it means the model doesn't
        # support the API path we chose (converse vs invoke). Retry with
        # the other path.
        if "UnknownOperationException" in err_str and model.startswith("bedrock/"):
            alt_model = model
            if "/converse/" in model:
                alt_model = model.replace("/converse/", "/invoke/", 1)
            elif "/invoke/" in model:
                alt_model = model.replace("/invoke/", "/converse/", 1)
            else:
                # No explicit path — was using converse by default, try invoke
                alt_model = model.replace("bedrock/", "bedrock/invoke/", 1)
            
            if alt_model != model:
                logger.info(f"Bedrock API path fallback: {model} -> {alt_model}")
                kwargs["model"] = alt_model
                try:
                    response = await loop.run_in_executor(
                        None,
                        lambda: litellm.completion(**kwargs)
                    )
                    if usage_out is not None:
                        usage_out.update(_usage_of(response))
                    return _content_of(response)
                except Exception as retry_err:
                    logger.error(f"Bedrock fallback also failed: {retry_err}")
                    raise retry_err
        
        if "403 Forbidden" in err_str or "Authentication failed" in err_str:
            raise Exception(
                f"Bedrock Authentication Failed (403 Forbidden). "
                f"Check that your Access Key, Secret Key, and Region are correct. "
                f"If using temporary credentials, make sure to include the Session Token: "
                f"ACCESS_KEY:SECRET_KEY:REGION:SESSION_TOKEN. "
                f"Also ensure you have requested Model Access in the AWS Bedrock Console. "
                f"Original error: {err_str}"
            ) from e
        raise e
    finally:
        # Restore environment variables
        if aws_env_backup:
            for k, v in aws_env_backup.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

async def run_market_research(topic: str, config_data: dict, task_id: str, run_dir: str, session_id: Optional[str] = None):
    """Runs the sequential multi-agent research pipeline using LiteLLM."""
    if not session_id:
        import uuid
        session_id = f"sess_{uuid.uuid4().hex[:5]}"

    # Register cancellation event
    cancel_events[task_id] = asyncio.Event()

    # 1. Load config prompts and templates from config.yaml
    try:
        yaml_config = load_yaml_config()
    except Exception as e:
        err_msg = f"Failed to load yaml base configuration: {e}"
        log_progress(run_dir, "Setup", "failed", err_msg, task_id)
        cancel_events.pop(task_id, None)
        return

    # Extract dynamic runtime config (API keys, overrides)
    api_key = config_data.get("api_key")
    if mock_llm_enabled() or _is_mock_key(api_key):
        setup_litellm_mock_local()
        
    # Get defaults from yaml config
    llm_defaults = yaml_config.get("llm_defaults", {})
    
    light_provider = config_data.get("light_provider") or llm_defaults.get("light_provider", "ollama")
    light_model_name = config_data.get("light_model") or llm_defaults.get("light_model", "llama3.1:8b")
    heavy_provider = config_data.get("heavy_provider") or llm_defaults.get("heavy_provider", "ollama")
    heavy_model_name = config_data.get("heavy_model") or llm_defaults.get("heavy_model", "llama3.1:8b")

    # ── FIX: Determine API keys BEFORE they are used ──────────────────────
    light_api_key = (
        config_data.get("light_api_api_key")
        or config_data.get("light_api_key")
        or config_data.get("api_key")
        or ""
    )
    heavy_api_key = (
        config_data.get("heavy_api_api_key")
        or config_data.get("heavy_api_key")
        or config_data.get("api_key")
        or ""
    )

    # Extract region from API keys for Bedrock (format: ACCESS:SECRET:REGION[:TOKEN])
    def _region_from_key(key: str) -> str:
        parts = key.split(":")
        return parts[2] if len(parts) >= 3 else "us-east-1"

    light_region = _region_from_key(light_api_key) if light_api_key else "us-east-1"
    heavy_region = _region_from_key(heavy_api_key) if heavy_api_key else "us-east-1"

    # Build model identifiers – for Bedrock we must embed the region
    # Models that need the InvokeModel API (don't support Converse API)
    BEDROCK_INVOKE_PREFIXES = (
        "amazon.titan-", "ai21.", "cohere.", "stability.",
    )

    def _bedrock_model_id(provider: str, region: str, model_name: str) -> str:
        """Build a LiteLLM-compatible Bedrock model identifier.
        
        Uses bedrock/converse/ for models that support it (Claude, Llama, Mistral)
        and bedrock/invoke/ for legacy models (Titan, AI21, Cohere, Stability).
        """
        needs_invoke = any(model_name.startswith(p) for p in BEDROCK_INVOKE_PREFIXES)
        api_path = "invoke" if needs_invoke else "converse"
        return f"{provider}/{api_path}/{region}/{model_name}"

    if light_provider == "bedrock":
        light_model = _bedrock_model_id(light_provider, light_region, light_model_name)
    else:
        light_model = f"{light_provider}/{light_model_name}" if "/" not in light_model_name else light_model_name

    if heavy_provider == "bedrock":
        heavy_model = _bedrock_model_id(heavy_provider, heavy_region, heavy_model_name)
    else:
        heavy_model = f"{heavy_provider}/{heavy_model_name}" if "/" not in heavy_model_name else heavy_model_name

    # Determine API bases
    light_api_base = get_api_base(light_provider, yaml_config)
    heavy_api_base = get_api_base(heavy_provider, yaml_config)

    # Store dynamic model configurations in meta.json
    meta_file = os.path.join(run_dir, "meta.json")
    if os.path.exists(meta_file):
        try:
            with open(meta_file, "r") as f:
                meta = json.load(f)
            meta["light_model"] = light_model
            meta["heavy_model"] = heavy_model
            with open(meta_file, "w") as f:
                json.dump(meta, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not persist resolved models to meta.json: {e}")

    # Read templates from config.yaml
    prompts = yaml_config.get("prompts", {})
    web_search_enabled = config_data.get("enable_web_search")
    if web_search_enabled is None:
        web_search_enabled = yaml_config.get("features", {}).get("web_search", False)

    try:
        # ----------------------------------------------------
        # STAGE 1: Coordinator (Heavy Model)
        # ----------------------------------------------------
        if cancel_events[task_id].is_set(): raise asyncio.CancelledError()
        stage = "Queue"
        log_progress(run_dir, stage, "running", "Coordinator starting research workflow planning...", task_id)
        
        coord_cfg = prompts.get("coordinator", {})
        coord_sys = coord_cfg.get("system_instruction", "").format(topic=topic)
        coord_prompt = coord_cfg.get("prompt_template", "").format(topic=topic)
        
        coord_input = {
            "system_instruction": coord_sys,
            "prompt": coord_prompt,
            "model": heavy_model
        }
        coord_usage: dict = {}
        try:
            coord_confirm = await run_litellm_agent(heavy_model, coord_sys, coord_prompt, heavy_api_key, heavy_api_base, usage_out=coord_usage)
            await log_session_async(
                api_name="POST /research",
                agent_name="CoordinatorAgent",
                session_id=session_id,
                input_data=coord_input,
                scenario="SUCCESS",
                output_or_error_data=coord_confirm
            )
        except Exception as e:
            err_msg = f"CoordinatorAgent failed: {str(e)}\n{traceback.format_exc()}"
            await log_session_async(
                api_name="POST /research",
                agent_name="CoordinatorAgent",
                session_id=session_id,
                input_data=coord_input,
                scenario="FAILURE",
                output_or_error_data=err_msg
            )
            raise e
            
        log_progress(run_dir, stage, "completed", f"Coordinator Planning Completed: {coord_confirm.strip()}", task_id, usage=coord_usage)

        # ----------------------------------------------------
        # STAGE 2: Light Agents Execution (Light Model) — PARALLEL
        # ----------------------------------------------------
        if cancel_events[task_id].is_set(): raise asyncio.CancelledError()
        stage = "Researching"
        
        results_general = ""
        results_competitor = ""
        results_pricing = ""
        results_trends = ""

        if web_search_enabled:
            log_progress(run_dir, stage, "running", f"Initiating web search queries for topic: '{topic}'", task_id)
            # Parallel web search fetches
            loop = asyncio.get_running_loop()
            
            search_query_general = f"{topic} general overview industry size history stats"
            search_query_competitors = f"{topic} main competitors market share companies key players"
            search_query_pricing = f"{topic} pricing model strategy cost business model monetization"
            search_query_trends = f"{topic} market trends future growth forecasts tech shifts"
            
            # Run searches in executors
            results = await asyncio.gather(
                loop.run_in_executor(None, lambda: web_search(search_query_general, max_results=4)),
                loop.run_in_executor(None, lambda: web_search(search_query_competitors, max_results=4)),
                loop.run_in_executor(None, lambda: web_search(search_query_pricing, max_results=4)),
                loop.run_in_executor(None, lambda: web_search(search_query_trends, max_results=4))
            )
            results_general, results_competitor, results_pricing, results_trends = results
        else:
            log_progress(run_dir, stage, "running", "Web search is disabled in configuration. Using internal model knowledge.", task_id)
            results_general = "Web search is disabled. Generating general overview based on internal knowledge."
            results_competitor = "Web search is disabled. Generating competitor landscape based on internal knowledge."
            results_pricing = "Web search is disabled. Generating pricing and business model analysis based on internal knowledge."
            results_trends = "Web search is disabled. Generating industry trends based on internal knowledge."
        
        # ── Parallel Light Agent Execution ────────────────────────────────
        log_progress(run_dir, stage, "running", "Launching 4 specialized Light Agents in parallel...", task_id)
        
        # Build prompts for all 4 agents
        res_cfg = prompts.get("research_agent", {})
        res_sys = res_cfg.get("system_instruction", "").format(topic=topic)
        res_prompt = res_cfg.get("prompt_template", "").format(topic=topic, search_results=results_general)
        
        comp_cfg = prompts.get("competitor_agent", {})
        comp_sys = comp_cfg.get("system_instruction", "").format(topic=topic)
        comp_prompt = comp_cfg.get("prompt_template", "").format(topic=topic, search_results=results_competitor)
        
        prc_cfg = prompts.get("pricing_agent", {})
        prc_sys = prc_cfg.get("system_instruction", "").format(topic=topic)
        prc_prompt = prc_cfg.get("prompt_template", "").format(topic=topic, search_results=results_pricing)
        
        trnd_cfg = prompts.get("trend_agent", {})
        trnd_sys = trnd_cfg.get("system_instruction", "").format(topic=topic)
        trnd_prompt = trnd_cfg.get("prompt_template", "").format(topic=topic, search_results=results_trends)

        light_usage_totals = {"total_tokens": 0, "cost_usd": 0.0}

        async def _run_light_agent(agent_name: str, sys_instr: str, prompt_text: str):
            """Wrapper that runs a single light agent and logs results."""
            agent_input = {"system_instruction": sys_instr, "prompt": prompt_text, "model": light_model}
            agent_usage: dict = {}
            try:
                result = await run_litellm_agent(light_model, sys_instr, prompt_text, light_api_key, light_api_base, usage_out=agent_usage)
                light_usage_totals["total_tokens"] += int(agent_usage.get("total_tokens", 0) or 0)
                light_usage_totals["cost_usd"] += float(agent_usage.get("cost_usd", 0.0) or 0.0)
                await log_session_async(
                    api_name="POST /research",
                    agent_name=agent_name,
                    session_id=session_id,
                    input_data=agent_input,
                    scenario="SUCCESS",
                    output_or_error_data=result
                )
                return result
            except Exception as e:
                err_msg = f"{agent_name} failed: {str(e)}\n{traceback.format_exc()}"
                await log_session_async(
                    api_name="POST /research",
                    agent_name=agent_name,
                    session_id=session_id,
                    input_data=agent_input,
                    scenario="FAILURE",
                    output_or_error_data=err_msg
                )
                raise e

        # Fire all 4 light agents concurrently
        draft_general, draft_competitor, draft_pricing, draft_trend = await asyncio.gather(
            _run_light_agent("ResearchAgent", res_sys, res_prompt),
            _run_light_agent("CompetitorAgent", comp_sys, comp_prompt),
            _run_light_agent("PricingAgent", prc_sys, prc_prompt),
            _run_light_agent("TrendAgent", trnd_sys, trnd_prompt),
        )
        
        log_progress(run_dir, stage, "completed", "All 4 Light Agent research drafts complete (parallel).", task_id, usage=light_usage_totals)

        # ----------------------------------------------------
        # STAGE 3: Heavy Agents Consolidating & Writing (Heavy Model)
        # ----------------------------------------------------
        if cancel_events[task_id].is_set(): raise asyncio.CancelledError()
        stage = "Critique"
        log_progress(run_dir, stage, "running", "Compiling drafts using C-suite Writer Agent (Heavy Model)...", task_id)
        
        writer_cfg = prompts.get("writer_agent", {})
        writer_sys = writer_cfg.get("system_instruction", "").format(topic=topic)
        writer_prompt = writer_cfg.get("prompt_template", "").format(
            topic=topic,
            draft_general=draft_general,
            draft_competitor=draft_competitor,
            draft_pricing=draft_pricing,
            draft_trend=draft_trend
        )
        
        writer_input = {
            "system_instruction": writer_sys,
            "prompt": writer_prompt,
            "model": heavy_model
        }
        writer_usage: dict = {}
        try:
            compiled_report = await run_litellm_agent(heavy_model, writer_sys, writer_prompt, heavy_api_key, heavy_api_base, usage_out=writer_usage)
            await log_session_async(
                api_name="POST /research",
                agent_name="WriterAgent",
                session_id=session_id,
                input_data=writer_input,
                scenario="SUCCESS",
                output_or_error_data=compiled_report
            )
        except Exception as e:
            err_msg = f"WriterAgent failed: {str(e)}\n{traceback.format_exc()}"
            await log_session_async(
                api_name="POST /research",
                agent_name="WriterAgent",
                session_id=session_id,
                input_data=writer_input,
                scenario="FAILURE",
                output_or_error_data=err_msg
            )
            raise e
            
        log_progress(run_dir, stage, "completed", "Writer draft report consolidated.", task_id, usage=writer_usage)

        # ----------------------------------------------------
        # STAGE 4: Heavy Agents Fact Checker & SWOT critique (Heavy Model)
        # ----------------------------------------------------
        if cancel_events[task_id].is_set(): raise asyncio.CancelledError()
        stage = "Polishing"
        log_progress(run_dir, stage, "running", "Auditing and polishing final output with Fact Checker (Heavy Model)...", task_id)
        
        fc_cfg = prompts.get("fact_checker_agent", {})
        fc_sys = fc_cfg.get("system_instruction", "").format(topic=topic)
        
        # Instruct schema fields explicitly in prompt to match BusinessReport fields
        schema_info = (
            "You MUST output valid JSON strictly matching the following schema:\n"
            "{\n"
            "  \"topic\": \"topic parameter string\",\n"
            "  \"title\": \"strategic title of report\",\n"
            "  \"executive_summary\": \"narrative summary of findings\",\n"
            "  \"market_overview\": \"cohesive market size & details\",\n"
            "  \"competitor_analysis\": \"analysis of key players\",\n"
            "  \"swot_analysis\": \"SWOT matrix findings\",\n"
            "  \"strategic_recommendations\": \"numbered/bulleted strategic steps\",\n"
            "  \"critique_notes\": \"critique logs, missing points addressed, and changes made\"\n"
            "}"
        )
        
        fc_prompt = fc_cfg.get("prompt_template", "").format(
            topic=topic,
            compiled_report=compiled_report
        ) + f"\n\n{schema_info}"
        
        fc_input = {
            "system_instruction": fc_sys,
            "prompt": fc_prompt,
            "model": heavy_model
        }
        fc_usage: dict = {}
        try:
            raw_json_response = await run_litellm_agent(heavy_model, fc_sys, fc_prompt, heavy_api_key, heavy_api_base, response_json=True, usage_out=fc_usage)
            
            # Clean markdown codeblocks if model wraps it
            cleaned_response = raw_json_response.strip()
            if "```json" in cleaned_response:
                cleaned_response = cleaned_response.split("```json")[1].split("```")[0].strip()
            elif "```" in cleaned_response:
                cleaned_response = cleaned_response.split("```")[1].split("```")[0].strip()
                
            try:
                structured_data = json.loads(cleaned_response)
                
                # Robustly convert non-string structures returned by LLM to strings
                for field in ["market_overview", "competitor_analysis", "swot_analysis", "strategic_recommendations", "critique_notes", "executive_summary", "title", "topic"]:
                    if field in structured_data:
                        val = structured_data[field]
                        if isinstance(val, list):
                            structured_data[field] = "\n".join(f"- {str(item)}" for item in val)
                        elif isinstance(val, dict):
                            # Render dictionaries as readable Markdown key-value sections
                            lines = []
                            for k, v in val.items():
                                title_key = k.replace("_", " ").title()
                                if isinstance(v, list):
                                    bullets = "\n".join(f"  - {str(item)}" for item in v)
                                    lines.append(f"### {title_key}\n{bullets}")
                                elif isinstance(v, dict):
                                    sub_lines = []
                                    for sk, sv in v.items():
                                        sub_lines.append(f"  - **{sk.replace('_', ' ').title()}**: {str(sv)}")
                                    lines.append(f"### {title_key}\n" + "\n".join(sub_lines))
                                else:
                                    lines.append(f"**{title_key}**: {str(v)}")
                            structured_data[field] = "\n\n".join(lines)
                        elif val is None:
                            structured_data[field] = ""
                        elif not isinstance(val, str):
                            structured_data[field] = str(val)
                
                # Validate against Pydantic schema
                report_obj = BusinessReport(**structured_data)
                structured_data = report_obj.model_dump()
            except Exception as parse_err:
                logger.warning(f"JSON Parsing/Validation failed: {parse_err}. Fallback structure applied.")
                structured_data = {
                    "topic": topic,
                    "title": f"Market Analysis: {topic}",
                    "executive_summary": "Auto-compiled summary. Please check raw logs.",
                    "market_overview": compiled_report,
                    "competitor_analysis": draft_competitor,
                    "swot_analysis": f"SWOT critique failed during JSON format. Parsing Error: {str(parse_err)}",
                    "strategic_recommendations": "1. Establish standard governance.\n2. Leverage LiteLLM multi-model routing.",
                    "critique_notes": f"Polishing failed validation. Error details: {str(parse_err)}"
                }
                
            await log_session_async(
                api_name="POST /research",
                agent_name="FactCheckerAgent",
                session_id=session_id,
                input_data=fc_input,
                scenario="SUCCESS",
                output_or_error_data=structured_data
            )
        except Exception as e:
            err_msg = f"FactCheckerAgent failed: {str(e)}\n{traceback.format_exc()}"
            await log_session_async(
                api_name="POST /research",
                agent_name="FactCheckerAgent",
                session_id=session_id,
                input_data=fc_input,
                scenario="FAILURE",
                output_or_error_data=err_msg
            )
            raise e

        # Write final report
        report_file = os.path.join(run_dir, "report.json")
        with open(report_file, "w") as f:
            json.dump(structured_data, f, indent=2)
            
        log_progress(run_dir, stage, "success", "Market research report finalized successfully via parallel LiteLLM pipeline!", task_id, usage=fc_usage)
        
        # Push final report via SSE
        _notify_sse(task_id, {"type": "report_ready", "status": "success"})
        
    except asyncio.CancelledError:
        log_progress(run_dir, stage if 'stage' in locals() else "Startup", "cancelled", "Research task was cancelled by the user.", task_id)
        logger.info(f"Task {task_id} was cancelled.")
    except Exception as e:
        logger.error(f"Error during LiteLLM workflow execution: {str(e)}\n{traceback.format_exc()}")
        friendly_stage = stage if 'stage' in locals() else "Startup"
        friendly_error_msg = f"Pipeline failed at stage '{friendly_stage}': {str(e)}"
        log_progress(run_dir, friendly_stage, "failed", friendly_error_msg, task_id)
        
    cancel_events.pop(task_id, None)
