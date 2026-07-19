#!/usr/bin/env bash
# Set shared android/ identity for Offline vs Online Cap builds.
# Capacitor sync copies web assets but does not rewrite applicationId on an
# existing project — CI and local dual-product builds must call this after sync.
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

GRADLE="$ROOT/android/app/build.gradle"
STRINGS="$ROOT/android/app/src/main/res/values/strings.xml"

if [[ ! -f "$GRADLE" || ! -f "$STRINGS" ]]; then
  echo "android/ project missing — run npx cap add android first" >&2
  exit 1
fi

# Keep Java package / namespace as Offline (in.dhandho.service) so we do not
# move MainActivity; only applicationId must differ so both APKs can install.
perl -i -pe "s/applicationId\\s+\"[^\"]+\"/applicationId \"$APP_ID\"/" "$GRADLE"

perl -i -pe "
  s/(<string name=\"app_name\">)[^<]+/\$1$APP_NAME/;
  s/(<string name=\"title_activity_main\">)[^<]+/\$1$APP_NAME/;
  s/(<string name=\"package_name\">)[^<]+/\$1$APP_ID/;
  s/(<string name=\"custom_url_scheme\">)[^<]+/\$1$APP_ID/;
" "$STRINGS"

grep -q "applicationId \"$APP_ID\"" "$GRADLE"
grep -q "<string name=\"package_name\">$APP_ID</string>" "$STRINGS"
echo "android/ identity → $PRODUCT ($APP_ID)"
