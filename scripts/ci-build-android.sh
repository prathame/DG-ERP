#!/usr/bin/env bash
# CI: Offline Service Mobile debug APK (same steps as GitHub apk-build.yml).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT_DIR="${ANDROID_OUT_DIR:-dist-apk}"

log() { printf '+ %s\n' "$*" >&2; }

if [[ ! -f .env.service-mobile ]]; then
  cp .env.service-mobile.example .env.service-mobile
fi
if [[ -n "${VITE_API_ORIGIN:-}" ]]; then
  tmp="$(mktemp)"
  printf 'VITE_API_ORIGIN=%s\n' "$VITE_API_ORIGIN" >"$tmp"
  grep -v '^VITE_API_ORIGIN=' .env.service-mobile >>"$tmp" || true
  mv "$tmp" .env.service-mobile
  grep -q '^VITE_DEPLOYMENT_MODE=' .env.service-mobile \
    || echo 'VITE_DEPLOYMENT_MODE=service-mobile' >> .env.service-mobile
fi
if [[ -n "${CI_PIPELINE_IID:-}" ]]; then
  echo "VITE_APP_VERSION=ci-${CI_PIPELINE_IID}" >> .env.service-mobile
elif [[ -n "${GITHUB_RUN_NUMBER:-}" ]]; then
  echo "VITE_APP_VERSION=ci-${GITHUB_RUN_NUMBER}" >> .env.service-mobile
fi
log "Env keys: $(cut -d= -f1 .env.service-mobile | tr '\n' ' ')"

if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  log "npm run build:service-mobile"
  npm run build:service-mobile
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
cp "$SRC" "$OUT_DIR/offline-mobile-service-debug.apk"
ls -lh "$OUT_DIR/offline-mobile-service-debug.apk"
