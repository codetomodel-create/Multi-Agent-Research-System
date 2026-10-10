"""Contract tests for the endpoints the 3D UI depends on.

One test (or parametrised group) per row of the API contract table in
``project_documentation.md``. Everything here runs offline: the pipeline is
exercised through ``MOCK_LLM=1`` rather than a live provider.
"""
import json
import os

import pytest


REPORT_FIELDS = [
    "topic", "title", "executive_summary", "market_overview",
    "competitor_analysis", "swot_analysis", "strategic_recommendations",
    "critique_notes",
]


def _write_run(app_module, task_id, *, topic="Coffee Shop", status="success",
               report=None, totals=None):
    """Materialises a finished run on disk without running the pipeline."""
    run_dir = os.path.join(app_module.REPORTS_DIR, task_id)
    os.makedirs(run_dir, exist_ok=True)
    with open(os.path.join(run_dir, "meta.json"), "w") as f:
        json.dump({
            "task_id": task_id, "topic": topic,
            "created_at": "2026-01-01T00:00:00+00:00",
            "light_model": "ollama/llama3.1:8b", "heavy_model": "ollama/llama3.1:8b",
        }, f)
    with open(os.path.join(run_dir, "progress.json"), "w") as f:
        json.dump({
            "task_id": task_id, "topic": topic, "status": status,
            "started_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:10+00:00",
            "stages": [{"name": "Queue", "status": "completed",
                        "started_at": "2026-01-01T00:00:00+00:00",
                        "ended_at": "2026-01-01T00:00:02+00:00",
                        "duration_ms": 2000, "tokens": 100, "cost_usd": 0.001}],
            "totals": totals or {"tokens": 100, "cost_usd": 0.001, "duration_ms": 10000},
            "logs": [{"timestamp": "2026-01-01T00:00:00+00:00", "stage": "Queue",
                      "status": "completed", "message": "done"}],
        }, f)
    if status == "success":
        body = report or {f: f"{f} value for {topic}" for f in REPORT_FIELDS}
        body["topic"] = topic
        with open(os.path.join(run_dir, "report.json"), "w") as f:
            json.dump(body, f)
    return run_dir


# ── GET /api/health ──────────────────────────────────────────────────────────

def test_health_reports_mock_flag_off_by_default(client):
    body = client.get("/api/health").json()
    assert body["mock_llm"] is False


def test_health_reports_mock_flag_when_enabled(client, monkeypatch):
    monkeypatch.setenv("MOCK_LLM", "1")
    assert client.get("/api/health").json()["mock_llm"] is True


# ── GET /api/runs ────────────────────────────────────────────────────────────

def test_list_runs_exposes_duration_tokens_and_cost(client, app_module):
    _write_run(app_module, "aaaaaaaa-0000-0000-0000-0000000000aa")
    row = client.get("/api/runs").json()[0]
    assert row["duration_ms"] == 10000
    assert row["tokens"] == 100
    assert row["cost_usd"] == pytest.approx(0.001)
    assert row["status"] == "success"


# ── GET /api/runs/{id}/progress ──────────────────────────────────────────────

def test_progress_returns_stage_table_and_totals(client, app_module):
    _write_run(app_module, "aaaaaaaa-0000-0000-0000-0000000000bb")
    body = client.get("/api/runs/aaaaaaaa-0000-0000-0000-0000000000bb/progress").json()
    assert body["totals"]["tokens"] == 100
    assert body["stages"][0]["name"] == "Queue"
    assert body["stages"][0]["duration_ms"] == 2000


def test_progress_backfills_stages_for_legacy_files(client, app_module):
    """Runs written before per-stage accounting still render a timeline."""
    run_dir = os.path.join(app_module.REPORTS_DIR, "aaaaaaaa-0000-0000-0000-0000000000cc")
    os.makedirs(run_dir, exist_ok=True)
    with open(os.path.join(run_dir, "progress.json"), "w") as f:
        json.dump({"status": "success", "logs": [
            {"timestamp": "2026-01-01T00:00:00+00:00", "stage": "Queue",
             "status": "completed", "message": "legacy"},
        ]}, f)

    body = client.get("/api/runs/aaaaaaaa-0000-0000-0000-0000000000cc/progress").json()
    names = [s["name"] for s in body["stages"]]
    assert names[:4] == ["Queue", "Researching", "Critique", "Polishing"]
    assert body["totals"] == {"tokens": 0, "cost_usd": 0.0, "duration_ms": 0}


