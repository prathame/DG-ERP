#!/usr/bin/env bash
# Sync online Service Cloud web assets into the shared android/ project.
# Swaps capacitor.config.ts temporarily (Capacitor CLI has no --config flag).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run build:service-cloud

BACKUP="$(mktemp)"
cp capacitor.config.ts "$BACKUP"
cp capacitor.cloud.config.ts capacitor.config.ts
cleanup() {
  cp "$BACKUP" capacitor.config.ts
  rm -f "$BACKUP"
}
trap cleanup EXIT

npx cap sync android
echo "Synced Service Cloud → android/ (appId in.dhandho.servicecloud)."
echo "Run npm run cap:sync to restore Offline Service Mobile android project."
