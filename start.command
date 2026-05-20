#!/usr/bin/env bash
# Double-click to install everything and start the app.
# Opens in Terminal automatically on macOS.

set -euo pipefail
cd "$(dirname "$0")"

WORKER_PORT="${WORKER_PORT:-8787}"
WEB_PORT="${WEB_PORT:-3000}"

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
step()  { printf "\n\033[1;36m▸ %s\033[0m\n" "$*"; }

require() {
  local cmd="$1" hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    red "Missing required tool: $cmd"
    echo "  Install hint: $hint"
    exit 1
  fi
}

bold "PSD Resizer — install & start"
echo "Working dir: $(pwd)"

step "Checking prerequisites"
require node "https://nodejs.org/  (or: brew install node)"
require pnpm "brew install pnpm  (or: npm i -g pnpm)"
require uv   "brew install uv  (or: curl -LsSf https://astral.sh/uv/install.sh | sh)"
green "✓ node $(node -v) · pnpm $(pnpm -v) · uv $(uv --version | awk '{print $2}')"

step "Installing Node dependencies (web/)"
( cd web && pnpm install --silent )

step "Generating Prisma client & applying migrations"
( cd web && pnpm dlx prisma migrate deploy >/dev/null 2>&1 || pnpm dlx prisma migrate dev --name init --skip-seed >/dev/null )
( cd web && pnpm dlx prisma generate >/dev/null )

step "Installing Playwright Chromium (first run only)"
( cd web && pnpm exec playwright install chromium >/dev/null 2>&1 ) || true

step "Installing Python worker dependencies (worker/)"
( cd worker && uv sync --quiet )

cleanup() {
  echo
  bold "Stopping…"
  [[ -n "${WORKER_PID:-}" ]] && kill "$WORKER_PID" 2>/dev/null || true
  [[ -n "${WEB_PID:-}" ]]    && kill "$WEB_PID"    2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

step "Starting Python worker on :$WORKER_PORT"
( cd worker && uv run uvicorn app:app --host 127.0.0.1 --port "$WORKER_PORT" --log-level warning ) &
WORKER_PID=$!

step "Starting Next.js on :$WEB_PORT"
( cd web && PSD_WORKER_URL="http://127.0.0.1:$WORKER_PORT" pnpm dev --port "$WEB_PORT" ) &
WEB_PID=$!

sleep 2
URL="http://localhost:$WEB_PORT"
green "✓ Ready — opening $URL"
( command -v open >/dev/null && open "$URL" ) || true

echo
bold "Worker PID $WORKER_PID · Web PID $WEB_PID"
echo "Ctrl+C in this window to stop both."
echo

wait
