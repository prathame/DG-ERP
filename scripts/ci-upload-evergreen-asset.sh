#!/usr/bin/env bash
# Upload (or replace) one asset on a GitHub evergreen release.
# Usage: ci-upload-evergreen-asset.sh <tag> <file> [title] [notes]
set -euo pipefail

TAG="${1:?tag required}"
FILE="${2:?file required}"
TITLE="${3:-$TAG}"
NOTES="${4:-Evergreen testing build — overwrite the file, keep the link.}"
NAME="$(basename "$FILE")"

if [[ ! -f "$FILE" ]]; then
  echo "error: missing $FILE" >&2
  exit 1
fi

gh release view "$TAG" >/dev/null 2>&1 || \
  gh release create "$TAG" --title "$TITLE" --notes "$NOTES"

for i in 1 2 3 4; do
  gh release delete-asset "$TAG" "$NAME" --yes 2>/dev/null || true
  if gh release upload "$TAG" "$FILE"; then
    echo "Uploaded $NAME → $TAG"
    exit 0
  fi
  sleep $((i * 2))
done

echo "Failed to upload $NAME to $TAG after retries" >&2
exit 1
