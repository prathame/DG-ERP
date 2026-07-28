#!/usr/bin/env bash
# Run cloud service-tenant API e2e (requires server on :3001 and .env with SUPER_ADMIN_*).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BASE="${E2E_BASE:-http://localhost:3001}"
if ! curl -sf "${BASE}/api/health" >/dev/null 2>&1; then
  echo "Starting server on ${BASE}…" >&2
  npm run build >/dev/null
  npm run server &
  SERVER_PID=$!
  trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
  for _ in $(seq 1 30); do
    curl -sf "${BASE}/api/health" >/dev/null 2>&1 && break
    sleep 1
  done
fi
python3 tests/e2e_by_type.py --types service --base "$BASE"