# ── GET /api/runs/{id}/export ────────────────────────────────────────────────

def test_export_json_is_a_download(client, app_module):
    _write_run(app_module, "aaaaaaaa-0000-0000-0000-0000000000dd", topic="Bike Shop")
    resp = client.get("/api/runs/aaaaaaaa-0000-0000-0000-0000000000dd/export?format=json")
    assert resp.status_code == 200
    assert "attachment" in resp.headers["content-disposition"]
    assert resp.json()["topic"] == "Bike Shop"


def test_export_markdown_contains_every_section(client, app_module):
    _write_run(app_module, "aaaaaaaa-0000-0000-0000-0000000000ee")
    resp = client.get("/api/runs/aaaaaaaa-0000-0000-0000-0000000000ee/export?format=markdown")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/markdown")
    for _, label in app_module.REPORT_SECTIONS:
        assert f"### {label}" in resp.text


def test_export_rejects_unknown_format(client, app_module):
    _write_run(app_module, "aaaaaaaa-0000-0000-0000-0000000000ef")
    resp = client.get("/api/runs/aaaaaaaa-0000-0000-0000-0000000000ef/export?format=pdf")
    assert resp.status_code == 422


def test_export_filename_cannot_inject_headers(client, app_module):
    _write_run(app_module, "aaaaaaaa-0000-0000-0000-0000000000f0",
               topic='ev"\r\nX-Injected: 1')
    resp = client.get("/api/runs/aaaaaaaa-0000-0000-0000-0000000000f0/export?format=markdown")
    assert resp.status_code == 200
    assert "x-injected" not in {k.lower() for k in resp.headers}
    assert '"' not in resp.headers["content-disposition"].split("filename=")[1][1:-1]


@pytest.mark.parametrize("bad_id", ["..", "%2e%2e", "C:\\Windows"])
def test_export_rejects_traversal_ids(client, bad_id):
    assert client.get(f"/api/runs/{bad_id}/export").status_code == 404


def test_export_404_for_unknown_run(client):
    resp = client.get("/api/runs/aaaaaaaa-0000-0000-0000-00000000ffff/export")
    assert resp.status_code == 404


# ── GET /api/runs/compare ────────────────────────────────────────────────────

