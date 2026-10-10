"""Shared pytest fixtures.

Every test runs against an isolated temporary WORKSPACE_DIR so that no test can
touch the developer's real ``reports/``, ``logs/`` or ``backend/config.json``.
"""
import importlib
import os
import shutil
import sys
import tempfile

import pytest

# Must be set before ``litellm`` is imported anywhere: on import LiteLLM fetches
# its model-cost map over the network, which makes the suite fail on an offline
# or DNS-restricted machine. The bundled local copy is equivalent for our tests.
os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


@pytest.fixture()
def workspace(monkeypatch):
    """Isolated workspace with a real config.yaml copied in."""
    tmp = tempfile.mkdtemp(prefix="mras_test_")
    os.makedirs(os.path.join(tmp, "config"), exist_ok=True)
    shutil.copy(
        os.path.join(REPO_ROOT, "config", "config.yaml"),
        os.path.join(tmp, "config", "config.yaml"),
    )
    monkeypatch.setenv("WORKSPACE_DIR", tmp)
    yield tmp
    shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture()
def app_module(workspace):
    """Reloads backend.main so module-level paths bind to the temp workspace."""
    import backend.observability as observability
    import backend.agent_orchestrator as orchestrator
    import backend.main as main

    importlib.reload(observability)
    importlib.reload(orchestrator)
    importlib.reload(main)
    yield main


@pytest.fixture()
def client(app_module):
    from fastapi.testclient import TestClient

    with TestClient(app_module.app) as c:
        yield c
