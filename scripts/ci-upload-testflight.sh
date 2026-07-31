#!/usr/bin/env bash
# Upload a signed IPA to App Store Connect / TestFlight via ASC API key.
# Usage: ci-upload-testflight.sh <path-to.ipa>
#
# Secrets / env:
#   APPSTORE_API_KEY_ID
#   APPSTORE_API_ISSUER_ID
#   APPSTORE_API_PRIVATE_KEY_BASE64   (base64 of AuthKey_*.p8)
set -euo pipefail

IPA="${1:?usage: ci-upload-testflight.sh <file.ipa>}"
if [[ ! -f "$IPA" ]]; then
  echo "error: missing IPA: $IPA" >&2
  exit 1
fi

: "${APPSTORE_API_KEY_ID:?APPSTORE_API_KEY_ID required}"
: "${APPSTORE_API_ISSUER_ID:?APPSTORE_API_ISSUER_ID required}"
: "${APPSTORE_API_PRIVATE_KEY_BASE64:?APPSTORE_API_PRIVATE_KEY_BASE64 required}"

TMP="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/dg-asc-$$"
mkdir -p "$TMP"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

KEY_DIR="$TMP/private_keys"
mkdir -p "$KEY_DIR"
# altool / notary look for AuthKey_<KEY_ID>.p8 under API_PRIVATE_KEYS_DIR
echo "$APPSTORE_API_PRIVATE_KEY_BASE64" | base64 --decode >"$KEY_DIR/AuthKey_${APPSTORE_API_KEY_ID}.p8"
chmod 600 "$KEY_DIR/AuthKey_${APPSTORE_API_KEY_ID}.p8"
export API_PRIVATE_KEYS_DIR="$KEY_DIR"

echo "+ Uploading $(basename "$IPA") to App Store Connect (TestFlight)…"
xcrun altool --upload-app \
  --type ios \
  --file "$IPA" \
  --apiKey "$APPSTORE_API_KEY_ID" \
  --apiIssuer "$APPSTORE_API_ISSUER_ID" \
  --verbose

echo "+ Upload submitted. Processing in App Store Connect → TestFlight can take 5–30+ minutes."
