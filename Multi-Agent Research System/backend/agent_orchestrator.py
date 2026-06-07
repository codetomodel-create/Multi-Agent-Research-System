import os
import json
import logging
import traceback
import yaml
from datetime import datetime
import asyncio
from typing import Optional
from backend.observability import log_session_async
import litellm
from pydantic import BaseModel
from backend.search_tool import web_search

logger = logging.getLogger(__name__)

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

def setup_litellm_mock_local():
    original_completion = litellm.completion
    
    def mock_completion(**kwargs):
        api_key = kwargs.get("api_key", "")
        if not (api_key and (api_key.startswith("MOCK") or api_key == "MOCK_KEY")):
            return original_completion(**kwargs)
            
        model = kwargs.get("model", "")
        messages = kwargs.get("messages", [])
        prompt = messages[-1]["content"] if messages else ""
        
        class MockMessage:
            def __init__(self, content):
                self.content = content
                
        class MockChoice:
            def __init__(self, content):
                self.message = MockMessage(content)
                
        class MockResponse:
            def __init__(self, content):
                self.choices = [MockChoice(content)]
                
        if "structured schema" in prompt or kwargs.get("response_format"):
            content = json.dumps({
                "topic": "Electric Vehicles",
                "title": "C-Suite Strategic Outlook: Electric Vehicles 2026",
                "executive_summary": "The EV charging infrastructure and market is expanding globally. Steady growth is visible in battery efficiency and public fast-charger integration.",
                "market_overview": "Market value is projected to reach $180B by 2030, driven by policy shifts, city mandates, and fleet conversions.",
                "competitor_analysis": "Major players include Tesla Supercharger network, ChargePoint, EVgo, and Electrify America. Tesla remains dominant but other open-standard networks are scaling rapidly.",
                "swot_analysis": "Strengths: High government incentives. Weaknesses: Grid capacity limits. Opportunities: Ultra-fast charger integration. Threats: High installation and upkeep costs.",
                "strategic_recommendations": "1. Prioritize fast-charger corridor expansion.\n2. Standardize grid load management tools.",
                "critique_notes": "Polishing audit complete: SWOT alignment verified, competitor details updated with Open-Standard data."
            })
        elif "Compile these four research drafts" in prompt:
            content = "Consolidated draft covering general, competitor, pricing, and trend parameters for Electric Vehicles."
        elif "Initiate the research phases" in prompt:
            content = "Coordinator Planning Completed: Launching 4 parallel search branches."
        else:
            content = f"Draft research generated for query parameter using light model {model}."
            
        return MockResponse(content)
        
    litellm.completion = mock_completion

# Config path
WORKSPACE_DIR = os.getenv("WORKSPACE_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG_FILE = os.path.join(WORKSPACE_DIR, "config", "config.yaml")

def load_yaml_config() -> dict:
    """Loads default configuration from config.yaml."""
    if not os.path.exists(CONFIG_FILE):
        raise FileNotFoundError(f"Configuration file not found at: {CONFIG_FILE}")
    with open(CONFIG_FILE, "r") as f:
        return yaml.safe_load(f)

def log_progress(run_dir: str, stage: str, status: str, message: str):
    """Logs progress of a run to a progress.json file for UI polling."""
    progress_file = os.path.join(run_dir, "progress.json")
    os.makedirs(run_dir, exist_ok=True)
    
    try:
        if os.path.exists(progress_file):
            with open(progress_file, "r") as f:
                data = json.load(f)
        else:
            data = {"status": "running", "logs": []}
            
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "stage": stage,
            "status": status,
            "message": message
        }
        data["logs"].append(log_entry)
        data["status"] = status
        
        with open(progress_file, "w") as f:
            json.dump(data, f, indent=2)
            
        logger.info(f"[{stage}] {status}: {message}")
    except Exception as e:
        logger.error(f"Failed to log progress: {e}")

def get_api_base(provider: str, yaml_config: dict) -> Optional[str]:
    """Helper to look up provider base URL from yaml config."""
    providers = yaml_config.get("providers", {})
    provider_config = providers.get(provider, {})
    return provider_config.get("base_url")

