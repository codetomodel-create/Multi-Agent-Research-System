#!/usr/bin/env bash
# One-command LinkedIn demo: fixture pipeline, seeded Compare runs, presenter URL.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

to_unix_path() {
  local raw="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$raw"
  else
    printf '%s\n' "$raw"
  fi
}

resolve_python() {
  if [ -x "$ROOT_DIR/backend/.venv/Scripts/python.exe" ]; then
    printf '%s\n' "$ROOT_DIR/backend/.venv/Scripts/python.exe"
    return 0
  fi
  if [ -x "$ROOT_DIR/backend/.venv/bin/python" ]; then
    printf '%s\n' "$ROOT_DIR/backend/.venv/bin/python"
    return 0
  fi
  if command -v py >/dev/null 2>&1; then
    local exe
    exe="$(py -3 -c "import sys; print(sys.executable)" 2>/dev/null || true)"
    if [ -n "$exe" ]; then
      to_unix_path "$exe"
      return 0
    fi
  fi
  echo "Python 3.10+ was not found." >&2
  exit 1
}

PYTHON_BIN="$(resolve_python)"
mkdir -p "$ROOT_DIR/logs" "$ROOT_DIR/reports"

if [ ! -f "$ROOT_DIR/frontend/out/index.html" ] \
  || [ "$ROOT_DIR/frontend/app/page.js" -nt "$ROOT_DIR/frontend/out/index.html" ] \
  || [ "$ROOT_DIR/frontend/app/components/DemoCue.js" -nt "$ROOT_DIR/frontend/out/index.html" ]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "frontend/out is stale or missing and npm was not found." >&2
    exit 1
  fi
  echo "Building frontend static export..."
  npm --prefix frontend run build
fi

exec "$PYTHON_BIN" -m backend.linkedin_demo
