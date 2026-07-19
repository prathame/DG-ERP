#!/usr/bin/env bash
# GitLab CI: Offline Service Mobile iOS — parallel to Android assembleDebug.
# Modes:
#   debug (default) — simulator Debug build, no Apple certs → *.debug.app.zip
#   ipa             — signed archive + export (needs CI signing vars)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="${IOS_BUILD_MODE:-debug}"
# Accept old name
[[ "$MODE" == "simulator" ]] && MODE=debug

OUT_DIR="${IOS_OUT_DIR:-dist-apk}"
DERIVED="${IOS_DERIVED_DATA:-$ROOT/ios/DerivedData}"
PROJECT="$ROOT/ios/App/App.xcodeproj"
SCHEME="App"
BUNDLE_ID="in.dhandho.service"
RUNNER_TEMP="${RUNNER_TEMP:-${TMPDIR:-/tmp}/dg-ios-ci}"
mkdir -p "$RUNNER_TEMP"

log() { printf '+ %s\n' "$*" >&2; }

prepare_env() {
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
  elif [[ -n "${CI_JOB_ID:-}" ]]; then
    echo "VITE_APP_VERSION=ci-${CI_JOB_ID}" >> .env.service-mobile
  fi
  log "Env keys: $(cut -d= -f1 .env.service-mobile | tr '\n' ' ')"
}

sync_web() {
  if [[ "${SKIP_BUILD:-}" != "1" ]]; then
    log "npm run build:service-mobile"
    npm run build:service-mobile
  fi
  log "npx cap sync ios"
  npx cap sync ios
}

build_debug() {
  log "xcodebuild (iphonesimulator / Debug) — like assembleDebug"
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
  STAGE="$OUT_DIR/offline-mobile-service-debug.app"
  rm -rf "$STAGE" "$OUT_DIR/offline-mobile-service-debug.app.zip"
  cp -R "$APP_PATH" "$STAGE"
  (
    cd "$OUT_DIR"
    zip -qry offline-mobile-service-debug.app.zip offline-mobile-service-debug.app
  )
  rm -rf "$STAGE"
  log "Wrote $OUT_DIR/offline-mobile-service-debug.app.zip"
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

  log "xcodebuild archive (iphoneos / Release)"
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
  cp "$ipa" "$OUT_DIR/offline-mobile-service-debug.ipa"
  log "Wrote $OUT_DIR/offline-mobile-service-debug.ipa"
}

prepare_env
sync_web

case "$MODE" in
  debug) build_debug ;;
  ipa) build_ipa ;;
  *)
    echo "error: IOS_BUILD_MODE must be debug or ipa (got: $MODE)" >&2
    exit 1
    ;;
esac

ls -lh "$OUT_DIR"
