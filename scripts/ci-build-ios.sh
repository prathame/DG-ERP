#!/usr/bin/env bash
# CI: Unified Dhandho Service phone iOS (Online/Offline picker at first launch).
#
# Env:
#   MOBILE_PRODUCT=phone|offline|online   (all build the same unified shell; default: phone)
#   IOS_BUILD_MODE=debug|ipa              (default: debug — simulator, no Apple certs)
#   VITE_API_ORIGIN                       optional API origin for env file
#
# Outputs under dist-apk/:
#   dhandho-mobile-debug.app.zip (+ transitional offline-mobile-service-debug.app.zip alias)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PRODUCT="${MOBILE_PRODUCT:-phone}"
MODE="${IOS_BUILD_MODE:-debug}"
[[ "$MODE" == "simulator" ]] && MODE=debug

OUT_DIR="${IOS_OUT_DIR:-dist-apk}"
DERIVED="${IOS_DERIVED_DATA:-$ROOT/ios/DerivedData}"
PROJECT="$ROOT/ios/App/App.xcodeproj"
SCHEME="App"
RUNNER_TEMP="${RUNNER_TEMP:-${TMPDIR:-/tmp}/dg-ios-ci}"
mkdir -p "$RUNNER_TEMP"

case "$PRODUCT" in
  phone | offline | online)
    BUNDLE_ID="in.dhandho.service"
    ARTIFACT_STEM="dhandho-mobile-debug"
    ;;
  *)
    echo "error: MOBILE_PRODUCT must be phone, offline, or online (got: $PRODUCT)" >&2
    exit 1
    ;;
esac

log() { printf '+ %s\n' "$*" >&2; }

prepare_env_phone() {
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
  elif [[ -n "${CI_JOB_ID:-}" ]]; then
    echo "VITE_APP_VERSION=ci-${CI_JOB_ID}" >> .env.service-phone
  fi
  log "Env keys: $(cut -d= -f1 .env.service-phone | tr '\n' ' ')"
}

sync_web() {
  prepare_env_phone
  if [[ "${SKIP_BUILD:-}" != "1" ]]; then
    log "npm run build:service-phone"
    npm run build:service-phone
  fi
  log "npx cap sync ios"
  npx cap sync ios
  bash scripts/ios-set-product.sh offline
}

build_debug() {
  log "xcodebuild (iphonesimulator / Debug) — like assembleDebug [$PRODUCT]"
  mkdir -p "$OUT_DIR"
  xcodebuild \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -configuration Debug \
    -sdk iphonesimulator \
    -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$DERIVED" \
    CODE_SIGNING_ALLOWED=NO \
    build

  APP_PATH="$(find "$DERIVED/Build/Products" -name 'App.app' -type d | head -1)"
  if [[ -z "$APP_PATH" ]]; then
    echo "error: App.app not found under $DERIVED" >&2
    exit 1
  fi
  STAGE="$OUT_DIR/${ARTIFACT_STEM}.app"
  ZIP="$OUT_DIR/${ARTIFACT_STEM}.app.zip"
  rm -rf "$STAGE" "$ZIP"
  cp -R "$APP_PATH" "$STAGE"
  (
    cd "$OUT_DIR"
    zip -qry "$(basename "$ZIP")" "$(basename "$STAGE")"
  )
  rm -rf "$STAGE"
  log "Wrote $ZIP"
}