def test_compare_diffs_sections(client, app_module):
    _write_run(app_module, "aaaaaaaa-0000-0000-0000-000000000101", topic="Alpha")
    _write_run(app_module, "aaaaaaaa-0000-0000-0000-000000000102", topic="Beta")
    resp = client.get("/api/runs/compare", params={
        "a": "aaaaaaaa-0000-0000-0000-000000000101",
        "b": "aaaaaaaa-0000-0000-0000-000000000102",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["a"]["topic"] == "Alpha"
    assert body["b"]["topic"] == "Beta"
    sections = {s["section"] for s in body["sections"]}
    assert {"swot_analysis", "competitor_analysis", "strategic_recommendations"} <= sections
    assert all(s["identical"] is False for s in body["sections"])


def test_compare_marks_identical_sections(client, app_module):
    same = {f: "same" for f in REPORT_FIELDS}
    _write_run(app_module, "aaaaaaaa-0000-0000-0000-000000000103", topic="X", report=dict(same))
    _write_run(app_module, "aaaaaaaa-0000-0000-0000-000000000104", topic="X", report=dict(same))
    body = client.get("/api/runs/compare", params={
        "a": "aaaaaaaa-0000-0000-0000-000000000103",
        "b": "aaaaaaaa-0000-0000-0000-000000000104",
    }).json()
    assert all(s["identical"] for s in body["sections"])


def test_compare_rejects_same_run_twice(client, app_module):
    _write_run(app_module, "aaaaaaaa-0000-0000-0000-000000000105")
    resp = client.get("/api/runs/compare", params={
        "a": "aaaaaaaa-0000-0000-0000-000000000105",
        "b": "aaaaaaaa-0000-0000-0000-000000000105",
    })
    assert resp.status_code == 400


def test_compare_404_for_missing_run(client, app_module):
    _write_run(app_module, "aaaaaaaa-0000-0000-0000-000000000106")
    resp = client.get("/api/runs/compare", params={
        "a": "aaaaaaaa-0000-0000-0000-000000000106",
        "b": "aaaaaaaa-0000-0000-0000-00000000dead",
    })
    assert resp.status_code == 404


@pytest.mark.parametrize("bad_id", ["..", "../..", "C:\\Windows", "a b"])
def test_compare_rejects_traversal_ids(client, app_module, bad_id):
    _write_run(app_module, "aaaaaaaa-0000-0000-0000-000000000107")
    resp = client.get("/api/runs/compare", params={
        "a": bad_id, "b": "aaaaaaaa-0000-0000-0000-000000000107",
    })
    assert resp.status_code == 404


# ── POST /api/runs/{id}/retry ────────────────────────────────────────────────

def test_retry_launches_a_new_run_with_the_same_topic(client, app_module, monkeypatch):
    async def _fake_run(**kwargs):
        return None

    monkeypatch.setattr(app_module, "run_market_research", _fake_run)
    _write_run(app_module, "aaaaaaaa-0000-0000-0000-000000000201", topic="Tea House")

    resp = client.post("/api/runs/aaaaaaaa-0000-0000-0000-000000000201/retry")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["topic"] == "Tea House"
    assert body["status"] == "queued"
    assert body["task_id"] != "aaaaaaaa-0000-0000-0000-000000000201"


def test_retry_404_for_unknown_run(client):
    assert client.post("/api/runs/aaaaaaaa-0000-0000-0000-0000000002ff/retry").status_code == 404


@pytest.mark.parametrize("bad_id", ["..", "%2e%2e"])
def test_retry_rejects_traversal_ids(client, bad_id):
    assert client.post(f"/api/runs/{bad_id}/retry").status_code == 404


# ── POST /api/runs/{id}/cancel ───────────────────────────────────────────────

def test_cancel_is_idempotent_for_finished_runs(client, app_module):
    _write_run(app_module, "aaaaaaaa-0000-0000-0000-000000000301")
    body = client.post("/api/runs/aaaaaaaa-0000-0000-0000-000000000301/cancel").json()
    assert body["status"] == "ignored"


def test_cancel_signals_a_running_task(client, app_module):
    import asyncio

    _write_run(app_module, "aaaaaaaa-0000-0000-0000-000000000302", status="running")
    event = asyncio.Event()
    app_module.cancel_events["aaaaaaaa-0000-0000-0000-000000000302"] = event
    try:
        body = client.post("/api/runs/aaaaaaaa-0000-0000-0000-000000000302/cancel").json()
        assert body["status"] == "success"
        assert event.is_set()
        progress = client.get("/api/runs/aaaaaaaa-0000-0000-0000-000000000302/progress").json()
        assert progress["status"] == "cancelled"
    finally:
        app_module.cancel_events.pop("aaaaaaaa-0000-0000-0000-000000000302", None)


# ── POST /api/providers/test ─────────────────────────────────────────────────

def test_connection_test_reports_unreachable_without_a_key(client):
    body = client.post("/api/providers/test", json={"provider": "openai"}).json()
    assert body["reachable"] is False
    assert body["latency_ms"] >= 0
    assert "api_key" in body["detail"]


def test_connection_test_reports_latency_and_count(client, app_module, monkeypatch):
    async def _fake_fetch(api_key):
        return [{"id": "gpt-4o"}, {"id": "gpt-4o-mini"}]

    monkeypatch.setattr(app_module.ProviderModelFetcher, "fetch_openai_models", _fake_fetch)
    body = client.post(
        "/api/providers/test", json={"provider": "openai", "api_key": "sk-test"}
    ).json()
    assert body["reachable"] is True
    assert body["model_count"] == 2
    assert body["provider"] == "openai"


def test_connection_test_never_echoes_the_key(client):
    body = client.post(
        "/api/providers/test",
        json={"provider": "ollama", "base_url": "http://127.0.0.1:1/"},
    ).text
    assert "sk-" not in body


def test_connection_test_rejects_unknown_provider(client):
    body = client.post("/api/providers/test", json={"provider": "nope"}).json()
    assert body["reachable"] is False


def test_connection_test_requires_a_provider(client):
    assert client.post("/api/providers/test", json={}).status_code == 422


# ── MOCK_LLM end-to-end pipeline ─────────────────────────────────────────────

def test_mock_llm_run_produces_a_full_report(client, app_module, monkeypatch):
    """The whole pipeline must complete offline with MOCK_LLM=1."""
    import asyncio

    import backend.agent_orchestrator as orchestrator

    monkeypatch.setenv("MOCK_LLM", "1")

    resp = client.post("/research", json={
        "idea": "Solar Panels", "location": "Austin", "enable_web_search": True,
    })
    assert resp.status_code == 200, resp.text
    task_id = resp.json()["task_id"]

    run_dir = os.path.join(app_module.REPORTS_DIR, task_id)
    asyncio.run(orchestrator.run_market_research(
        topic="Solar Panels in Austin",
        config_data={"enable_web_search": True},
        task_id=task_id,
        run_dir=run_dir,
        session_id="sess_test",
    ))

    report = client.get(f"/api/runs/{task_id}/report")
    assert report.status_code == 200, report.text
    body = report.json()
    assert body["topic"] == "Solar Panels in Austin"
    assert all(body[f] for f in REPORT_FIELDS)

    progress = client.get(f"/api/runs/{task_id}/progress").json()
    assert progress["status"] == "success"
    assert progress["totals"]["tokens"] > 0
    completed = [s for s in progress["stages"] if s["status"] in ("completed", "success")]
    assert len(completed) == 4
    assert all(s["duration_ms"] is not None for s in completed)


def test_mock_llm_is_deterministic(app_module, monkeypatch):
    import backend.agent_orchestrator as orchestrator

    monkeypatch.setenv("MOCK_LLM", "1")
    first = orchestrator.mock_report_fixture("Solar Panels")
    second = orchestrator.mock_report_fixture("Solar Panels")
    assert first == second
    assert first["topic"] == "Solar Panels"


def test_mock_llm_does_not_hit_the_network_for_search(monkeypatch):
    import backend.search_tool as search_tool

    def _explode(*_args, **_kwargs):
        raise AssertionError("DDGS must not be constructed while MOCK_LLM is on")

    monkeypatch.setenv("MOCK_LLM", "1")
    monkeypatch.setattr(search_tool, "DDGS", _explode)
    out = search_tool.web_search("anything", max_results=2)
    assert "Fixture source 1" in out


@pytest.mark.parametrize("value,expected", [
    (None, 0.0), ("0", 0.0), ("600", 0.6), ("-5", 0.0), ("not-a-number", 0.0),
])
def test_mock_delay_parsing(monkeypatch, value, expected):
    """The E2E harness relies on this knob to reach mid-run UI states."""
    import backend.agent_orchestrator as orchestrator

    if value is None:
        monkeypatch.delenv("MOCK_LLM_DELAY_MS", raising=False)
    else:
        monkeypatch.setenv("MOCK_LLM_DELAY_MS", value)
    assert orchestrator.mock_llm_delay_seconds() == pytest.approx(expected)


# ── Malformed input ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("body", [
    b"{not json", b"", b"[]", b'"a string"', b"null", b'{"idea": {"nested": 1}}',
    b'{"idea": "x", "enable_web_search": "maybe"}',
])
def test_research_rejects_malformed_bodies_with_422(client, body):
    """A bad body must never reach the handler and never produce a 500."""
    resp = client.post(
        "/research", content=body, headers={"Content-Type": "application/json"}
    )
    assert resp.status_code == 422, f"{body!r} -> {resp.status_code}"


