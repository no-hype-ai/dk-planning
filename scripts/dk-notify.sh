#!/usr/bin/env bash
# dk-notify.sh — Post coordination messages to Slack via webhook
# Usage: ./scripts/dk-notify.sh "message" [channel]
# Requires SLACK_WEBHOOK_URL environment variable or Doppler

set -euo pipefail

MESSAGE="${1:?Usage: dk-notify.sh 'message' [channel]}"
CHANNEL="${2:-#dk-infrastructure}"

# Try Doppler first, fall back to env var
WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
if [ -z "$WEBHOOK_URL" ] && command -v doppler &>/dev/null; then
  WEBHOOK_URL=$(doppler secrets get SLACK_WEBHOOK_URL --plain --project dk-infrastructure --config prd 2>/dev/null || true)
fi

if [ -z "$WEBHOOK_URL" ]; then
  echo "[dk-notify] No SLACK_WEBHOOK_URL — printing to stdout instead:"
  echo "  Channel: $CHANNEL"
  echo "  Message: $MESSAGE"
  exit 0
fi

curl -sf -X POST "$WEBHOOK_URL" \
  -H 'Content-type: application/json' \
  -d "{\"channel\": \"$CHANNEL\", \"text\": \"$MESSAGE\"}" >/dev/null

echo "[dk-notify] Posted to $CHANNEL"
