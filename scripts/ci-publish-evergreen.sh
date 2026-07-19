#!/bin/sh
# Upload Offline Mobile debug artifacts to GitLab generic package (evergreen "latest").
# Mirrors: gh release upload offline-mobile … --clobber
set -eu

FILE="${1:?usage: ci-publish-evergreen.sh <file>}"
PACKAGE="${EVERGREEN_PACKAGE:-offline-mobile}"
VERSION="${EVERGREEN_VERSION:-latest}"
NAME="$(basename "$FILE")"

: "${CI_API_V4_URL:?}"
: "${CI_PROJECT_ID:?}"
: "${CI_JOB_TOKEN:?}"

URL="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/generic/${PACKAGE}/${VERSION}/${NAME}"
echo "Uploading ${NAME} → ${URL}"
curl --fail --silent --show-error \
  --header "JOB-TOKEN: ${CI_JOB_TOKEN}" \
  --upload-file "$FILE" \
  "$URL"
echo
echo "Evergreen: ${CI_PROJECT_URL:-}/-/packages (generic ${PACKAGE}/${VERSION}/${NAME})"
