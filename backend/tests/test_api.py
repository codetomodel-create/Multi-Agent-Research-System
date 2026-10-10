"""Regression tests for the FastAPI layer.

Focus areas are the defects found during the audit: path traversal on the
task-scoped endpoints, CORS exposure, and input validation on /research.
"""
import json
import os
import urllib.parse

import pytest


# ── Path traversal (critical) ────────────────────────────────────────────────

# Note: a bare "." segment is normalised away by HTTP clients before it can
# reach the route, so it is covered by the resolve_run_dir unit test below.
TRAVERSAL_IDS = [
    "..",
    "%2e%2e",
    "....",
    "a/../..",
    "a%2f..%2f..",
    "C:\\Windows",
    "C%3A%5CWindows",
    "\\\\server\\share",
    "run..id",
]


@pytest.mark.parametrize("bad_id", [
    ".", "..", "...", "../..", "..\\..", "C:\\Windows", "/etc/passwd",
    "", " ", "a" * 65, "a b", "a.b", "%2e%2e", "\\\\host\\share", "run/../..",
])
def test_resolve_run_dir_rejects_unsafe_ids(app_module, bad_id):
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        app_module.resolve_run_dir(bad_id)
    assert exc.value.status_code == 404


@pytest.mark.parametrize("good_id", [
    "0f7c9d2e-2c1b-4c33-9f43-2b8b7a4d1e55", "test_litellm_run", "abc-123_XYZ", "a",
])
def test_resolve_run_dir_accepts_generated_ids(app_module, good_id):
    resolved = os.path.realpath(app_module.resolve_run_dir(good_id))
    root = os.path.realpath(app_module.REPORTS_DIR)
    assert resolved.startswith(root + os.sep)


@pytest.mark.parametrize("bad_id", TRAVERSAL_IDS)
def test_delete_run_rejects_traversal_ids(client, bad_id):
    resp = client.request("DELETE", f"/api/runs/{bad_id}")
    assert resp.status_code == 404, resp.text


@pytest.mark.parametrize("bad_id", TRAVERSAL_IDS)
def test_progress_rejects_traversal_ids(client, bad_id):
    resp = client.get(f"/api/runs/{bad_id}/progress")
    assert resp.status_code == 404, resp.text


@pytest.mark.parametrize("bad_id", TRAVERSAL_IDS)
def test_report_rejects_traversal_ids(client, bad_id):
    resp = client.get(f"/api/runs/{bad_id}/report")
    assert resp.status_code == 404, resp.text


@pytest.mark.parametrize("bad_id", TRAVERSAL_IDS)
def test_cancel_rejects_traversal_ids(client, bad_id):
    resp = client.post(f"/api/runs/{bad_id}/cancel")
    assert resp.status_code == 404, resp.text


@pytest.mark.parametrize("bad_id", TRAVERSAL_IDS)
def test_stream_rejects_traversal_ids(client, bad_id):
    resp = client.get(f"/api/runs/{bad_id}/stream")
    assert resp.status_code == 404, resp.text


def test_delete_run_cannot_escape_reports_dir(client, app_module, workspace):
    """A directory outside REPORTS_DIR must survive a delete attempt."""
    victim = os.path.join(workspace, "victim_dir")
    os.makedirs(victim, exist_ok=True)
    marker = os.path.join(victim, "important.txt")
    with open(marker, "w") as f:
        f.write("keep me")

    for payload in ("%2e%2e", urllib.parse.quote(victim, safe=""), "..%5Cvictim_dir"):
        client.request("DELETE", f"/api/runs/{payload}")

    assert os.path.exists(marker), "delete_run escaped REPORTS_DIR"
    assert os.path.isdir(app_module.REPORTS_DIR)


def test_progress_cannot_read_above_reports_dir(client, app_module, workspace):
    """Files one level above REPORTS_DIR must not be readable."""
    with open(os.path.join(workspace, "progress.json"), "w") as f:
        json.dump({"status": "LEAKED", "logs": []}, f)

    resp = client.get("/api/runs/%2e%2e/progress")
    assert resp.status_code == 404
    assert "LEAKED" not in resp.text


def test_delete_run_still_works_for_valid_ids(client, app_module):
    run_dir = os.path.join(app_module.REPORTS_DIR, "0f7c9d2e-2c1b-4c33-9f43-2b8b7a4d1e55")
    os.makedirs(run_dir, exist_ok=True)
    resp = client.request("DELETE", "/api/runs/0f7c9d2e-2c1b-4c33-9f43-2b8b7a4d1e55")
    assert resp.status_code == 200
    assert not os.path.exists(run_dir)


# ── CORS ─────────────────────────────────────────────────────────────────────

def test_cors_does_not_reflect_arbitrary_origin(client):
    resp = client.get("/api/config", headers={"Origin": "https://evil.example"})
    assert resp.headers.get("access-control-allow-origin") != "https://evil.example"


def test_cors_never_enables_credentials(client):
    resp = client.get("/api/config", headers={"Origin": "http://localhost:3000"})
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert resp.headers.get("access-control-allow-credentials") != "true"


