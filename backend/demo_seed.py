"""Deterministic LinkedIn-demo fixtures.

Writes two completed runs so Compare is never empty, using the same report
shape as ``MOCK_LLM=1``. Idempotent: existing seeded directories are reused.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.agent_orchestrator import PIPELINE_STAGES, mock_report_fixture

DEMO_LAUNCH = {
    "idea": "AI-powered specialty coffee subscription for remote workers",
    "location": "Bengaluru",
}

DEMO_RUNS = (
    {
        "task_id": "linkedin-demo-remote",
        "idea": "AI-powered specialty coffee subscription for remote workers",
        "location": "Bengaluru",
        "age_minutes": 4,
    },
    {
        "task_id": "linkedin-demo-office",
        "idea": "AI-powered specialty coffee subscription for office parks",
        "location": "Bengaluru",
        "age_minutes": 12,
    },
)

_TOKENS_PER_STAGE = 768
_STAGE_MS = 2000


def topic_of(idea: str, location: str) -> str:
    return f"{idea} in {location}"


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat()


def _stage_rows(started: datetime) -> list[dict[str, Any]]:
    rows = []
    for index, name in enumerate(PIPELINE_STAGES):
        begin = started + timedelta(milliseconds=_STAGE_MS * index)
        end = begin + timedelta(milliseconds=_STAGE_MS)
        rows.append({
            "name": name,
            "status": "completed",
            "started_at": _iso(begin),
            "ended_at": _iso(end),
            "duration_ms": _STAGE_MS,
            "tokens": _TOKENS_PER_STAGE,
            "cost_usd": 0.0,
        })
    return rows


def _logs(topic: str, started: datetime) -> list[dict[str, Any]]:
    messages = [
        ("Queue", "completed", f"Coordinator planned the run for '{topic}'."),
        ("Researching", "completed", "Research, Competitor, Pricing and Trends finished in parallel."),
        ("Critique", "completed", "Writer compiled the four drafts into one narrative."),
        ("Polishing", "completed", "Fact Checker audited gaps and emitted the structured report."),
    ]
    logs = []
    for index, (stage, status, message) in enumerate(messages):
        logs.append({
            "timestamp": _iso(started + timedelta(milliseconds=_STAGE_MS * (index + 1))),
            "stage": stage,
            "status": status,
            "message": message,
        })
    return logs


def _write_run(reports_dir: str, spec: dict[str, Any], now: datetime) -> dict[str, str]:
    topic = topic_of(spec["idea"], spec["location"])
    task_id = spec["task_id"]
    run_dir = os.path.join(reports_dir, task_id)
    started = now - timedelta(minutes=spec["age_minutes"])
    ended = started + timedelta(milliseconds=_STAGE_MS * len(PIPELINE_STAGES))
    os.makedirs(run_dir, exist_ok=True)

    report_path = os.path.join(run_dir, "report.json")
    if not os.path.exists(report_path):
        with open(os.path.join(run_dir, "meta.json"), "w", encoding="utf-8") as handle:
            json.dump({
                "task_id": task_id,
                "topic": topic,
                "created_at": _iso(started),
                "light_model": "ollama/llama3.1:8b",
                "heavy_model": "ollama/llama3.1:8b",
            }, handle, indent=2)
        with open(os.path.join(run_dir, "progress.json"), "w", encoding="utf-8") as handle:
            json.dump({
                "task_id": task_id,
                "topic": topic,
                "status": "success",
                "started_at": _iso(started),
                "updated_at": _iso(ended),
                "stages": _stage_rows(started),
                "totals": {
                    "tokens": _TOKENS_PER_STAGE * len(PIPELINE_STAGES),
                    "cost_usd": 0.0,
                    "duration_ms": _STAGE_MS * len(PIPELINE_STAGES),
                },
                "logs": _logs(topic, started),
            }, handle, indent=2)
        with open(report_path, "w", encoding="utf-8") as handle:
            json.dump(mock_report_fixture(topic), handle, indent=2)

    return {"task_id": task_id, "topic": topic}


def inspect_linkedin_demo(reports_dir: str) -> dict[str, Any]:
    """Reports launch defaults and whether Compare fixtures already exist."""
    runs = []
    seeded = True
    for spec in DEMO_RUNS:
        topic = topic_of(spec["idea"], spec["location"])
        report_path = os.path.join(reports_dir, spec["task_id"], "report.json")
        exists = os.path.isfile(report_path)
        seeded = seeded and exists
        runs.append({"task_id": spec["task_id"], "topic": topic})
    return {
        "status": "ready" if seeded else "unseeded",
        "seeded": seeded,
        "runs": runs,
        "launch": dict(DEMO_LAUNCH),
    }


def seed_linkedin_demo(reports_dir: str) -> dict[str, Any]:
    """Ensure both Compare fixtures exist. Safe to call on every demo boot."""
    os.makedirs(reports_dir, exist_ok=True)
    now = datetime.now(timezone.utc)
    for spec in DEMO_RUNS:
        _write_run(reports_dir, spec, now)
    return inspect_linkedin_demo(reports_dir)