@pytest.mark.parametrize("body", [b"{not json", b"[]", b"null"])
def test_settings_rejects_malformed_bodies_with_422(client, body):
    resp = client.post(
        "/settings", content=body, headers={"Content-Type": "application/json"}
    )
    assert resp.status_code == 422, f"{body!r} -> {resp.status_code}"


def test_progress_survives_a_corrupt_progress_file(client, app_module):
    """A truncated progress.json is a 500 with a message, never a stack trace."""
    run_dir = os.path.join(app_module.REPORTS_DIR, "aaaaaaaa-0000-0000-0000-0000000004ff")
    os.makedirs(run_dir, exist_ok=True)
    with open(os.path.join(run_dir, "progress.json"), "w") as f:
        f.write('{"status": "running", "logs": [')

    resp = client.get("/api/runs/aaaaaaaa-0000-0000-0000-0000000004ff/progress")
    assert resp.status_code == 500
    assert "Traceback" not in resp.text


def test_list_runs_survives_a_corrupt_progress_file(client, app_module):
    """One bad run must not take the whole history down."""
    _write_run(app_module, "aaaaaaaa-0000-0000-0000-000000000501", topic="Healthy")
    bad = os.path.join(app_module.REPORTS_DIR, "aaaaaaaa-0000-0000-0000-000000000502")
    os.makedirs(bad, exist_ok=True)
    with open(os.path.join(bad, "meta.json"), "w") as f:
        json.dump({"task_id": "aaaaaaaa-0000-0000-0000-000000000502",
                   "topic": "Broken", "created_at": "2026-01-01T00:00:00+00:00"}, f)
    with open(os.path.join(bad, "progress.json"), "w") as f:
        f.write("{truncated")

    resp = client.get("/api/runs")
    assert resp.status_code == 200
    topics = {r["topic"] for r in resp.json()}
    assert {"Healthy", "Broken"} <= topics
    broken = next(r for r in resp.json() if r["topic"] == "Broken")
    assert broken["status"] == "unknown"


