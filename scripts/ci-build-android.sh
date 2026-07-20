#!/usr/bin/env bash
# CI: Unified Dhandho Service phone debug APK (Online/Offline picker at first launch).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT_DIR="${ANDROID_OUT_DIR:-dist-apk}"

log() { printf '+ %s\n' "$*" >&2; }

if [[ ! -f .env.service-phone ]]; then
  cp .env.service-phone.example .env.service-phone
fi
if [[ -n "${VITE_API_ORIGIN:-}" ]]; then
  tmp="$(mktemp)"
  printf 'VITE_API_ORIGIN=%s\n' "$VITE_API_ORIGIN" >"$tmp"
  grep -v '^VITE_API_ORIGIN=' .env.service-phone >>"$tmp" || true
  mv "$tmp" .env.service-phone
  grep -q '^VITE_DEPLOYMENT_MODE=' .env.service-phone \
    || echo 'VITE_DEPLOYMENT_MODE=service-phone' >> .env.service-phone
fi
if [[ -n "${CI_PIPELINE_IID:-}" ]]; then
  echo "VITE_APP_VERSION=ci-${CI_PIPELINE_IID}" >> .env.service-phone
elif [[ -n "${GITHUB_RUN_NUMBER:-}" ]]; then
  echo "VITE_APP_VERSION=ci-${GITHUB_RUN_NUMBER}" >> .env.service-phone
fi
log "Env keys: $(cut -d= -f1 .env.service-phone | tr '\n' ' ')"

if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  log "npm run build:service-phone"
  npm run build:service-phone
fi
log "npx cap sync android"
npx cap sync android
bash scripts/android-set-product.sh offline

log "./gradlew assembleDebug"
(
  cd android
  chmod +x gradlew
  ./gradlew assembleDebug --no-daemon
)

mkdir -p "$OUT_DIR"
SRC="$(ls android/app/build/outputs/apk/debug/*.apk | head -1)"
cp "$SRC" "$OUT_DIR/dhandho-mobile-debug.apk"
# Transitional alias for older docs/scripts
cp "$OUT_DIR/dhandho-mobile-debug.apk" "$OUT_DIR/offline-mobile-service-debug.apk"
ls -lh "$OUT_DIR/dhandho-mobile-debug.apk"
