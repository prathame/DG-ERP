#!/usr/bin/env bash
# Sync online Service Cloud web assets into the shared android/ project.
# Swaps capacitor.config.ts temporarily (Capacitor CLI has no --config flag),
# then rewrites applicationId so Online can install beside Offline.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Allow CI to build once, then sync only: SKIP_BUILD=1 bash scripts/cap-sync-cloud.sh
if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  npm run build:service-cloud
fi

BACKUP="$(mktemp)"
cp capacitor.config.ts "$BACKUP"
cp capacitor.cloud.config.ts capacitor.config.ts
cleanup() {
  cp "$BACKUP" capacitor.config.ts
  rm -f "$BACKUP"
}
trap cleanup EXIT

npx cap sync android
bash scripts/android-set-product.sh online
echo "Synced Service Cloud → android/ (appId in.dhandho.servicecloud)."
echo "Restore Offline identity with: npm run cap:sync"