# ── LinkedIn demo fixtures ───────────────────────────────────────────────────

def test_demo_status_is_unseeded_without_writing(client, app_module):
    before = set(os.listdir(app_module.REPORTS_DIR)) if os.path.isdir(app_module.REPORTS_DIR) else set()
    body = client.get("/api/demo").json()
    after = set(os.listdir(app_module.REPORTS_DIR)) if os.path.isdir(app_module.REPORTS_DIR) else set()
    assert body["seeded"] is False
    assert body["status"] == "unseeded"
    assert body["launch"]["location"] == "Bengaluru"
    assert "coffee subscription" in body["launch"]["idea"]
    assert {row["task_id"] for row in body["runs"]} == {
        "linkedin-demo-remote", "linkedin-demo-office",
    }
    assert after == before


def test_demo_seed_writes_two_comparable_reports(client, app_module):
    first = client.post("/api/demo/seed")
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["seeded"] is True
    assert body["status"] == "ready"
    assert len(body["runs"]) == 2

    listed = {row["task_id"]: row for row in client.get("/api/runs").json()}
    for row in body["runs"]:
        summary = listed[row["task_id"]]
        assert summary["status"] == "success"
        report = client.get(f"/api/runs/{row['task_id']}/report")
        assert report.status_code == 200, report.text
        assert report.json()["topic"] == row["topic"]

    compare = client.get(
        "/api/runs/compare"
        f"?a={body['runs'][0]['task_id']}&b={body['runs'][1]['task_id']}"
    )
    assert compare.status_code == 200, compare.text
    assert compare.json()["sections"]

    again = client.post("/api/demo/seed").json()
    assert again["seeded"] is True
    assert {row["task_id"] for row in again["runs"]} == {row["task_id"] for row in body["runs"]}