async def run_litellm_agent(
    model: str, 
    system_instr: str, 
    prompt: str, 
    api_key: str, 
    api_base: Optional[str] = None, 
    response_json: bool = False
) -> str:
    """Invokes LiteLLM completion API dynamically."""
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
        
    # Run LiteLLM completion in a separate thread so it doesn't block the async event loop
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None, 
        lambda: litellm.completion(**kwargs)
    )
    return response.choices[0].message.content

async def run_market_research(topic: str, config_data: dict, task_id: str, run_dir: str, session_id: Optional[str] = None):
    """Runs the sequential multi-agent research pipeline using LiteLLM."""
    if not session_id:
        import uuid
        session_id = f"sess_{uuid.uuid4().hex[:5]}"

    # 1. Load config prompts and templates from config.yaml
    try:
        yaml_config = load_yaml_config()
    except Exception as e:
        err_msg = f"Failed to load yaml base configuration: {e}"
        log_progress(run_dir, "Setup", "failed", err_msg)
        return

    # Extract dynamic runtime config (API keys, overrides)
    api_key = config_data.get("api_key")
    if api_key and (api_key.startswith("MOCK") or api_key == "MOCK_KEY"):
        setup_litellm_mock_local()
        
    # Get defaults from yaml config
    llm_defaults = yaml_config.get("llm_defaults", {})
    
    light_provider = config_data.get("light_provider") or llm_defaults.get("light_provider", "ollama")
    light_model_name = config_data.get("light_model") or llm_defaults.get("light_model", "llama3.1:8b")
    heavy_provider = config_data.get("heavy_provider") or llm_defaults.get("heavy_provider", "ollama")
    heavy_model_name = config_data.get("heavy_model") or llm_defaults.get("heavy_model", "llama3.1:8b")

    # Format model names for LiteLLM: f"{provider}/{model_name}"
    light_model = f"{light_provider}/{light_model_name}" if "/" not in light_model_name else light_model_name
    heavy_model = f"{heavy_provider}/{heavy_model_name}" if "/" not in heavy_model_name else heavy_model_name

    # Determine API bases
    light_api_base = get_api_base(light_provider, yaml_config)
    heavy_api_base = get_api_base(heavy_provider, yaml_config)

    # Determine API keys
    light_api_key = config_data.get("light_api_api_key") or config_data.get("light_api_key") or config_data.get("api_key") or ""
    heavy_api_key = config_data.get("heavy_api_api_key") or config_data.get("heavy_api_key") or config_data.get("api_key") or ""

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
        except Exception:
            pass

    # Read templates from config.yaml
    prompts = yaml_config.get("prompts", {})
    web_search_enabled = yaml_config.get("features", {}).get("web_search", False)

    try:
        # ----------------------------------------------------
        # STAGE 1: Coordinator (Heavy Model)
        # ----------------------------------------------------
        stage = "Queue"
        log_progress(run_dir, stage, "running", "Coordinator starting research workflow planning...")
        
        coord_cfg = prompts.get("coordinator", {})
        coord_sys = coord_cfg.get("system_instruction", "").format(topic=topic)
        coord_prompt = coord_cfg.get("prompt_template", "").format(topic=topic)
        
        coord_input = {
            "system_instruction": coord_sys,
            "prompt": coord_prompt,
            "model": heavy_model
        }
        try:
            coord_confirm = await run_litellm_agent(heavy_model, coord_sys, coord_prompt, heavy_api_key, heavy_api_base)
            await log_session_async(
                api_name="POST /research",
                agent_name="CoordinatorAgent",
                session_id=session_id,
                input_data=coord_input,
                scenario="SUCCESS",
                output_or_error_data=coord_confirm
            )
        except Exception as e:
            import traceback
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
            
        log_progress(run_dir, stage, "completed", f"Coordinator Planning Completed: {coord_confirm.strip()}")

        # ----------------------------------------------------
        # STAGE 2: Light Agents Execution (Light Model)
        # ----------------------------------------------------
        stage = "Researching"
        
        results_general = ""
        results_competitor = ""
        results_pricing = ""
        results_trends = ""

        if web_search_enabled:
            log_progress(run_dir, stage, "running", f"Initiating web search queries for topic: '{topic}'")
            # Parallel web search fetches
            loop = asyncio.get_event_loop()
            
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
            log_progress(run_dir, stage, "running", "Web search is disabled in configuration. Using internal model knowledge.")
            results_general = "Web search is disabled. Generating general overview based on internal knowledge."
            results_competitor = "Web search is disabled. Generating competitor landscape based on internal knowledge."
            results_pricing = "Web search is disabled. Generating pricing and business model analysis based on internal knowledge."
            results_trends = "Web search is disabled. Generating industry trends based on internal knowledge."
        
        # Launching Specialised Light Agents (complying with R4 & R6)
        log_progress(run_dir, stage, "running", "Routing specialized tasks to Light Agents...")
        
        # 2a. General Research Agent
        log_progress(run_dir, stage, "running", "Running General Research Agent (Light Model)...")
        res_cfg = prompts.get("research_agent", {})
        res_sys = res_cfg.get("system_instruction", "").format(topic=topic)
        res_prompt = res_cfg.get("prompt_template", "").format(topic=topic, search_results=results_general)
        
        res_input = {
            "system_instruction": res_sys,
            "prompt": res_prompt,
            "model": light_model
        }
        try:
            draft_general = await run_litellm_agent(light_model, res_sys, res_prompt, light_api_key, light_api_base)
            await log_session_async(
                api_name="POST /research",
                agent_name="ResearchAgent",
                session_id=session_id,
                input_data=res_input,
                scenario="SUCCESS",
                output_or_error_data=draft_general
            )
        except Exception as e:
            import traceback
            err_msg = f"ResearchAgent failed: {str(e)}\n{traceback.format_exc()}"
            await log_session_async(
                api_name="POST /research",
                agent_name="ResearchAgent",
                session_id=session_id,
                input_data=res_input,
                scenario="FAILURE",
                output_or_error_data=err_msg
            )
            raise e
        
        # 2b. Competitor Agent
        log_progress(run_dir, stage, "running", "Running Competitor Landscape Agent (Light Model)...")
        comp_cfg = prompts.get("competitor_agent", {})
        comp_sys = comp_cfg.get("system_instruction", "").format(topic=topic)
        comp_prompt = comp_cfg.get("prompt_template", "").format(topic=topic, search_results=results_competitor)
        
        comp_input = {
            "system_instruction": comp_sys,
            "prompt": comp_prompt,
            "model": light_model
        }
        try:
            draft_competitor = await run_litellm_agent(light_model, comp_sys, comp_prompt, light_api_key, light_api_base)
            await log_session_async(
                api_name="POST /research",
                agent_name="CompetitorAgent",
                session_id=session_id,
                input_data=comp_input,
                scenario="SUCCESS",
                output_or_error_data=draft_competitor
            )
        except Exception as e:
            import traceback
            err_msg = f"CompetitorAgent failed: {str(e)}\n{traceback.format_exc()}"
            await log_session_async(
                api_name="POST /research",
                agent_name="CompetitorAgent",
                session_id=session_id,
                input_data=comp_input,
                scenario="FAILURE",
                output_or_error_data=err_msg
            )
            raise e
        
        # 2c. Pricing Agent
        log_progress(run_dir, stage, "running", "Running Pricing & Monetization Agent (Light Model)...")
        prc_cfg = prompts.get("pricing_agent", {})
        prc_sys = prc_cfg.get("system_instruction", "").format(topic=topic)
        prc_prompt = prc_cfg.get("prompt_template", "").format(topic=topic, search_results=results_pricing)
        
        prc_input = {
            "system_instruction": prc_sys,
            "prompt": prc_prompt,
            "model": light_model
        }
        try:
            draft_pricing = await run_litellm_agent(light_model, prc_sys, prc_prompt, light_api_key, light_api_base)
            await log_session_async(
                api_name="POST /research",
                agent_name="PricingAgent",
                session_id=session_id,
                input_data=prc_input,
                scenario="SUCCESS",
                output_or_error_data=draft_pricing
            )
        except Exception as e:
            import traceback
            err_msg = f"PricingAgent failed: {str(e)}\n{traceback.format_exc()}"
            await log_session_async(
                api_name="POST /research",
                agent_name="PricingAgent",
                session_id=session_id,
                input_data=prc_input,
                scenario="FAILURE",
                output_or_error_data=err_msg
            )
            raise e
        
        # 2d. Trend Agent
        log_progress(run_dir, stage, "running", "Running Industry Trends Agent (Light Model)...")
        trnd_cfg = prompts.get("trend_agent", {})
        trnd_sys = trnd_cfg.get("system_instruction", "").format(topic=topic)
        trnd_prompt = trnd_cfg.get("prompt_template", "").format(topic=topic, search_results=results_trends)
        
        trnd_input = {
            "system_instruction": trnd_sys,
            "prompt": trnd_prompt,
            "model": light_model
        }
        try:
            draft_trend = await run_litellm_agent(light_model, trnd_sys, trnd_prompt, light_api_key, light_api_base)
            await log_session_async(
                api_name="POST /research",
                agent_name="TrendAgent",
                session_id=session_id,
                input_data=trnd_input,
                scenario="SUCCESS",
                output_or_error_data=draft_trend
            )
        except Exception as e:
            import traceback
            err_msg = f"TrendAgent failed: {str(e)}\n{traceback.format_exc()}"
            await log_session_async(
                api_name="POST /research",
                agent_name="TrendAgent",
                session_id=session_id,
                input_data=trnd_input,
                scenario="FAILURE",
                output_or_error_data=err_msg
            )
            raise e
        
        log_progress(run_dir, stage, "completed", "Specialized Light Agent research drafts complete.")

        # ----------------------------------------------------
        # STAGE 3: Heavy Agents Consolidating & Writing (Heavy Model)
        # ----------------------------------------------------
        stage = "Critique"
        log_progress(run_dir, stage, "running", "Compiling drafts using C-suite Writer Agent (Heavy Model)...")
        
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
        try:
            compiled_report = await run_litellm_agent(heavy_model, writer_sys, writer_prompt, heavy_api_key, heavy_api_base)
            await log_session_async(
                api_name="POST /research",
                agent_name="WriterAgent",
                session_id=session_id,
                input_data=writer_input,
                scenario="SUCCESS",
                output_or_error_data=compiled_report
            )
        except Exception as e:
            import traceback
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
            
        log_progress(run_dir, stage, "completed", "Writer draft report consolidated.")

        # ----------------------------------------------------
        # STAGE 4: Heavy Agents Fact Checker & SWOT critique (Heavy Model)
        # ----------------------------------------------------
        stage = "Polishing"
        log_progress(run_dir, stage, "running", "Auditing and polishing final output with Fact Checker (Heavy Model)...")
        
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
        try:
            raw_json_response = await run_litellm_agent(heavy_model, fc_sys, fc_prompt, heavy_api_key, heavy_api_base, response_json=True)
            
            # Clean markdown codeblocks if model wraps it
            cleaned_response = raw_json_response.strip()
            if "```json" in cleaned_response:
                cleaned_response = cleaned_response.split("```json")[1].split("```")[0].strip()
            elif "```" in cleaned_response:
                cleaned_response = cleaned_response.split("```")[1].split("```")[0].strip()
                
            try:
                structured_data = json.loads(cleaned_response)
                # Validate against Pydantic schema
                report_obj = BusinessReport(**structured_data)
                structured_data = report_obj.model_dump()
            except Exception as parse_err:
                logger.warning(f"JSON Parsing failed: {parse_err}. Fallback structure applied.")
                structured_data = {
                    "topic": topic,
                    "title": f"Market Analysis: {topic}",
                    "executive_summary": "Auto-compiled summary. Please check raw logs.",
                    "market_overview": compiled_report,
                    "competitor_analysis": draft_competitor,
                    "swot_analysis": "SWOT critique failed during JSON format. Refer to logs.",
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
            import traceback
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
            
        log_progress(run_dir, stage, "success", "Market research report finalized successfully via sequential LiteLLM pipeline!")
        
    except Exception as e:
        error_msg = f"Error during LiteLLM workflow execution: {str(e)}\n{traceback.format_exc()}"
        log_progress(run_dir, stage if 'stage' in locals() else "Startup", "failed", error_msg)
        logger.error(error_msg)
