"""End-to-end Bedrock credential and pipeline tests.

Covers every fix made for AWS Bedrock support:
  1. Session token with colons is preserved whole (split on first 3 colons only)
  2. api_key kwarg is NOT passed to litellm for Bedrock calls
  3. response_format is NOT sent to Bedrock (Converse API doesn't support it)
  4. Full pipeline completes with a Bedrock-shaped key via MOCK_LLM
  5. Model ID is built correctly (bedrock/converse/region/model)
  6. Bedrock credentials parsed correctly in /api/models endpoint
"""
import asyncio
import json
import os

import pytest

# ── Fixtures ──────────────────────────────────────────────────────────────────

# Real CloudShell session token contains colons — simulate that
BEDROCK_KEY_NO_TOKEN  = "AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY:us-east-1"
BEDROCK_KEY_WITH_TOKEN = (
    "ASIA4K6YBZUE5N5ZXG72"
    ":FNvr+vfKlq+0eUU6CDKifl0rqDxMHKn4U8Chulq7"
    ":us-east-1"
    ":IQoJb3JpZ2luX2VjEKL//wEaCXVzLWVhc3QtMSJG:extra:colons:in:token"
)

BEDROCK_MODEL = "bedrock/converse/us-east-1/anthropic.claude-3-5-sonnet-20240620-v1:0"


class _Resp:
    class _Choice:
        class _Msg:
            def __init__(self, c): self.content = c
        def __init__(self, c): self.message = self._Msg(c)

    class _Usage:
        prompt_tokens = 10
        completion_tokens = 20
        total_tokens = 30

    def __init__(self, content):
        self.choices = [self._Choice(content)]
        self.usage = self._Usage()
        self.model = "mock"


VALID_REPORT = {
    "topic": "t", "title": "T", "executive_summary": "s", "market_overview": "m",
    "competitor_analysis": "c", "swot_analysis": "w",
    "strategic_recommendations": "r", "critique_notes": "n",
}


# ── 1. Session token with colons is preserved whole ───────────────────────────

def test_session_token_with_colons_is_preserved(app_module, monkeypatch):
    """parts[3] must be the full token, not just the first segment."""
    import backend.agent_orchestrator as ao

    captured = {}

    def _fake_completion(**kwargs):
        captured.update(kwargs)
        return _Resp("ok")

    monkeypatch.setattr("litellm.completion", _fake_completion)

    asyncio.run(ao._invoke_litellm(BEDROCK_MODEL, {}, BEDROCK_KEY_WITH_TOKEN))

    full_token = ":".join(BEDROCK_KEY_WITH_TOKEN.split(":", 3)[3:])
    assert captured.get("aws_session_token") == full_token
    assert captured.get("aws_access_key_id") == "ASIA4K6YBZUE5N5ZXG72"
    assert captured.get("aws_region_name") == "us-east-1"


def test_key_without_session_token_sets_no_session_token(app_module, monkeypatch):
    import backend.agent_orchestrator as ao

    captured = {}

    def _fake_completion(**kwargs):
        captured.update(kwargs)
        return _Resp("ok")

    monkeypatch.setattr("litellm.completion", _fake_completion)

    asyncio.run(ao._invoke_litellm(BEDROCK_MODEL, {}, BEDROCK_KEY_NO_TOKEN))

    assert "aws_session_token" not in captured
    assert captured["aws_access_key_id"] == "AKIAIOSFODNN7EXAMPLE"
    assert captured["aws_region_name"] == "us-east-1"


# ── 2. api_key kwarg is NOT passed to litellm for Bedrock ─────────────────────

def test_api_key_not_in_kwargs_for_bedrock(app_module, monkeypatch):
    import backend.agent_orchestrator as ao

    captured = {}

    def _fake_completion(**kwargs):
        captured.update(kwargs)
        return _Resp("ok")

    monkeypatch.setattr("litellm.completion", _fake_completion)

    asyncio.run(ao._invoke_litellm(
        BEDROCK_MODEL,
        {"api_key": "should-be-removed"},
        BEDROCK_KEY_NO_TOKEN,
    ))

    assert "api_key" not in captured


def test_api_key_still_passed_for_non_bedrock(app_module, monkeypatch):
    import backend.agent_orchestrator as ao

    captured = {}

    def _fake_completion(**kwargs):
        captured.update(kwargs)
        return _Resp("ok")

    monkeypatch.setattr("litellm.completion", _fake_completion)

    asyncio.run(ao._invoke_litellm(
        "openai/gpt-4o",
        {"api_key": "sk-test"},
        "sk-test",
    ))

    assert captured.get("api_key") == "sk-test"


# ── 3. response_format NOT sent to Bedrock ────────────────────────────────────

def test_response_format_skipped_for_bedrock(app_module, monkeypatch):
    import backend.agent_orchestrator as ao

    captured = {}

    def _fake_completion(**kwargs):
        captured.update(kwargs)
        return _Resp(json.dumps(VALID_REPORT))

    monkeypatch.setattr("litellm.completion", _fake_completion)

    asyncio.run(ao.run_litellm_agent(
        BEDROCK_MODEL, "sys", "prompt", BEDROCK_KEY_NO_TOKEN,
        response_json=True,
    ))

    assert "response_format" not in captured


