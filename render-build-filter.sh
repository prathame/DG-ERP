#!/bin/bash
# Render Build Filter — skip deploy for doc-only changes
# Set this as "Build Filter" in Render Dashboard → Settings → Build & Deploy

changed_files=$(git diff --name-only HEAD~1 HEAD 2>/dev/null)

if [ -z "$changed_files" ]; then
  echo "=> No file changes detected, deploying..."
  exit 0
fi

# Skip only root docs — keep public/robots.txt (and similar) deployable
non_doc_changes=$(echo "$changed_files" | grep -v '\.md$' | grep -v '^LICENSE$' | grep -v '^DEVELOPER\.md$' | grep -Ev '^(README|CHANGELOG|CONTRIBUTING)\.md$')

if [ -z "$non_doc_changes" ]; then
  echo "=> Only documentation files changed, skipping deploy:"
  echo "$changed_files"
  exit 1
else
  echo "=> Application files changed, deploying:"
  echo "$non_doc_changes"
  exit 0
fi
