#!/usr/bin/env bash
# Set shared ios/ identity for Offline vs Online Cap builds.
# Capacitor sync copies web assets but does not rewrite PRODUCT_BUNDLE_IDENTIFIER
# on an existing project — CI and local dual-product builds must call this after sync.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRODUCT="${1:-}"

case "$PRODUCT" in
  offline)
    APP_ID='in.dhandho.service'
    APP_NAME='Dhandho Service'
    ;;
  online)
    APP_ID='in.dhandho.servicecloud'
    APP_NAME='Dhandho Service Cloud'
    ;;
  *)
    echo "Usage: $0 offline|online" >&2
    exit 1
    ;;
esac

PBX="$ROOT/ios/App/App.xcodeproj/project.pbxproj"
PLIST="$ROOT/ios/App/App/Info.plist"

if [[ ! -f "$PBX" || ! -f "$PLIST" ]]; then
  echo "ios/ project missing — run npx cap add ios first" >&2
  exit 1
fi

perl -i -pe "s/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/PRODUCT_BUNDLE_IDENTIFIER = $APP_ID;/" "$PBX"
# Info.plist has key + string on separate lines — slurp with -0777
perl -i -0777 -pe "s/(<key>CFBundleDisplayName<\\/key>\\s*<string>)[^<]+/\${1}$APP_NAME/" "$PLIST"

grep -q "PRODUCT_BUNDLE_IDENTIFIER = $APP_ID;" "$PBX"
grep -A1 'CFBundleDisplayName' "$PLIST" | grep -q "<string>$APP_NAME</string>"
echo "ios/ identity → $PRODUCT ($APP_ID)"
