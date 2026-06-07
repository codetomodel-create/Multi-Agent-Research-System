import os
import uuid
import json
import yaml
import logging
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, BackgroundTasks, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from backend.agent_orchestrator import run_market_research
from backend.observability import log_session_async

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Market Research Assistant API")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WORKSPACE_DIR = os.getenv("WORKSPACE_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPORTS_DIR = os.path.join(WORKSPACE_DIR, "reports")
CONFIG_YAML = os.path.join(WORKSPACE_DIR, "config", "config.yaml")
UI_CONFIG_JSON = os.path.join(WORKSPACE_DIR, "backend", "config.json")

os.makedirs(REPORTS_DIR, exist_ok=True)

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
    idea: Optional[str] = None
    location: Optional[str] = None
    ui_model_config: Optional[UIModelConfig] = None
    
    # Backward compatibility
    topic: Optional[str] = None
    business_idea: Optional[str] = None
    config: Optional[SettingsSaveRequest] = None

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

@app.get("/api/config")
@app.get("/settings")
@app.get("/api/settings")
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

@app.post("/api/config")
@app.post("/settings")
@app.post("/api/settings")
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
            except Exception:
                pass
                
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
        err_msg = f"Failed to save overrides: {str(e)}\n{traceback.format_exc()}"
        await log_session_async(
            api_name="POST /settings",
            agent_name="API Layer",
            session_id=session_id,
            input_data=input_data,
            scenario="FAILURE",
            output_or_error_data=err_msg
        )
        raise HTTPException(status_code=500, detail=f"Failed to save overrides: {str(e)}")

@app.get("/api/runs")
def list_runs():
    """Lists all research runs (tasks)."""
    runs = []
    if not os.path.exists(REPORTS_DIR):
        return []
        
    for task_id in os.listdir(REPORTS_DIR):
        run_dir = os.path.join(REPORTS_DIR, task_id)
        if not os.path.isdir(run_dir):
            continue
            
        meta_file = os.path.join(run_dir, "meta.json")
        progress_file = os.path.join(run_dir, "progress.json")
        
        if os.path.exists(meta_file):
            try:
                with open(meta_file, "r") as f:
                    meta = json.load(f)
                
                # Check status from progress file
                status = "unknown"
                if os.path.exists(progress_file):
                    with open(progress_file, "r") as f:
                        prog = json.load(f)
                        status = prog.get("status", "running")
                
                meta["status"] = status
                runs.append(meta)
            except Exception:
                pass
                
    runs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return runs

@app.post("/research")
@app.post("/api/research")
async def trigger_research(req: ResearchRequest, background_tasks: BackgroundTasks, request: Request):
    """Triggers a market research run."""
    session_id = request.headers.get("x-session-id") or f"sess_{uuid.uuid4().hex[:5]}"
    input_data = req.model_dump()
    try:
        # Resolve config: base config.yaml + stored config.json + requests overrides
        resolved_config = get_resolved_config()
        
        # Resolve topic from inputs
        topic = req.topic
        if req.idea and req.location:
            topic = f"{req.idea} in {req.location}"
        elif req.business_idea and req.location:
            topic = f"{req.business_idea} in {req.location}"
        elif req.idea:
            topic = req.idea
        elif req.business_idea:
            topic = req.business_idea
            
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
            "created_at": datetime.utcnow().isoformat(),
            "light_model": light_str,
            "heavy_model": heavy_str
        }
        with open(os.path.join(run_dir, "meta.json"), "w") as f:
            json.dump(meta, f, indent=2)
            
        # Create initial progress.json
        initial_progress = {
            "status": "running",
            "logs": [
                {
                    "timestamp": datetime.utcnow().isoformat(),
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
        err_msg = f"Internal error launching task: {str(e)}\n{traceback.format_exc()}"
        await log_session_async(
            api_name="POST /research",
            agent_name="API Layer",
            session_id=session_id,
            input_data=input_data,
            scenario="FAILURE",
            output_or_error_data=err_msg
        )
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/runs/{task_id}/progress")
def get_progress(task_id: str):
    """Retrieves live logs (polling API - R5)."""
    run_dir = os.path.join(REPORTS_DIR, task_id)
    progress_file = os.path.join(run_dir, "progress.json")
    
    if not os.path.exists(progress_file):
        raise HTTPException(status_code=404, detail="Task not found or progress file missing.")
        
    try:
        with open(progress_file, "r") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read progress: {str(e)}")

@app.get("/api/runs/{task_id}/report")
def get_report(task_id: str):
    """Retrieves the finalized structured report."""
    run_dir = os.path.join(REPORTS_DIR, task_id)
    report_file = os.path.join(run_dir, "report.json")
    progress_file = os.path.join(run_dir, "progress.json")
    
    if not os.path.exists(run_dir):
        raise HTTPException(status_code=404, detail="Task not found.")
        
    # Check if failed
    if os.path.exists(progress_file):
        try:
            with open(progress_file, "r") as f:
                prog = json.load(f)
                if prog.get("status") == "failed":
                    logs = prog.get("logs", [])
                    err_msg = logs[-1].get("message", "Unknown error") if logs else "Task failed"
                    raise HTTPException(status_code=500, detail=f"Research task failed: {err_msg}")
        except HTTPException:
            raise
        except Exception:
            pass

    if not os.path.exists(report_file):
        raise HTTPException(status_code=202, detail="Report is still generating. Please check progress.")
        
    try:
        with open(report_file, "r") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read report: {str(e)}")

from fastapi.staticfiles import StaticFiles

# Serve static files from the Next.js export
frontend_dir = os.path.join(WORKSPACE_DIR, "frontend", "out")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