def test_response_format_sent_for_openai(app_module, monkeypatch):
    import backend.agent_orchestrator as ao

    captured = {}

    def _fake_completion(**kwargs):
        captured.update(kwargs)
        return _Resp(json.dumps(VALID_REPORT))

    monkeypatch.setattr("litellm.completion", _fake_completion)

    asyncio.run(ao.run_litellm_agent(
        "openai/gpt-4o", "sys", "prompt", "sk-test",
        response_json=True,
    ))

    assert captured.get("response_format") == {"type": "json_object"}


# ── 4. Full pipeline with Bedrock-shaped key via MOCK_LLM ─────────────────────

def test_full_pipeline_with_bedrock_key_mock(app_module, monkeypatch):
    """Pipeline must complete when provider=bedrock and MOCK_LLM=1."""
    import backend.agent_orchestrator as ao

    monkeypatch.setenv("MOCK_LLM", "1")

    task_id = "bedrock-e2e-test"
    run_dir = os.path.join(app_module.REPORTS_DIR, task_id)
    os.makedirs(run_dir, exist_ok=True)

    asyncio.run(ao.run_market_research(
        topic="Car Garage in New York",
        config_data={
            "enable_web_search": False,
            "light_provider": "bedrock",
            "light_model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
            "light_api_key": BEDROCK_KEY_WITH_TOKEN,
            "heavy_provider": "bedrock",
            "heavy_model": "anthropic.claude-3-haiku-20240307-v1:0",
            "heavy_api_key": BEDROCK_KEY_WITH_TOKEN,
        },
        task_id=task_id,
        run_dir=run_dir,
        session_id="sess_bedrock_test",
    ))

    with open(os.path.join(run_dir, "progress.json")) as f:
        progress = json.load(f)

    assert progress["status"] == "success", f"Pipeline failed: {progress['logs'][-1]['message']}"

    with open(os.path.join(run_dir, "report.json")) as f:
        report = json.load(f)

    for field in VALID_REPORT:
        assert field in report, f"Missing field: {field}"


# ── 5. Model ID built correctly ───────────────────────────────────────────────

def test_bedrock_model_id_uses_converse_for_claude(app_module, monkeypatch):
    import backend.agent_orchestrator as ao

    monkeypatch.setenv("MOCK_LLM", "1")

    task_id = "bedrock-model-id-test"
    run_dir = os.path.join(app_module.REPORTS_DIR, task_id)
    os.makedirs(run_dir, exist_ok=True)

    called_models = []
    original_invoke = ao._invoke_litellm

    async def _capture(model, kwargs, api_key, usage_out=None):
        called_models.append(model)
        return await original_invoke(model, kwargs, api_key, usage_out)

    monkeypatch.setattr(ao, "_invoke_litellm", _capture)

    asyncio.run(ao.run_market_research(
        topic="Test",
        config_data={
            "enable_web_search": False,
            "light_provider": "bedrock",
            "light_model": "anthropic.claude-3-haiku-20240307-v1:0",
            "light_api_key": BEDROCK_KEY_NO_TOKEN,
            "heavy_provider": "bedrock",
            "heavy_model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
            "heavy_api_key": BEDROCK_KEY_NO_TOKEN,
        },
        task_id=task_id,
        run_dir=run_dir,
    ))

    assert any("bedrock/converse/us-east-1/" in m for m in called_models), \
        f"Expected converse path in models: {called_models}"


# ── 6. /api/models Bedrock credential parsing ─────────────────────────────────

def test_api_models_bedrock_parses_key_with_session_token(client, monkeypatch):
    """POST /api/models must parse ACCESS:SECRET:REGION:TOKEN correctly."""
    import backend.main as main

    def _fake_fetch(access_key, secret_key, region, session_token=None):
        assert access_key == "ASIA4K6YBZUE5N5ZXG72"
        assert region == "us-east-1"
        assert session_token is not None and len(session_token) > 10
        return [{"id": "anthropic.claude-3-haiku-20240307-v1:0",
                 "name": "Claude 3 Haiku"}]

    monkeypatch.setattr(main.ProviderModelFetcher, "fetch_bedrock_models", _fake_fetch)

    resp = client.post("/api/models", json={
        "provider": "bedrock",
        "api_key": BEDROCK_KEY_WITH_TOKEN,
    })
    assert resp.status_code == 200, resp.text
    models = resp.json()["models"]
    assert any("claude" in m["id"] for m in models)


def test_api_models_bedrock_rejects_incomplete_key(client):
    resp = client.post("/api/models", json={
        "provider": "bedrock",
        "api_key": "ONLYONEPART",
    })
    assert resp.status_code == 400
    assert "REGION" in resp.json()["detail"].upper() or "bedrock" in resp.json()["detail"].lower()
