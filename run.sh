#!/usr/bin/env bash
# Start the PSD worker (FastAPI) and the Next.js web app together.
# Ctrl+C stops both.

set -euo pipefail
cd "$(dirname "$0")"

WORKER_PORT="${WORKER_PORT:-8787}"
WEB_PORT="${WEB_PORT:-3000}"

cleanup() {
  echo
  echo "Stopping..."
  [[ -n "${WORKER_PID:-}" ]] && kill "$WORKER_PID" 2>/dev/null || true
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "→ Starting Python worker on :$WORKER_PORT"
( cd worker && uv run uvicorn app:app --host 127.0.0.1 --port "$WORKER_PORT" --log-level warning ) &
WORKER_PID=$!

echo "→ Starting Next.js on :$WEB_PORT"
( cd web && PSD_WORKER_URL="http://127.0.0.1:$WORKER_PORT" pnpm dev --port "$WEB_PORT" ) &
WEB_PID=$!

echo
echo "Worker PID $WORKER_PID  ·  Web PID $WEB_PID"
echo "Open http://localhost:$WEB_PORT"
echo "Ctrl+C to stop both."

wait