install_signing() {
  : "${APPLE_TEAM_ID:?APPLE_TEAM_ID required for IPA}"
  : "${IOS_CERTIFICATE_BASE64:?IOS_CERTIFICATE_BASE64 required for IPA}"
  : "${IOS_CERTIFICATE_PASSWORD:?IOS_CERTIFICATE_PASSWORD required for IPA}"
  : "${IOS_PROVISION_PROFILE_BASE64:?IOS_PROVISION_PROFILE_BASE64 required for IPA}"

  local keychain_path="${IOS_KEYCHAIN_PATH:-$RUNNER_TEMP/ios-build.keychain-db}"
  local keychain_password="${IOS_KEYCHAIN_PASSWORD:-$(openssl rand -base64 32)}"
  local cert_path="$RUNNER_TEMP/ios-dist.p12"
  local profile_path="$RUNNER_TEMP/ios-profile.mobileprovision"

  echo "$IOS_CERTIFICATE_BASE64" | base64 --decode >"$cert_path"
  echo "$IOS_PROVISION_PROFILE_BASE64" | base64 --decode >"$profile_path"

  security delete-keychain "$keychain_path" 2>/dev/null || true
  security create-keychain -p "$keychain_password" "$keychain_path"
  security set-keychain-settings -lut 21600 "$keychain_path"
  security unlock-keychain -p "$keychain_password" "$keychain_path"
  security import "$cert_path" -P "$IOS_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 \
    -k "$keychain_path"
  security list-keychain -d user -s "$keychain_path"
  security set-key-partition-list -S apple-tool:,apple: -s -k "$keychain_password" "$keychain_path"

  local uuid profile_name profile_dest
  uuid="$(/usr/libexec/PlistBuddy -c 'Print UUID' /dev/stdin <<<"$(security cms -D -i "$profile_path")")"
  profile_name="$(/usr/libexec/PlistBuddy -c 'Print Name' /dev/stdin <<<"$(security cms -D -i "$profile_path")")"
  profile_dest="$HOME/Library/MobileDevice/Provisioning Profiles/${uuid}.mobileprovision"
  mkdir -p "$(dirname "$profile_dest")"
  cp "$profile_path" "$profile_dest"
  log "Installed provisioning profile $uuid ($profile_name)"

  EXPORT_PLIST="$RUNNER_TEMP/ExportOptions.plist"
  cat >"$EXPORT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>${IOS_EXPORT_METHOD:-app-store-connect}</string>
	<key>signingStyle</key>
	<string>manual</string>
	<key>teamID</key>
	<string>${APPLE_TEAM_ID}</string>
	<key>compileBitcode</key>
	<false/>
	<key>provisioningProfiles</key>
	<dict>
		<key>${BUNDLE_ID}</key>
		<string>${profile_name}</string>
	</dict>
</dict>
</plist>
EOF
}

build_ipa() {
  install_signing
  local archive_path="$DERIVED/App.xcarchive"
  local export_dir="$DERIVED/export"
  mkdir -p "$OUT_DIR" "$DERIVED"
  rm -rf "$archive_path" "$export_dir"

  log "xcodebuild archive (iphoneos / Release) [$PRODUCT]"
  xcodebuild \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -configuration Release \
    -sdk iphoneos \
    -destination 'generic/platform=iOS' \
    -derivedDataPath "$DERIVED" \
    -archivePath "$archive_path" \
    DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
    CODE_SIGN_STYLE=Manual \
    archive

  log "xcodebuild -exportArchive"
  xcodebuild \
    -exportArchive \
    -archivePath "$archive_path" \
    -exportPath "$export_dir" \
    -exportOptionsPlist "$EXPORT_PLIST"

  local ipa
  ipa="$(find "$export_dir" -name '*.ipa' | head -1)"
  if [[ -z "$ipa" ]]; then
    echo "error: no .ipa under $export_dir" >&2
    exit 1
  fi
  cp "$ipa" "$OUT_DIR/${ARTIFACT_STEM}.ipa"
  log "Wrote $OUT_DIR/${ARTIFACT_STEM}.ipa"
}

sync_web

case "$MODE" in
  debug) build_debug ;;
  ipa) build_ipa ;;
  *)
    echo "error: IOS_BUILD_MODE must be debug or ipa (got: $MODE)" >&2
    exit 1
    ;;
esac

# Transitional alias for older workflow artifact names
if [[ -f "$OUT_DIR/${ARTIFACT_STEM}.app.zip" ]]; then
  cp "$OUT_DIR/${ARTIFACT_STEM}.app.zip" "$OUT_DIR/offline-mobile-service-debug.app.zip"
fi

ls -lh "$OUT_DIR"
