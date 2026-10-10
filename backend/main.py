import os
import re
import time
import uuid
import json
import shutil
import yaml
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional, Dict, List, Literal
from urllib.parse import urlparse
from fastapi import FastAPI, BackgroundTasks, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from backend.agent_orchestrator import (
    run_market_research, cancel_events,
    subscribe_sse, unsubscribe_sse,
    mock_llm_enabled, PIPELINE_STAGES,
)
from backend.demo_seed import inspect_linkedin_demo, seed_linkedin_demo
from backend.observability import log_session_async
from backend.model_fetcher import ProviderModelFetcher

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Market Research Assistant API")

# CORS: the production build is served same-origin by this app, so only the
# local Next.js dev servers need to be allowed by default. A wildcard origin
# combined with credentials would let any website drive this API on behalf of
# the user, so the allow-list is explicit and credentials stay disabled.
DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:3001", "http://127.0.0.1:3001",
]
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()
] or DEFAULT_ALLOWED_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Session-ID"],
)

WORKSPACE_DIR = os.getenv("WORKSPACE_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# REPORTS_DIR is separately overridable so an E2E or staging run can keep its
# runs out of the developer's working tree while still serving the real UI.
REPORTS_DIR = os.getenv("REPORTS_DIR") or os.path.join(WORKSPACE_DIR, "reports")
CONFIG_YAML = os.path.join(WORKSPACE_DIR, "config", "config.yaml")
UI_CONFIG_JSON = os.path.join(WORKSPACE_DIR, "backend", "config.json")

os.makedirs(REPORTS_DIR, exist_ok=True)

# Task ids are generated as uuid4 strings. Restricting the accepted character
# set keeps `os.path.join` from escaping REPORTS_DIR via "..", "C:\\..." or
# similar traversal payloads while still accepting historic run directories.
_TASK_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

MAX_IDEA_LENGTH = 2000


def utc_now_iso() -> str:
    """Timezone-aware UTC timestamp so browsers do not read it as local time."""
    return datetime.now(timezone.utc).isoformat()


def resolve_run_dir(task_id: str) -> str:
    """Maps a task id to its run directory, rejecting any path traversal attempt.

    Raises HTTPException(404) for ids that are malformed or that resolve outside
    of REPORTS_DIR, so probing cannot distinguish invalid from missing ids.
    """
    if not _TASK_ID_RE.match(task_id or ""):
        raise HTTPException(status_code=404, detail="Task not found.")

    run_dir = os.path.join(REPORTS_DIR, task_id)
    reports_root = os.path.realpath(REPORTS_DIR)
    resolved = os.path.realpath(run_dir)
    if resolved != reports_root and not resolved.startswith(reports_root + os.sep):
        raise HTTPException(status_code=404, detail="Task not found.")
    return run_dir

class TaskModelConfig(BaseModel):
    provider: str
    model: str
    api_key: Optional[str] = None

class UIModelConfig(BaseModel):
    light_task: TaskModelConfig
    heavy_task: TaskModelConfig

class SettingsSaveRequest(BaseModel):
    light_provider: Optional[str] = None
    light_model: Optional[str] = None
    light_api_key: Optional[str] = None
    heavy_provider: Optional[str] = None
    heavy_model: Optional[str] = None
    heavy_api_key: Optional[str] = None
    
    # Backward compatibility
    api_key: Optional[str] = None
    light_model_legacy: Optional[str] = None
    heavy_model_legacy: Optional[str] = None

class ResearchRequest(BaseModel):
    idea: Optional[str] = Field(default=None, max_length=MAX_IDEA_LENGTH)
    location: Optional[str] = Field(default=None, max_length=MAX_IDEA_LENGTH)
    enable_web_search: bool = True
    config_overrides: Optional[Dict[str, str]] = None
    ui_model_config: Optional[UIModelConfig] = None
    
    # Backward compatibility
    topic: Optional[str] = Field(default=None, max_length=MAX_IDEA_LENGTH)
    business_idea: Optional[str] = Field(default=None, max_length=MAX_IDEA_LENGTH)
    config: Optional[SettingsSaveRequest] = None

# New request model for dynamic model fetching
class ModelFetchRequest(BaseModel):
    provider: str  # e.g., "openai", "anthropic", "gemini", "ollama", "bedrock"
    api_key: Optional[str] = None
    # Bedrock specific fields
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    region: Optional[str] = None
    aws_session_token: Optional[str] = None
    # Ollama base URL (defaults to http://localhost:11434)
    base_url: Optional[str] = None


class ConnectionTestRequest(BaseModel):
    provider: str = Field(min_length=1, max_length=64)
    api_key: Optional[str] = None
    base_url: Optional[str] = None


# ── Response models ──────────────────────────────────────────────────────────
# Declared so the OpenAPI contract is explicit and clients can rely on shapes.

class HealthResponse(BaseModel):
    status: Literal["ok"]
    reports_dir_writable: bool
    config_yaml_present: bool
    mock_llm: bool


class DemoSeedResponse(BaseModel):
    status: str
    seeded: bool
    runs: List[Dict[str, str]]
    launch: Dict[str, str]


class ConfigResponse(BaseModel):
    api_key_configured: bool
    api_key_masked: str
    light_provider: Optional[str] = None
    light_model: Optional[str] = None
    light_api_key_masked: str
    heavy_provider: Optional[str] = None
    heavy_model: Optional[str] = None
    heavy_api_key_masked: str


class StatusResponse(BaseModel):
    status: str
    message: str


class RunSummary(BaseModel):
    task_id: str
    topic: str
    created_at: str
    light_model: Optional[str] = None
    heavy_model: Optional[str] = None
    status: str = "unknown"
    duration_ms: Optional[int] = None
    tokens: int = 0
    cost_usd: float = 0.0


class ResearchResponse(BaseModel):
    task_id: str
    topic: str
    status: str


class StageInfo(BaseModel):
    name: str
    status: str
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    duration_ms: Optional[int] = None
    tokens: int = 0
    cost_usd: float = 0.0


class ProgressLogEntry(BaseModel):
    timestamp: str
    stage: str
    status: str
    message: str


class RunTotals(BaseModel):
    tokens: int = 0
    cost_usd: float = 0.0
    duration_ms: int = 0


class ProgressResponse(BaseModel):
    task_id: Optional[str] = None
    topic: Optional[str] = None
    status: str
    started_at: Optional[str] = None
    updated_at: Optional[str] = None
    stages: List[StageInfo] = Field(default_factory=list)
    totals: RunTotals = Field(default_factory=RunTotals)
    logs: List[ProgressLogEntry] = Field(default_factory=list)


class ReportResponse(BaseModel):
    topic: str
    title: str
    executive_summary: str
    market_overview: str
    competitor_analysis: str
    swot_analysis: str
    strategic_recommendations: str
    critique_notes: str


class ModelInfo(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None


class ModelsResponse(BaseModel):
    provider: str
    models: List[ModelInfo]


class ConnectionTestResponse(BaseModel):
    provider: str
    reachable: bool
    latency_ms: int
    model_count: int = 0
    detail: str


class SectionDiff(BaseModel):
    section: str
    label: str
    a: str
    b: str
    identical: bool


class CompareResponse(BaseModel):
    a: RunSummary
    b: RunSummary
    sections: List[SectionDiff]

def get_base_yaml_config() -> dict:
    """Loads base truth from config.yaml."""
    if os.path.exists(CONFIG_YAML):
        try:
            with open(CONFIG_YAML, "r") as f:
                return yaml.safe_load(f)
        except Exception as e:
            logger.error(f"Failed to load config.yaml: {e}")
    return {"models": {"light_model": "llama3.1:8b", "heavy_model": "llama3.1:8b"}}

def get_resolved_config() -> dict:
    """Resolves configuration: base config.yaml + stored UI overrides + env key."""
    base_cfg = get_base_yaml_config()
    defaults = base_cfg.get("llm_defaults", {})
    
    resolved = {
        "light_provider": defaults.get("light_provider", "ollama"),
        "light_model": defaults.get("light_model", "llama3.1:8b"),
        "heavy_provider": defaults.get("heavy_provider", "ollama"),
        "heavy_model": defaults.get("heavy_model", "llama3.1:8b"),
        "api_key": os.environ.get("GEMINI_API_KEY", "")
    }
    
    # Load UI overrides from config.json if they exist
    if os.path.exists(UI_CONFIG_JSON):
        try:
            with open(UI_CONFIG_JSON, "r") as f:
                ui_overrides = json.load(f)
                if ui_overrides.get("api_key"):
                    resolved["api_key"] = ui_overrides["api_key"]
                if ui_overrides.get("light_provider"):
                    resolved["light_provider"] = ui_overrides["light_provider"]
                if ui_overrides.get("light_model"):
                    resolved["light_model"] = ui_overrides["light_model"]
                if ui_overrides.get("light_api_key"):
                    resolved["light_api_key"] = ui_overrides["light_api_key"]
                if ui_overrides.get("heavy_provider"):
                    resolved["heavy_provider"] = ui_overrides["heavy_provider"]
                if ui_overrides.get("heavy_model"):
                    resolved["heavy_model"] = ui_overrides["heavy_model"]
                if ui_overrides.get("heavy_api_key"):
                    resolved["heavy_api_key"] = ui_overrides["heavy_api_key"]
        except Exception as e:
            logger.error(f"Failed to parse UI overrides config.json: {e}")
            
    return resolved

@app.get("/api/config", response_model=ConfigResponse)
@app.get("/settings", response_model=ConfigResponse)
@app.get("/api/settings", response_model=ConfigResponse)
def get_config():
    """Gets the resolved configuration (masking the API key)."""
    cfg = get_resolved_config()
    
    key = cfg.get("api_key", "")
    masked_key = f"{key[:6]}...{key[-4:]}" if len(key) > 10 else "Not Configured"
    
    light_key = cfg.get("light_api_key", "")
    masked_light_key = f"{light_key[:6]}...{light_key[-4:]}" if len(light_key) > 10 else "Not Configured"
    
    heavy_key = cfg.get("heavy_api_key", "")
    masked_heavy_key = f"{heavy_key[:6]}...{heavy_key[-4:]}" if len(heavy_key) > 10 else "Not Configured"
    
    return {
        "api_key_configured": len(key) > 0 or len(light_key) > 0 or len(heavy_key) > 0,
        "api_key_masked": masked_key,
        "light_provider": cfg.get("light_provider"),
        "light_model": cfg.get("light_model"),
        "light_api_key_masked": masked_light_key,
        "heavy_provider": cfg.get("heavy_provider"),
        "heavy_model": cfg.get("heavy_model"),
        "heavy_api_key_masked": masked_heavy_key
    }

@app.post("/api/config", response_model=StatusResponse)
@app.post("/settings", response_model=StatusResponse)
@app.post("/api/settings", response_model=StatusResponse)
async def save_config(config: SettingsSaveRequest, request: Request):
    """Saves the user UI overrides to config.json (R2)."""
    session_id = request.headers.get("x-session-id") or f"sess_{uuid.uuid4().hex[:5]}"
    input_data = config.model_dump()
    try:
        os.makedirs(os.path.dirname(UI_CONFIG_JSON), exist_ok=True)
        # Fetch current UI config to preserve unset values
        current = {}
        if os.path.exists(UI_CONFIG_JSON):
            try:
                with open(UI_CONFIG_JSON, "r") as f:
                    current = json.load(f)
            except Exception as read_err:
                logger.warning(f"Existing config.json unreadable, starting fresh: {read_err}")
                
        # Merge new parameters
        if config.light_provider:
            current["light_provider"] = config.light_provider
        if config.light_model:
            current["light_model"] = config.light_model
        if config.light_api_key:
            current["light_api_key"] = config.light_api_key
        if config.heavy_provider:
            current["heavy_provider"] = config.heavy_provider
        if config.heavy_model:
            current["heavy_model"] = config.heavy_model
        if config.heavy_api_key:
            current["heavy_api_key"] = config.heavy_api_key
            
        if config.api_key:
            current["api_key"] = config.api_key
            
        with open(UI_CONFIG_JSON, "w") as f:
            json.dump(current, f, indent=2)
            
        result = {"status": "success", "message": "Configuration overrides saved."}
        await log_session_async(
            api_name="POST /settings",
            agent_name="API Layer",
            session_id=session_id,
            input_data=input_data,
            scenario="SUCCESS",
            output_or_error_data=result
        )
        return result
    except Exception as e:
        import traceback
        err_msg = f"Failed to save overrides: {e}\n{traceback.format_exc()}"
        await log_session_async(
            api_name="POST /settings",
            agent_name="API Layer",
            session_id=session_id,
            input_data=input_data,
            scenario="FAILURE",
            output_or_error_data=err_msg
        )
        raise HTTPException(status_code=500, detail="Failed to save configuration settings. Please try again.") from e


@app.get("/api/health", response_model=HealthResponse)
def health_check():
    """Liveness/readiness probe used by container orchestration."""
    return {
        "status": "ok",
        "reports_dir_writable": os.access(REPORTS_DIR, os.W_OK),
        "config_yaml_present": os.path.exists(CONFIG_YAML),
        "mock_llm": mock_llm_enabled(),
    }


@app.get("/api/demo", response_model=DemoSeedResponse)
def demo_status():
    """Reports the LinkedIn-demo launch topic and whether Compare fixtures exist."""
    return inspect_linkedin_demo(REPORTS_DIR)


@app.post("/api/demo/seed", response_model=DemoSeedResponse)
def demo_seed():
    """Writes the two completed Compare runs used by the LinkedIn speaking script."""
    return seed_linkedin_demo(REPORTS_DIR)


def _read_json(path: str) -> Optional[dict]:
    """Reads a JSON file, returning None when absent or unparseable."""
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Unreadable JSON at {path}: {e}")
        return None


def _run_summary(task_id: str) -> Optional[dict]:
    """Joins meta.json with progress.json into the RunSummary shape."""
    run_dir = os.path.join(REPORTS_DIR, task_id)
    if not os.path.isdir(run_dir):
        return None
    meta = _read_json(os.path.join(run_dir, "meta.json"))
    if meta is None:
        return None

    progress = _read_json(os.path.join(run_dir, "progress.json")) or {}
    totals = progress.get("totals") or {}
    meta["status"] = progress.get("status", "unknown")
    meta["duration_ms"] = totals.get("duration_ms")
    meta["tokens"] = int(totals.get("tokens", 0) or 0)
    meta["cost_usd"] = float(totals.get("cost_usd", 0.0) or 0.0)
    meta.setdefault("topic", "")
    meta.setdefault("created_at", "")
    meta.setdefault("task_id", task_id)
    return meta


@app.get("/api/runs", response_model=List[RunSummary])
def list_runs():
    """Lists all research runs (tasks)."""
    if not os.path.exists(REPORTS_DIR):
        return []

    runs = [s for s in (_run_summary(t) for t in os.listdir(REPORTS_DIR)) if s]
    runs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return runs

@app.post("/research", response_model=ResearchResponse)
@app.post("/api/research", response_model=ResearchResponse)
async def trigger_research(req: ResearchRequest, background_tasks: BackgroundTasks, request: Request):
    """Triggers a market research run."""
    session_id = request.headers.get("x-session-id") or f"sess_{uuid.uuid4().hex[:5]}"
    input_data = req.model_dump()
    try:
        # Resolve config: base config.yaml + stored config.json + requests overrides
        resolved_config = get_resolved_config()
        resolved_config["enable_web_search"] = req.enable_web_search
        
        # Resolve topic from inputs (whitespace-only values are treated as absent)
        idea = (req.idea or "").strip()
        location = (req.location or "").strip()
        business_idea = (req.business_idea or "").strip()
        topic = (req.topic or "").strip()

        if idea and location:
            topic = f"{idea} in {location}"
        elif business_idea and location:
            topic = f"{business_idea} in {location}"
        elif idea:
            topic = idea
        elif business_idea:
            topic = business_idea
            
        if not topic:
            raise HTTPException(
                status_code=400,
                detail="Topic, Idea, or Business Idea must be provided."
            )
            
        # Resolve dynamic models and providers from the UI Payload (R2)
        if req.ui_model_config:
            lt = req.ui_model_config.light_task
            resolved_config["light_provider"] = lt.provider
            resolved_config["light_model"] = lt.model
            if lt.api_key:
                resolved_config["light_api_key"] = lt.api_key
                if lt.provider == "gemini" or not resolved_config.get("api_key"):
                    resolved_config["api_key"] = lt.api_key
                    
            ht = req.ui_model_config.heavy_task
            resolved_config["heavy_provider"] = ht.provider
            resolved_config["heavy_model"] = ht.model
            if ht.api_key:
                resolved_config["heavy_api_key"] = ht.api_key
                if ht.provider == "gemini" and not resolved_config.get("api_key"):
                    resolved_config["api_key"] = ht.api_key
                    
        elif req.config:
            if req.config.api_key:
                resolved_config["api_key"] = req.config.api_key
            if req.config.light_model:
                if "/" in req.config.light_model:
                    prov, mod = req.config.light_model.split("/", 1)
                    resolved_config["light_provider"] = prov
                    resolved_config["light_model"] = mod
                else:
                    resolved_config["light_model"] = req.config.light_model
            if req.config.heavy_model:
                if "/" in req.config.heavy_model:
                    prov, mod = req.config.heavy_model.split("/", 1)
                    resolved_config["heavy_provider"] = prov
                    resolved_config["heavy_model"] = mod
                else:
                    resolved_config["heavy_model"] = req.config.heavy_model
    
        # Format model tags for history list view
        light_str = f"{resolved_config.get('light_provider')}/{resolved_config.get('light_model')}"
        heavy_str = f"{resolved_config.get('heavy_provider')}/{resolved_config.get('heavy_model')}"
    
        task_id = str(uuid.uuid4())
        run_dir = os.path.join(REPORTS_DIR, task_id)
        os.makedirs(run_dir, exist_ok=True)
        
        # Save meta.json
        meta = {
            "task_id": task_id,
            "topic": topic,
            "created_at": utc_now_iso(),
            "light_model": light_str,
            "heavy_model": heavy_str
        }
        with open(os.path.join(run_dir, "meta.json"), "w") as f:
            json.dump(meta, f, indent=2)
            
        # Create initial progress.json
        now = utc_now_iso()
        initial_progress = {
            "task_id": task_id,
            "topic": topic,
            "status": "running",
            "started_at": now,
            "updated_at": now,
            "stages": [
                {
                    "name": name,
                    "status": "running" if name == "Queue" else "pending",
                    "started_at": now if name == "Queue" else None,
                    "ended_at": None,
                    "duration_ms": None,
                    "tokens": 0,
                    "cost_usd": 0.0,
                }
                for name in PIPELINE_STAGES
            ],
            "totals": {"tokens": 0, "cost_usd": 0.0, "duration_ms": 0},
            "logs": [
                {
                    "timestamp": now,
                    "stage": "Queue",
                    "status": "running",
                    "message": f"Task queued. Initiating config-driven Multi-Agent pipeline for '{topic}'..."
                }
            ]
        }
        with open(os.path.join(run_dir, "progress.json"), "w") as f:
            json.dump(initial_progress, f, indent=2)
            
        # Launch background task
        background_tasks.add_task(
                run_market_research,
                topic=topic,
                config_data=resolved_config,
                task_id=task_id,
                run_dir=run_dir,
                session_id=session_id
            )      
        result = {"task_id": task_id, "topic": topic, "status": "queued"}
        await log_session_async(
            api_name="POST /research",
            agent_name="API Layer",
            session_id=session_id,
            input_data=input_data,
            scenario="SUCCESS",
            output_or_error_data=result
        )
        return result
    except HTTPException as he:
        await log_session_async(
            api_name="POST /research",
            agent_name="API Layer",
            session_id=session_id,
            input_data=input_data,
            scenario="FAILURE",
            output_or_error_data=he.detail
        )
        raise he
    except Exception as e:
        import traceback
        err_msg = f"Internal error launching task: {e}\n{traceback.format_exc()}"
        await log_session_async(
            api_name="POST /research",
            agent_name="API Layer",
            session_id=session_id,
            input_data=input_data,
            scenario="FAILURE",
            output_or_error_data=err_msg
        )
        raise HTTPException(status_code=500, detail="Failed to launch research task due to an internal error.") from e

@app.get("/api/runs/{task_id}/progress", response_model=ProgressResponse)
def get_progress(task_id: str):
    """Retrieves live logs (polling API - R5)."""
    run_dir = resolve_run_dir(task_id)
    progress_file = os.path.join(run_dir, "progress.json")
    
    if not os.path.exists(progress_file):
        raise HTTPException(status_code=404, detail="Task not found or progress file missing.")
        
    try:
        with open(progress_file, "r") as f:
            data = json.load(f)
    except Exception as e:
        logger.error(f"Unable to read progress for task: {e}")
        raise HTTPException(status_code=500, detail="Unable to read progress status.") from e

    # Runs created before per-stage accounting existed have no stage table;
    # synthesise one from the log entries so the timeline always renders.
    if not data.get("stages"):
        data["stages"] = _stages_from_logs(data.get("logs", []))
    data.setdefault("totals", {"tokens": 0, "cost_usd": 0.0, "duration_ms": 0})
    data.setdefault("task_id", task_id)
    return data


def _stages_from_logs(logs: list) -> list:
    """Rebuilds the stage table for legacy progress files."""
    stages: Dict[str, dict] = {
        name: {"name": name, "status": "pending", "started_at": None,
               "ended_at": None, "duration_ms": None, "tokens": 0, "cost_usd": 0.0}
        for name in PIPELINE_STAGES
    }
    for entry in logs:
        name = entry.get("stage")
        if not name:
            continue
        stage = stages.setdefault(name, {
            "name": name, "status": "pending", "started_at": None,
            "ended_at": None, "duration_ms": None, "tokens": 0, "cost_usd": 0.0,
        })
        stage["started_at"] = stage["started_at"] or entry.get("timestamp")
        stage["status"] = entry.get("status", stage["status"])
        if entry.get("status") in ("completed", "success", "failed", "cancelled"):
            stage["ended_at"] = entry.get("timestamp")
    return list(stages.values())


# ── SSE streaming endpoint ───────────────────────────────────────────────────
@app.get("/api/runs/{task_id}/stream")
async def stream_progress(task_id: str):
    """Server-Sent Events endpoint for real-time progress updates.

    The client opens an EventSource on this URL and receives JSON events
    as they happen — no polling needed.
    """
    run_dir = resolve_run_dir(task_id)
    if not os.path.exists(run_dir):
        raise HTTPException(status_code=404, detail="Task not found.")

    queue = subscribe_sse(task_id)

    async def _event_generator():
        try:
            # First, send current state so the client is caught up. A truncated
            # progress.json (writer mid-flush, or a corrupted run) must not kill
            # the stream — the client still gets live events after it.
            current = _read_json(os.path.join(run_dir, "progress.json"))
            if current is not None:
                yield f"data: {json.dumps({'type': 'snapshot', 'data': current})}\n\n"

            # Then stream new events as they arrive
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"data: {json.dumps(event)}\n\n"
                    # Stop when final status is sent
                    if event.get("status") in ("success", "failed", "cancelled"):
                        break
                    if event.get("type") == "report_ready":
                        break
                except asyncio.TimeoutError:
                    # Send keepalive comment so the connection doesn't drop
                    yield ": keepalive\n\n"
        finally:
            unsubscribe_sse(task_id, queue)

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/runs/{task_id}/report", response_model=ReportResponse)
def get_report(task_id: str):
    """Retrieves the finalized structured report."""
    return _load_report(task_id)


def _load_report(task_id: str) -> dict:
    """Shared report loader used by the report, export and compare endpoints."""
    run_dir = resolve_run_dir(task_id)
    report_file = os.path.join(run_dir, "report.json")
    progress_file = os.path.join(run_dir, "progress.json")

    if not os.path.isdir(run_dir):
        raise HTTPException(status_code=404, detail="Task not found.")

    # Check if failed
    if os.path.exists(progress_file):
        try:
            with open(progress_file, "r") as f:
                prog = json.load(f)
                if prog.get("status") == "failed":
                    raise HTTPException(status_code=500, detail="Research task failed. Please try running again.")
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Could not evaluate progress state before serving report: {e}")

    if not os.path.exists(report_file):
        raise HTTPException(status_code=202, detail="Report is still generating. Please check progress.")

    try:
        with open(report_file, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to read report content: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve report content.") from e


# Ordered so the exported Markdown and the report tabs tell the same story.
REPORT_SECTIONS = [
    ("executive_summary", "Executive Summary"),
    ("market_overview", "Market Overview & Trends"),
    ("competitor_analysis", "Competitor Landscape"),
    ("swot_analysis", "SWOT Analysis"),
    ("strategic_recommendations", "Strategic Recommendations"),
    ("critique_notes", "Critique & Refinement Log"),
]


def _report_to_markdown(report: dict) -> str:
    lines = [
        f"# Market Research Report: {report.get('topic', 'Untitled')}",
        "",
        f"## {report.get('title', 'Report')}",
        "",
    ]
    for key, label in REPORT_SECTIONS:
        lines.append(f"### {label}")
        lines.append(str(report.get(key, "")).strip())
        lines.append("")
    return "\n".join(lines)


def _safe_filename(value: str) -> str:
    """ASCII slug for Content-Disposition — header injection safe by construction."""
    slug = re.sub(r"[^A-Za-z0-9]+", "_", (value or "report")).strip("_").lower()
    return (slug or "report")[:60]


@app.get("/api/runs/{task_id}/export")
def export_report(task_id: str, format: Literal["json", "markdown"] = Query(default="json")):
    """Downloads a finished report as JSON or Markdown."""
    report = _load_report(task_id)
    filename = f"market_research_{_safe_filename(report.get('topic', ''))}"

    if format == "markdown":
        return PlainTextResponse(
            _report_to_markdown(report),
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}.md"'},
        )
    return StreamingResponse(
        iter([json.dumps(report, indent=2)]),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}.json"'},
    )


@app.get("/api/runs/compare", response_model=CompareResponse)
def compare_runs(a: str = Query(min_length=1), b: str = Query(min_length=1)):
    """Diffs two finished runs section by section."""
    # Validate before touching the filesystem: these ids arrive as query
    # parameters, which the path-level traversal guard never sees.
    resolve_run_dir(a)
    resolve_run_dir(b)
    if a == b:
        raise HTTPException(status_code=400, detail="Pick two different runs to compare.")

    summary_a, summary_b = _run_summary(a), _run_summary(b)
    if summary_a is None or summary_b is None:
        raise HTTPException(status_code=404, detail="One or both runs were not found.")

    report_a, report_b = _load_report(a), _load_report(b)
    sections = [
        {
            "section": key,
            "label": label,
            "a": str(report_a.get(key, "")),
            "b": str(report_b.get(key, "")),
            "identical": str(report_a.get(key, "")) == str(report_b.get(key, "")),
        }
        for key, label in REPORT_SECTIONS
    ]
    return {"a": summary_a, "b": summary_b, "sections": sections}


@app.post("/api/runs/{task_id}/cancel", response_model=StatusResponse)
def cancel_run(task_id: str):
    """Cancels a currently running research task."""
    run_dir = resolve_run_dir(task_id)
    if not os.path.isdir(run_dir):
        raise HTTPException(status_code=404, detail="Task not found.")
        
    if task_id in cancel_events:
        cancel_events[task_id].set()
        
        # update progress.json immediately for instant UI feedback
        progress_file = os.path.join(run_dir, "progress.json")
        try:
            with open(progress_file, "r") as f:
                data = json.load(f)
            data["status"] = "cancelled"
            data["logs"].append({
                "timestamp": utc_now_iso(),
                "stage": "Queue",
                "status": "cancelled",
                "message": "Cancellation signal sent. Aborting..."
            })
            with open(progress_file, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not write cancellation marker to progress file: {e}")
            
        return {"status": "success", "message": "Cancellation signal sent."}
    else:
        # If not in cancel_events, it's either not running or already finished.
        return {"status": "ignored", "message": "Task is not running or already completed."}


@app.post("/api/runs/{task_id}/retry", response_model=ResearchResponse)
async def retry_run(task_id: str, background_tasks: BackgroundTasks, request: Request):
    """Relaunches a previous run's topic as a new task."""
    run_dir = resolve_run_dir(task_id)
    meta = _read_json(os.path.join(run_dir, "meta.json"))
    if meta is None:
        raise HTTPException(status_code=404, detail="Task not found.")

    topic = (meta.get("topic") or "").strip()
    if not topic:
        raise HTTPException(status_code=422, detail="Original run has no topic to retry.")

    return await trigger_research(
        ResearchRequest(idea=topic, enable_web_search=True),
        background_tasks,
        request,
    )


@app.delete("/api/runs/{task_id}", response_model=StatusResponse)
def delete_run(task_id: str):
    """Deletes a research task permanently."""
    run_dir = resolve_run_dir(task_id)
    if os.path.isdir(run_dir):
        try:
            shutil.rmtree(run_dir)
            return {"status": "success", "message": "Run deleted"}
        except Exception as e:
            logger.error(f"Failed to delete run directory: {e}")
            raise HTTPException(status_code=500, detail="Failed to delete the selected run.") from e
    raise HTTPException(status_code=404, detail="Run not found")


@app.post("/api/providers/test", response_model=ConnectionTestResponse)
async def test_provider_connection(req: ConnectionTestRequest):
    """Checks whether a provider is reachable with the supplied credentials.

    Reuses the model-listing call as the probe, so a success proves both
    connectivity and that the key is accepted. Never echoes the key back.
    """
    started = time.perf_counter()
    try:
        result = await fetch_models(ModelFetchRequest(
            provider=req.provider, api_key=req.api_key, base_url=req.base_url,
        ))
        latency_ms = int((time.perf_counter() - started) * 1000)
        count = len(result.get("models", []))
        return {
            "provider": req.provider.lower().strip(),
            "reachable": True,
            "latency_ms": latency_ms,
            "model_count": count,
            "detail": f"Connected. {count} model(s) available.",
        }
    except HTTPException as he:
        return {
            "provider": req.provider.lower().strip(),
            "reachable": False,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "model_count": 0,
            "detail": str(he.detail),
        }


# ── Dynamic model fetching endpoint ──────────────────────────────────────────
@app.post("/api/models", response_model=ModelsResponse)
async def fetch_models(req: ModelFetchRequest):
    """Fetches available models from an LLM provider dynamically.

    Supports: openai, anthropic, gemini, ollama, bedrock, deepseek, qwen.
    Returns a normalised list of ``{id, name}`` dicts.
    """
    provider = req.provider.lower().strip()

    try:
        if provider == "openai":
            if not req.api_key:
                raise HTTPException(status_code=400, detail="api_key is required for OpenAI")
            raw = await ProviderModelFetcher.fetch_openai_models(req.api_key)
            models = [{"id": m.get("id"), "name": m.get("id")} for m in raw]

        elif provider == "anthropic":
            if not req.api_key:
                raise HTTPException(status_code=400, detail="api_key is required for Anthropic")
            raw = await ProviderModelFetcher.fetch_anthropic_models(req.api_key)
            models = [{"id": m.get("id"), "name": m.get("id")} for m in raw]

        elif provider == "gemini":
            if not req.api_key:
                raise HTTPException(status_code=400, detail="api_key is required for Gemini")
            raw = await ProviderModelFetcher.fetch_gemini_models(req.api_key)
            models = [
                {"id": m.get("name", "").replace("models/", ""), "name": m.get("displayName", m.get("name", ""))}
                for m in raw
            ]

        elif provider == "ollama":
            base = req.base_url or "http://localhost:11434"
            parsed = urlparse(base)
            if parsed.scheme not in ("http", "https") or not parsed.netloc:
                raise HTTPException(status_code=400, detail="base_url must be an http(s) URL")
            raw = await ProviderModelFetcher.fetch_ollama_models(base)
            models = [{"id": m.get("name", m.get("model", "")), "name": m.get("name", m.get("model", ""))} for m in raw]

        elif provider == "bedrock":
            if not (req.aws_access_key_id and req.aws_secret_access_key and req.region):
                # Try parsing from api_key field (ACCESS:SECRET:REGION[:TOKEN])
                if req.api_key and ":" in req.api_key:
                    parts = req.api_key.split(":")
                    if len(parts) >= 3:
                        req.aws_access_key_id = parts[0]
                        req.aws_secret_access_key = parts[1]
                        req.region = parts[2]
                        if len(parts) >= 4:
                            req.aws_session_token = parts[3]
                    else:
                        raise HTTPException(status_code=400, detail="Bedrock requires ACCESS_KEY:SECRET_KEY:REGION format")
                else:
                    raise HTTPException(status_code=400, detail="Bedrock requires aws_access_key_id, aws_secret_access_key, and region")

            loop = asyncio.get_running_loop()
            raw = await loop.run_in_executor(
                None,
                lambda: ProviderModelFetcher.fetch_bedrock_models(
                    req.aws_access_key_id, req.aws_secret_access_key,
                    req.region, req.aws_session_token,
                ),
            )
            models = [{"id": m.get("id"), "name": m.get("name", m.get("id"))} for m in raw]

        elif provider in ("deepseek", "qwen"):
            # DeepSeek and Qwen use OpenAI-compatible APIs
            if not req.api_key:
                raise HTTPException(status_code=400, detail=f"api_key is required for {provider}")
            
            base_urls = {
                "deepseek": "https://api.deepseek.com/v1",
                "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
            }
            url = f"{base_urls[provider]}/models"
            headers = {"Authorization": f"Bearer {req.api_key}"}
            from backend.model_fetcher import _get_client
            client = _get_client()
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            raw = data.get("data", [])
            models = [{"id": m.get("id"), "name": m.get("id")} for m in raw]

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")

        return {"provider": provider, "models": models}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Model fetch failed for {provider}: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch models from {provider}: {e}") from e


# Serve static files from the Next.js export.
# Mounted last so that every /api route above keeps precedence.
frontend_dir = os.path.join(WORKSPACE_DIR, "frontend", "out")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
