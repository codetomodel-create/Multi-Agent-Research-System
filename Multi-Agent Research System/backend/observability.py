import os
import json
import re
import getpass
import asyncio
import yaml
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

WORKSPACE_DIR = os.getenv("WORKSPACE_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG_FILE = os.path.join(WORKSPACE_DIR, "config", "config.yaml")

def get_ist_time() -> str:
    """Returns the current time in Indian Standard Time (IST) timezone (UTC+5:30)."""
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    return datetime.now(ist_tz).strftime("%Y-%m-%d %H:%M:%S IST")

def get_log_filepath(session_id: str) -> str:
    """Generates environment-aware file path grouped by YYYY-MM-DD under root logs/ folder."""
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    date_str = datetime.now(ist_tz).strftime("%Y-%m-%d")
    
    # Load config defaults
    yaml_config = {}
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                yaml_config = yaml.safe_load(f) or {}
        except Exception:
            pass
            
    env = yaml_config.get("environment", "dev")
    
    # Environment-aware naming (L3)
    if env.lower() in ("dev", "local", "development"):
        filename = f"localuser_{session_id}.log"
    else:
        username = getpass.getuser()
        filename = f"{username}_{session_id}.log"
        
    return os.path.join(WORKSPACE_DIR, "logs", date_str, filename)

def mask_secret(value: str) -> str:
    """Masks secret keys using the sk-...xxxx format."""
    if not value:
        return value
    if len(value) <= 8:
        return "****"
    # E.g. sk-1234567890abcdef -> sk-123...bcdef
    return f"{value[:6]}...{value[-4:]}"

def scrub_sensitive_data(data: Any) -> Any:
    """Recursively traverses dictionary/list structure to scrub sensitive API keys and passwords (R8)."""
    if isinstance(data, dict):
        cleaned = {}
        for k, v in data.items():
            k_lower = k.lower()
            if any(term in k_lower for term in ("key", "password", "secret", "token")) and isinstance(v, str):
                cleaned[k] = mask_secret(v)
            else:
                cleaned[k] = scrub_sensitive_data(v)
        return cleaned
    elif isinstance(data, list):
        return [scrub_sensitive_data(item) for item in data]
    elif isinstance(data, str):
        # Scrub inline API key strings in raw text using regex
        # E.g. matches sk-..., sk_..., etc.
        pattern = r'\b(sk-[a-zA-Z0-9]{20,})\b'
        def repl(match):
            return mask_secret(match.group(1))
        return re.sub(pattern, repl, data)
    else:
        return data

def write_session_log(
    api_name: str, 
    agent_name: str, 
    session_id: str, 
    input_data: Any, 
    scenario: str, 
    output_or_error_data: Any
):
    """Synchronous file I/O log writer adhering to format L5."""
    ist_time = get_ist_time()
    
    # 1. Scrub keys
    scrubbed_input = scrub_sensitive_data(input_data)
    
    # 2. Format fields
    lines = []
    lines.append(f"[{ist_time}] | API: {api_name} | Agent: {agent_name} | Session: {session_id}")
    lines.append("-" * 80)
    lines.append("INPUT DATA:")
    
    if isinstance(scrubbed_input, (dict, list)):
        lines.append(json.dumps(scrubbed_input, indent=2))
    else:
        lines.append(str(scrubbed_input))
        
    lines.append("-" * 80)
    lines.append(f"SCENARIO: {scenario}")
    lines.append("-" * 80)
    
    if scenario == "SUCCESS":
        lines.append("OUTPUT DATA:")
        scrubbed_output = scrub_sensitive_data(output_or_error_data)
        if isinstance(scrubbed_output, (dict, list)):
            lines.append(json.dumps(scrubbed_output, indent=2))
        else:
            lines.append(str(scrubbed_output))
    else:
        lines.append("ERROR DATA:")
        # Error messages, status, tracebacks
        lines.append(str(output_or_error_data))
        
    lines.append("=" * 80)
    lines.append("\n")
    
    log_content = "\n".join(lines)
    
    # Resolve filepath
    filepath = get_log_filepath(session_id)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    
    # Write (append mode)
    with open(filepath, "a", encoding="utf-8") as f:
        f.write(log_content)

async def log_session_async(
    api_name: str, 
    agent_name: str, 
    session_id: str, 
    input_data: Any, 
    scenario: str, 
    output_or_error_data: Any
):
    """Asynchronously delegates file I/O to a background thread pool (R9)."""
    await asyncio.to_thread(
        write_session_log,
        api_name=api_name,
        agent_name=agent_name,
        session_id=session_id,
        input_data=input_data,
        scenario=scenario,
        output_or_error_data=output_or_error_data
    )
