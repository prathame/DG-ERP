#!/usr/bin/env bash
# CI: Offline / Online Capacitor iOS — parallel to Android assembleDebug.
#
# Env:
#   MOBILE_PRODUCT=offline|online   (default: offline)
#   IOS_BUILD_MODE=debug|ipa        (default: debug — simulator, no Apple certs)
#   VITE_API_ORIGIN                 optional API origin for env file
#
# Outputs under dist-apk/:
#   offline → offline-mobile-service-debug.app.zip (.ipa if mode=ipa)
#   online  → service-cloud-online-debug.app.zip (.ipa if mode=ipa)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PRODUCT="${MOBILE_PRODUCT:-offline}"
MODE="${IOS_BUILD_MODE:-debug}"
[[ "$MODE" == "simulator" ]] && MODE=debug

OUT_DIR="${IOS_OUT_DIR:-dist-apk}"
DERIVED="${IOS_DERIVED_DATA:-$ROOT/ios/DerivedData}"
PROJECT="$ROOT/ios/App/App.xcodeproj"
SCHEME="App"
RUNNER_TEMP="${RUNNER_TEMP:-${TMPDIR:-/tmp}/dg-ios-ci}"
mkdir -p "$RUNNER_TEMP"

case "$PRODUCT" in
  offline)
    BUNDLE_ID="in.dhandho.service"
    ARTIFACT_STEM="offline-mobile-service-debug"
    ;;
  online)
    BUNDLE_ID="in.dhandho.servicecloud"
    ARTIFACT_STEM="service-cloud-online-debug"
    ;;
  *)
    echo "error: MOBILE_PRODUCT must be offline or online (got: $PRODUCT)" >&2
    exit 1
    ;;
esac

log() { printf '+ %s\n' "$*" >&2; }

prepare_env_offline() {
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
  elif [[ -n "${CI_JOB_ID:-}" ]]; then
    echo "VITE_APP_VERSION=ci-${CI_JOB_ID}" >> .env.service-mobile
  fi
  log "Env keys: $(cut -d= -f1 .env.service-mobile | tr '\n' ' ')"
}

prepare_env_online() {
  if [[ ! -f .env.service-cloud ]]; then
    cp .env.service-cloud.example .env.service-cloud
  fi
  if [[ -n "${VITE_API_ORIGIN:-}" ]]; then
    tmp="$(mktemp)"
    printf 'VITE_API_ORIGIN=%s\n' "$VITE_API_ORIGIN" >"$tmp"
    grep -v '^VITE_API_ORIGIN=' .env.service-cloud >>"$tmp" || true
    mv "$tmp" .env.service-cloud
  fi
  if [[ -n "${CI_PIPELINE_IID:-}" ]]; then
    echo "VITE_APP_VERSION=ci-${CI_PIPELINE_IID}" >> .env.service-cloud
  elif [[ -n "${GITHUB_RUN_NUMBER:-}" ]]; then
    echo "VITE_APP_VERSION=ci-${GITHUB_RUN_NUMBER}" >> .env.service-cloud
  elif [[ -n "${CI_JOB_ID:-}" ]]; then
    echo "VITE_APP_VERSION=ci-${CI_JOB_ID}" >> .env.service-cloud
  fi
  log "Env keys: $(cut -d= -f1 .env.service-cloud | tr '\n' ' ')"
}

sync_web() {
  if [[ "$PRODUCT" == "offline" ]]; then
    prepare_env_offline
    if [[ "${SKIP_BUILD:-}" != "1" ]]; then
      log "npm run build:service-mobile"
      npm run build:service-mobile
    fi
    log "npx cap sync ios"
    npx cap sync ios
    bash scripts/ios-set-product.sh offline
  else
    prepare_env_online
    if [[ "${SKIP_BUILD:-}" != "1" ]]; then
      log "npm run build:service-cloud"
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
    log "npx cap sync ios (cloud config)"
    npx cap sync ios
    bash scripts/ios-set-product.sh online
    cleanup
    trap - EXIT
  fi
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

ls -lh "$OUT_DIR"
