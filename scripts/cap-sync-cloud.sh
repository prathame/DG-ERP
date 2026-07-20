#!/usr/bin/env bash
# @deprecated — Online Cap is no longer a separate product.
# Delegates to unified service-phone sync (first-launch Online/Offline picker).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "cap-sync-cloud: using unified phone shell (npm run cap:sync)"
npm run cap:sync
