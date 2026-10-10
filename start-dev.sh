#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BACKEND_PORT=8000
FRONTEND_PORT=3000
BACKEND_URL="http://localhost:${BACKEND_PORT}"
FRONTEND_URL="http://localhost:${FRONTEND_PORT}"
PYTHON_BIN=""
VENV_ACTIVATE=""
BACKEND_PID=""
FRONTEND_PID=""
START_FRONTEND=1

to_unix_path() {
  local raw="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$raw"
  else
    printf '%s\n' "$raw"
  fi
}

python_is_usable() {
  local bin="$1"
  case "$bin" in
    *WindowsApps/python*) return 1 ;;
  esac
  [ -n "$bin" ] || return 1
  "$bin" -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >/dev/null 2>&1
}

set_python_bin() {
  PYTHON_BIN="$1"
  VENV_ACTIVATE="${2:-}"
}

cleanup() {
  local exit_code=$?
  if [ -n "$BACKEND_PID" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
  if [ -n "$FRONTEND_PID" ]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
    wait "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [ "$exit_code" -ne 0 ]; then
    echo "Shutting down services..."
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

resolve_existing_venv() {
  if [ -x "$ROOT_DIR/.venv/Scripts/python.exe" ]; then
    set_python_bin "$ROOT_DIR/.venv/Scripts/python.exe" "$ROOT_DIR/.venv/Scripts/activate"
    return 0
  fi
  if [ -x "$ROOT_DIR/.venv/bin/python" ]; then
    set_python_bin "$ROOT_DIR/.venv/bin/python" "$ROOT_DIR/.venv/bin/activate"
    return 0
  fi
  if [ -x "$ROOT_DIR/backend/.venv/Scripts/python.exe" ]; then
    set_python_bin "$ROOT_DIR/backend/.venv/Scripts/python.exe" "$ROOT_DIR/backend/.venv/Scripts/activate"
    return 0
  fi
  if [ -x "$ROOT_DIR/backend/.venv/bin/python" ]; then
    set_python_bin "$ROOT_DIR/backend/.venv/bin/python" "$ROOT_DIR/backend/.venv/bin/activate"
    return 0
  fi
  return 1
}

resolve_system_python() {
  local candidate exe

  if command -v py >/dev/null 2>&1; then
    exe="$(py -3 -c "import sys; print(sys.executable)" 2>/dev/null || true)"
    if [ -n "$exe" ]; then
      candidate="$(to_unix_path "$exe")"
      if python_is_usable "$candidate"; then
        set_python_bin "$candidate" ""
        return 0
      fi
    fi
  fi

  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
      exe="$(command -v "$candidate")"
      if python_is_usable "$exe"; then
        set_python_bin "$exe" ""
        return 0
      fi
    fi
  done

  local base="${LOCALAPPDATA:-$HOME/AppData/Local}/Programs/Python"
  local ver
  for ver in Python314 Python313 Python312 Python311 Python310; do
    candidate="$(to_unix_path "$base/$ver/python.exe")"
    if [ -x "$candidate" ] && python_is_usable "$candidate"; then
      set_python_bin "$candidate" ""
      return 0
    fi
  done

  return 1
}

resolve_python() {
  if resolve_existing_venv; then
    return 0
  fi
  if resolve_system_python; then
    return 0
  fi
  echo "Python 3.10+ was not found. Install Python, enable the Windows 'py' launcher, or create a virtual environment first." >&2
  exit 1
}

activate_virtualenv() {
  if [ -n "$VENV_ACTIVATE" ] && [ -f "$VENV_ACTIVATE" ]; then
    set +u
    # shellcheck source=/dev/null
    source "$VENV_ACTIVATE"
    set -u
  fi
}

ensure_backend_venv() {
  if resolve_existing_venv; then
    echo "Using existing virtual environment with $PYTHON_BIN"
    return 0
  fi

  echo "Creating backend virtual environment at $ROOT_DIR/backend/.venv..."
  if ! resolve_system_python; then
    echo "Python 3.10+ was not found. Cannot create a virtual environment." >&2
    exit 1
  fi
  "$PYTHON_BIN" -m venv "$ROOT_DIR/backend/.venv"
  if ! resolve_existing_venv; then
    echo "Virtual environment was created but Python was not found inside it." >&2
    exit 1
  fi
}

install_backend_dependencies() {
  echo "Installing backend dependencies..."
  ensure_backend_venv
  resolve_python
  activate_virtualenv
  "$PYTHON_BIN" -m pip install --upgrade pip
  "$PYTHON_BIN" -m pip install -r "$ROOT_DIR/backend/requirements.txt"
}

install_frontend_dependencies() {
  echo "Installing frontend dependencies..."
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm was not found. Install Node.js and npm before starting the frontend." >&2
    exit 1
  fi
  npm --prefix frontend install
}

configure_environment() {
  echo "Configuring runtime directories..."
  mkdir -p "$ROOT_DIR/logs" "$ROOT_DIR/reports"
  if [ ! -f "$ROOT_DIR/.env" ]; then
    cat > "$ROOT_DIR/.env" <<'EOF'
# Optional local overrides. The app can run without this file.
# Example:
# GEMINI_API_KEY=your_key_here
EOF
  fi
}

wait_for_backend() {
  local url="http://127.0.0.1:${BACKEND_PORT}/api/health"
  for ((attempt = 1; attempt <= 90; attempt++)); do
    if "$PYTHON_BIN" - "$url" <<'PY' >/dev/null 2>&1
import sys
import urllib.request

try:
    urllib.request.urlopen(sys.argv[1], timeout=1)
except Exception:
    raise SystemExit(1)
PY
    then
      return 0
    fi
    sleep 1
  done

  echo "Backend did not become ready in time." >&2
  return 1
}

start_backend() {
  echo "Starting backend server with $PYTHON_BIN ..."
  (
    cd "$ROOT_DIR"
    "$PYTHON_BIN" -m uvicorn backend.main:app --host 0.0.0.0 --port "$BACKEND_PORT"
  ) > "$ROOT_DIR/logs/backend.log" 2>&1 &
  BACKEND_PID=$!
}

start_frontend() {
  echo "Starting frontend server..."
  (
    cd "$ROOT_DIR"
    npm --prefix frontend run dev -- --hostname 0.0.0.0 --port "$FRONTEND_PORT"
  ) > "$ROOT_DIR/logs/frontend.log" 2>&1 &
  FRONTEND_PID=$!
}

show_endpoints() {
  echo ""
  echo "Backend endpoint: $BACKEND_URL"
  if [ "$START_FRONTEND" -eq 1 ]; then
    echo "Frontend endpoint: $FRONTEND_URL"
    echo "Logs: $ROOT_DIR/logs"
    echo "Press Ctrl+C to stop both services."
  else
    echo "Frontend: not started (backend-only mode)"
    echo "Logs: $ROOT_DIR/logs/backend.log"
    echo "Press Ctrl+C to stop the backend."
  fi
}

run_selected_option() {
  case "$1" in
    1)
      configure_environment
      resolve_python
      install_backend_dependencies
      install_frontend_dependencies
      ;;
    2)
      resolve_python
      activate_virtualenv
      ;;
    3)
      resolve_python
      ;;
    4)
      START_FRONTEND=0
      configure_environment
      resolve_python
      install_backend_dependencies
      ;;
    5)
      START_FRONTEND=0
      resolve_python
      activate_virtualenv
      ;;
    *)
      echo "Invalid option." >&2
      exit 1
      ;;
  esac
}

