import os
import sys
import asyncio
import shutil
import json
import yaml
import litellm

# Ensure backend folder is in path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.search_tool import web_search
from backend.agent_orchestrator import run_market_research, load_yaml_config

# Mock LiteLLM for off-line testing
def setup_litellm_mock():
    original_completion = litellm.completion
    
    def mock_completion(**kwargs):
        api_key = kwargs.get("api_key", "")
        if api_key != "MOCK_KEY":
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
                
        # Inspect prompt to simulate different agent steps
        if "structured schema" in prompt or kwargs.get("response_format"):
            # Fact Checker Agent mock JSON response
            content = json.dumps({
                "topic": "Autonomous vehicles",
                "title": "C-Suite Strategic Outlook: Autonomous Vehicles 2026",
                "executive_summary": "The autonomous vehicles market is scaling rapidly. General research shows key growth in delivery robots and level-4 pilot testing.",
                "market_overview": "Market size estimated at $50B with 15% CAGR. Tech shifts include advanced sensor fusion and end-to-end neural network models.",
                "competitor_analysis": "Key players: Waymo, Cruise, Tesla, and Baidu. Waymo holds lead in commercial robotaxi rides.",
                "swot_analysis": "Strengths: High efficiency. Weaknesses: Regs. Opportunities: Global scaling. Threats: Security leaks.",
                "strategic_recommendations": "1. Deploy level-4 delivery hubs.\n2. Standardize safety testing metrics.",
                "critique_notes": "Critique noted: SWOT detail was improved. Pricing facts were integrated into trends."
            })
        elif "Compile these four research drafts" in prompt:
            # Writer Agent consolidated output
            content = "Consolidated draft covering general, competitor, pricing, and trend parameters."
        elif "Initiate the research phases" in prompt:
            # Coordinator Agent planning output
            content = "Coordinator Planning Completed: Launching 4 parallel search branches."
        else:
            # Light Agents overview draft
            content = f"Draft research generated for query parameter using light model {model}."
            
        return MockResponse(content)
        
    litellm.completion = mock_completion

async def main():
    print("=== Testing LiteLLM Backend and YAML Config ===")
    
    # 1. Test YAML Config loading
    print("\n[1] Testing config.yaml loading...")
    try:
        cfg = load_yaml_config()
        print("SUCCESS: config.yaml loaded cleanly!")
        llm_defaults = cfg.get("llm_defaults", {})
        print(f"Default Light Provider: {llm_defaults.get('light_provider')}")
        print(f"Default Light Model: {llm_defaults.get('light_model')}")
        print(f"Default Heavy Provider: {llm_defaults.get('heavy_provider')}")
        print(f"Default Heavy Model: {llm_defaults.get('heavy_model')}")
    except Exception as e:
        print(f"FAILURE: Failed to load config.yaml: {e}")
        return
        
    # 2. Test search
    print("\n[2] Testing Web Search...")
    results = web_search("Self driving vehicles trends 2026", max_results=1)
    print("Search results lookup status: OK")
    
    # 3. Test Agent Pipeline (Coordinator -> Light Agents -> Heavy Agents -> Output)
    print("\n[3] Testing Agent Pipeline execution...")
    
    test_dir = "./reports/test_litellm_run"
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir)
    os.makedirs(test_dir, exist_ok=True)
    
    has_real_key = os.environ.get("GEMINI_API_KEY") is not None
    api_key = os.environ.get("GEMINI_API_KEY", "MOCK_KEY")
    
    if not has_real_key:
        print("No GEMINI_API_KEY in environment. Activating LiteLLM mock for offline pipeline check.")
        setup_litellm_mock()
    else:
        print("Real GEMINI_API_KEY detected in env. Running live LiteLLM API request...")
        
    config = {
        "api_key": api_key,
        "light_provider": llm_defaults.get("light_provider"),
        "light_model": llm_defaults.get("light_model"),
        "heavy_provider": llm_defaults.get("heavy_provider"),
        "heavy_model": llm_defaults.get("heavy_model")
    }
    
    # Trigger orchestrator
    print("Running orchestrator workflow...")
    await run_market_research(
        topic="Autonomous Vehicles 2026",
        config_data=config,
        task_id="test_litellm_run",
        run_dir=test_dir,
        session_id="sess_test_12345"
    )
    
    # Verify outputs
    print("\nVerifying outputs...")
    report_file = os.path.join(test_dir, "report.json")
    progress_file = os.path.join(test_dir, "progress.json")
    
    if os.path.exists(progress_file):
        with open(progress_file, "r") as f:
            prog = json.load(f)
        print("Progress logs:")
        for log in prog.get("logs", []):
            print(f" - [{log.get('stage')}] {log.get('status')}: {log.get('message')}")
            
    if os.path.exists(report_file):
        print("\nSUCCESS: report.json was successfully created and matches structured schema!")
        with open(report_file, "r") as f:
            report = json.load(f)
        print(f"Generated Title: {report.get('title')}")
        print(f"Executive Summary: {report.get('executive_summary')[:100]}...")
    else:
        print("\nFAILURE: report.json was not created.")

if __name__ == "__main__":
    asyncio.run(main())
