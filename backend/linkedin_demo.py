"""Boot the LinkedIn presenter: fixture LLM, seeded Compare runs, ?demo=1 URL."""
from __future__ import annotations

import os
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

os.environ.setdefault("MOCK_LLM", "1")
os.environ.setdefault("MOCK_LLM_DELAY_MS", "600")
os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")

PORT = int(os.environ.get("BACKEND_PORT", "8000"))
HOST = os.environ.get("DEMO_HOST", "0.0.0.0")
DEMO_URL = f"http://localhost:{PORT}/?demo=1"


def _wait_for_health(timeout: float = 90.0) -> None:
    deadline = time.time() + timeout
    url = f"http://127.0.0.1:{PORT}/api/health"
    last_error = None
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1)
            return
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
            time.sleep(0.4)
    raise SystemExit(f"Backend did not become ready: {last_error}")


def _seed() -> None:
    req = urllib.request.Request(
        f"http://127.0.0.1:{PORT}/api/demo/seed",
        data=b"{}",
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode("utf-8")
    print(body)


def _after_boot() -> None:
    try:
        _wait_for_health()
        _seed()
        print("")
        print("LinkedIn demo is ready.")
        print(f"Open:   {DEMO_URL}")
        print(f"Script: {os.path.join(ROOT, 'docs', 'LINKEDIN_DEMO.md')}")
        print("Press Ctrl+C to stop.")
        webbrowser.open(DEMO_URL)
    except Exception as exc:
        print(f"Demo helper failed: {exc}", file=sys.stderr)


def main() -> None:
    export = os.path.join(ROOT, "frontend", "out", "index.html")
    if not os.path.isfile(export):
        print(
            "frontend/out is missing. Run: npm --prefix frontend install && npm --prefix frontend run build",
            file=sys.stderr,
        )
        raise SystemExit(1)

    threading.Thread(target=_after_boot, daemon=True).start()
    import uvicorn

    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=False)


if __name__ == "__main__":
    main()
