#!/usr/bin/env bash
# Install Android SDK cmdline-tools + platform for Offline Cap debug APKs (GitLab Linux).
set -euo pipefail

SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/android-sdk}}"
API_LEVEL="${ANDROID_API_LEVEL:-36}"
BUILD_TOOLS="${ANDROID_BUILD_TOOLS:-36.0.0}"
CMDLINE_VERSION="${ANDROID_CMDLINE_TOOLS_VERSION:-11076708}"

mkdir -p "$SDK_ROOT/cmdline-tools"
if [[ ! -x "$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" ]]; then
  tmp="$(mktemp -d)"
  zip="commandlinetools-linux-${CMDLINE_VERSION}_latest.zip"
  echo "+ download $zip"
  curl -fsSL "https://dl.google.com/android/repository/${zip}" -o "$tmp/$zip"
  unzip -q "$tmp/$zip" -d "$tmp"
  rm -rf "$SDK_ROOT/cmdline-tools/latest"
  mkdir -p "$SDK_ROOT/cmdline-tools/latest"
  # Zip contains cmdline-tools/{bin,lib,...}
  mv "$tmp/cmdline-tools"/* "$SDK_ROOT/cmdline-tools/latest/"
  rm -rf "$tmp"
fi

export ANDROID_SDK_ROOT="$SDK_ROOT"
export ANDROID_HOME="$SDK_ROOT"
export PATH="$SDK_ROOT/cmdline-tools/latest/bin:$SDK_ROOT/platform-tools:$PATH"

mkdir -p "$SDK_ROOT/licenses"
printf '24333f8a63b6825ea9c5514f83c2829b004d1fee\n' >"$SDK_ROOT/licenses/android-sdk-license"
printf '848903162498172506b450aacb9c181e85c58859\n' >"$SDK_ROOT/licenses/android-sdk-preview-license"

yes | sdkmanager --sdk_root="$SDK_ROOT" --licenses >/dev/null || true
sdkmanager --sdk_root="$SDK_ROOT" \
  "platforms;android-${API_LEVEL}" \
  "build-tools;${BUILD_TOOLS}" \
  "platform-tools"

# Capacitor / Gradle look for local.properties next to android/
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
printf 'sdk.dir=%s\n' "$SDK_ROOT" >"$ROOT/android/local.properties"

echo "ANDROID_SDK_ROOT=$SDK_ROOT"
echo "ANDROID_HOME=$SDK_ROOT"
if [[ -n "${GITHUB_ENV:-}" ]]; then
  {
    echo "ANDROID_SDK_ROOT=$SDK_ROOT"
    echo "ANDROID_HOME=$SDK_ROOT"
  } >>"$GITHUB_ENV"
fi