def test_cors_preflight_for_delete_is_not_granted_to_unknown_origin(client):
    resp = client.options(
        "/api/runs/abc",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "DELETE",
        },
    )
    assert resp.headers.get("access-control-allow-origin") != "https://evil.example"


# ── Health ───────────────────────────────────────────────────────────────────

def test_health_endpoint(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["config_yaml_present"] is True


# ── /research input validation ───────────────────────────────────────────────

def test_research_requires_a_topic(client):
    resp = client.post("/research", json={})
    assert resp.status_code == 400


def test_research_rejects_whitespace_only_input(client):
    resp = client.post("/research", json={"idea": "   ", "location": "  ", "enable_web_search": False})
    assert resp.status_code == 400, resp.text


def test_research_rejects_oversized_input(client):
    resp = client.post(
        "/research",
        json={"idea": "A" * 50_000, "location": "NY", "enable_web_search": False},
    )
    assert resp.status_code == 422, resp.text


def test_research_accepts_valid_input_and_creates_run(client, app_module, monkeypatch):
    recorded = {}

    async def _fake_run(**kwargs):
        recorded.update(kwargs)

    monkeypatch.setattr(app_module, "run_market_research", _fake_run)

    resp = client.post(
        "/research",
        json={"idea": " Coffee Shop ", "location": " Brooklyn ", "enable_web_search": False},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["topic"] == "Coffee Shop in Brooklyn"
    assert body["status"] == "queued"

    run_dir = os.path.join(app_module.REPORTS_DIR, body["task_id"])
    assert os.path.exists(os.path.join(run_dir, "meta.json"))
    assert os.path.exists(os.path.join(run_dir, "progress.json"))


def test_created_at_is_timezone_aware(client, app_module, monkeypatch):
    async def _fake_run(**kwargs):
        return None

    monkeypatch.setattr(app_module, "run_market_research", _fake_run)
    resp = client.post("/research", json={"idea": "X", "location": "Y", "enable_web_search": False})
    task_id = resp.json()["task_id"]
    with open(os.path.join(app_module.REPORTS_DIR, task_id, "meta.json")) as f:
        meta = json.load(f)
    from datetime import datetime

    parsed = datetime.fromisoformat(meta["created_at"])
    assert parsed.tzinfo is not None, "timestamps must carry a UTC offset for the browser"


# ── Settings round trip ──────────────────────────────────────────────────────

def test_settings_round_trip_masks_keys(client, app_module):
    resp = client.post(
        "/settings",
        json={"light_provider": "openai", "light_model": "gpt-4o",
              "light_api_key": "sk-supersecretkeyvalue123456"},
    )
    assert resp.status_code == 200

    cfg = client.get("/api/config").json()
    assert cfg["light_provider"] == "openai"
    assert cfg["light_model"] == "gpt-4o"
    assert cfg["api_key_configured"] is True
    assert "supersecretkeyvalue" not in json.dumps(cfg)


def test_settings_merge_preserves_unset_values(client):
    client.post("/settings", json={"light_provider": "openai", "light_model": "gpt-4o"})
    client.post("/settings", json={"heavy_provider": "gemini", "heavy_model": "gemini-2.5-pro"})
    cfg = client.get("/api/config").json()
    assert cfg["light_provider"] == "openai"
    assert cfg["heavy_provider"] == "gemini"


# ── /api/models ──────────────────────────────────────────────────────────────

def test_models_rejects_unknown_provider(client):
    resp = client.post("/api/models", json={"provider": "not-a-provider"})
    assert resp.status_code == 400


def test_models_requires_api_key_for_remote_providers(client):
    for provider in ("openai", "anthropic", "gemini", "deepseek", "qwen"):
        resp = client.post("/api/models", json={"provider": provider})
        assert resp.status_code == 400, provider


@pytest.mark.parametrize("bad_url", ["file:///etc/passwd", "gopher://127.0.0.1:11211", "not a url", "ftp://x/"])
def test_models_rejects_non_http_base_url(client, bad_url):
    resp = client.post("/api/models", json={"provider": "ollama", "base_url": bad_url})
    assert resp.status_code == 400, resp.text


# ── Run listing ──────────────────────────────────────────────────────────────

def test_list_runs_skips_corrupt_metadata(client, app_module):
    good = os.path.join(app_module.REPORTS_DIR, "aaaaaaaa-0000-0000-0000-000000000001")
    bad = os.path.join(app_module.REPORTS_DIR, "aaaaaaaa-0000-0000-0000-000000000002")
    os.makedirs(good, exist_ok=True)
    os.makedirs(bad, exist_ok=True)
    with open(os.path.join(good, "meta.json"), "w") as f:
        json.dump({"task_id": "aaaaaaaa-0000-0000-0000-000000000001",
                   "topic": "ok", "created_at": "2026-01-01T00:00:00+00:00"}, f)
    with open(os.path.join(bad, "meta.json"), "w") as f:
        f.write("{not json")

    resp = client.get("/api/runs")
    assert resp.status_code == 200
    topics = [r["topic"] for r in resp.json()]
    assert topics == ["ok"]
