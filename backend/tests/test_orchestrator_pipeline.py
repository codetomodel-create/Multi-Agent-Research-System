"""Regression tests for the multi-agent orchestration pipeline.

All LiteLLM traffic is stubbed; no test performs a network call.
"""
import asyncio
import json
import os

import pytest


class _Msg:
    def __init__(self, content):
        self.content = content


class _Choice:
    def __init__(self, content):
        self.message = _Msg(content)


class _Resp:
    def __init__(self, content):
        self.choices = [_Choice(content)]


VALID_REPORT = {
    "topic": "t", "title": "T", "executive_summary": "s", "market_overview": "m",
    "competitor_analysis": "c", "swot_analysis": "w",
    "strategic_recommendations": "r", "critique_notes": "n",
}


def _stub_completion(content_for_json=None):
    def _fn(**kwargs):
        if kwargs.get("response_format"):
            return _Resp(content_for_json if content_for_json is not None
                         else json.dumps(VALID_REPORT))
        return _Resp("draft text")
    return _fn


@pytest.fixture()
def orchestrator(app_module):
    import backend.agent_orchestrator as ao
    return ao


def _run(orchestrator, app_module, task_id, config=None):
    run_dir = os.path.join(app_module.REPORTS_DIR, task_id)
    os.makedirs(run_dir, exist_ok=True)
    asyncio.run(orchestrator.run_market_research(
        topic="Coffee in Brooklyn",
        config_data=config if config is not None else {"enable_web_search": False},
        task_id=task_id,
        run_dir=run_dir,
        session_id="sess_test",
    ))
    with open(os.path.join(run_dir, "progress.json")) as f:
        progress = json.load(f)
    return run_dir, progress


def test_happy_path_produces_report(orchestrator, app_module, monkeypatch):
    import litellm
    monkeypatch.setattr(litellm, "completion", _stub_completion())

    run_dir, progress = _run(orchestrator, app_module, "happy")

    assert progress["status"] == "success"
    with open(os.path.join(run_dir, "report.json")) as f:
        report = json.load(f)
    assert set(report) == set(VALID_REPORT)


def test_cancel_event_is_released_after_success(orchestrator, app_module, monkeypatch):
    import litellm
    monkeypatch.setattr(litellm, "completion", _stub_completion())
    _run(orchestrator, app_module, "cleanup-success")
    assert "cleanup-success" not in orchestrator.cancel_events


def test_cancel_event_is_released_when_config_missing(orchestrator, app_module, monkeypatch):
    monkeypatch.setattr(orchestrator, "CONFIG_FILE", os.path.join(app_module.WORKSPACE_DIR, "missing.yaml"))
    _, progress = _run(orchestrator, app_module, "cleanup-failure")
    assert progress["status"] == "failed"
    assert "cleanup-failure" not in orchestrator.cancel_events


def test_cancel_event_is_released_after_pipeline_error(orchestrator, app_module, monkeypatch):
    import litellm

    def _boom(**kwargs):
        raise RuntimeError("provider exploded")

    monkeypatch.setattr(litellm, "completion", _boom)
    _, progress = _run(orchestrator, app_module, "cleanup-error")
    assert progress["status"] == "failed"
    assert "cleanup-error" not in orchestrator.cancel_events


def test_null_content_does_not_crash_pipeline(orchestrator, app_module, monkeypatch):
    """Gemini safety blocks / tool-only replies return content=None."""
    import litellm
    monkeypatch.setattr(litellm, "completion", lambda **kw: _Resp(None))

    run_dir, progress = _run(orchestrator, app_module, "nullcontent")

    # The documented degradation path is taken instead of an AttributeError.
    assert progress["status"] == "success"
    with open(os.path.join(run_dir, "report.json")) as f:
        report = json.load(f)
    assert set(report) == set(VALID_REPORT)


def test_malformed_json_falls_back_to_structured_report(orchestrator, app_module, monkeypatch):
    import litellm
    monkeypatch.setattr(litellm, "completion", _stub_completion(content_for_json="not json at all"))

    run_dir, progress = _run(orchestrator, app_module, "badjson")

    assert progress["status"] == "success"
    with open(os.path.join(run_dir, "report.json")) as f:
        report = json.load(f)
    assert set(report) == set(VALID_REPORT)
    assert "Coffee in Brooklyn" in report["topic"]


def test_error_message_does_not_leak_internals(orchestrator, app_module, monkeypatch):
    import litellm

    def _boom(**kwargs):
        raise RuntimeError("secret-internal-path C:/keys/token.pem")

    monkeypatch.setattr(litellm, "completion", _boom)
    _, progress = _run(orchestrator, app_module, "leaky-error")
    joined = json.dumps(progress)
    assert "secret-internal-path" not in joined
    assert "token.pem" not in joined


def test_mock_patch_is_idempotent(orchestrator):
    """A 'MOCK' api key must not stack wrappers on litellm.completion."""
    import litellm

    original = orchestrator._ORIGINAL_COMPLETION
    try:
        orchestrator.setup_litellm_mock_local()
        first = litellm.completion
        orchestrator.setup_litellm_mock_local()
        assert litellm.completion is first, "mock re-wrapped itself"
    finally:
        orchestrator.teardown_litellm_mock_local()
    assert litellm.completion is original


def test_web_search_disabled_avoids_network(orchestrator, app_module, monkeypatch):
    import litellm
    monkeypatch.setattr(litellm, "completion", _stub_completion())

    def _explode(*args, **kwargs):
        raise AssertionError("web_search must not be called when disabled")

    monkeypatch.setattr(orchestrator, "web_search", _explode)
    _, progress = _run(orchestrator, app_module, "nosearch", {"enable_web_search": False})
    assert progress["status"] == "success"


def test_content_extraction_tolerates_broken_responses(orchestrator):
    assert orchestrator._content_of(_Resp(None)) == ""
    assert orchestrator._content_of(_Resp("hello")) == "hello"

    class _Empty:
        choices = []

    assert orchestrator._content_of(_Empty()) == ""
    assert orchestrator._content_of(object()) == ""


def test_progress_timestamps_are_timezone_aware(orchestrator, app_module, monkeypatch):
    import litellm
    from datetime import datetime

    monkeypatch.setattr(litellm, "completion", _stub_completion())
    _, progress = _run(orchestrator, app_module, "timestamps")
    for entry in progress["logs"]:
        assert datetime.fromisoformat(entry["timestamp"]).tzinfo is not None