show_menu() {
  echo "=== Application lifecycle ==="
  echo "1. Full setup and startup"
  echo "2. Startup with existing environment"
  echo "3. Start servers only"
  echo "4. Backend setup and startup"
  echo "5. Start backend only"
}

choice="${1:-}"
if [ -z "$choice" ]; then
  if [ -t 0 ]; then
    while true; do
      show_menu
      read -r -p "Enter an integer option (1-5): " choice
      case "$choice" in
        1|2|3|4|5)
          break
          ;;
        *)
          echo "Please enter only an integer option (1, 2, 3, 4, or 5)."
          ;;
      esac
    done
  else
    choice=1
    echo "No option provided; defaulting to 1 (full setup and startup)."
  fi
fi

case "$choice" in
  1|2|3|4|5) ;;
  *)
    echo "Invalid option: $choice" >&2
    exit 1
    ;;
esac

run_selected_option "$choice"

if [ "$START_FRONTEND" -eq 1 ] && ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js and npm before starting the frontend." >&2
  exit 1
fi

start_backend
if [ "$START_FRONTEND" -eq 1 ]; then
  start_frontend
fi

if ! wait_for_backend; then
  echo "The backend did not become ready. Check $ROOT_DIR/logs/backend.log for details." >&2
  exit 1
fi

show_endpoints
if [ -n "$FRONTEND_PID" ]; then
  wait "$BACKEND_PID" "$FRONTEND_PID"
else
  wait "$BACKEND_PID"
fi
