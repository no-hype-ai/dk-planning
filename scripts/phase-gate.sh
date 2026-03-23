#!/usr/bin/env bash
# phase-gate.sh — Check phase exit criteria across all repos
# Usage: ./scripts/phase-gate.sh [phase-number]

set -euo pipefail

PHASE="${1:-0}"

echo "=== Phase $PHASE Gate Check ==="
echo ""

REPOS="dk-alchemy dk-clusters dk-template"
TOTAL_OPEN=0
TOTAL_CLOSED=0

for repo in $REPOS; do
  echo "--- $repo ---"
  RESULT=$(gh api "repos/data-kinetic/$repo/milestones" --jq ".[] | select(.title | startswith(\"Phase $PHASE\")) | \"\(.open_issues) open, \(.closed_issues) closed\"" 2>/dev/null || echo "error")

  if [ "$RESULT" = "error" ] || [ -z "$RESULT" ]; then
    echo "  No Phase $PHASE milestone found"
  else
    echo "  $RESULT"
    OPEN=$(echo "$RESULT" | grep -o '^[0-9]*')
    CLOSED=$(echo "$RESULT" | grep -o '[0-9]* closed' | grep -o '^[0-9]*')
    TOTAL_OPEN=$((TOTAL_OPEN + OPEN))
    TOTAL_CLOSED=$((TOTAL_CLOSED + ${CLOSED:-0}))
  fi
done

echo ""
echo "=== Summary ==="
echo "Total open: $TOTAL_OPEN"
echo "Total closed: $TOTAL_CLOSED"
echo ""

if [ "$TOTAL_OPEN" -eq 0 ] && [ "$TOTAL_CLOSED" -gt 0 ]; then
  echo "✅ Phase $PHASE COMPLETE — all issues closed"
  echo ""
  echo "Ready to proceed to Phase $((PHASE + 1))"
else
  echo "⏳ Phase $PHASE IN PROGRESS — $TOTAL_OPEN issues remaining"
  echo ""
  echo "Open issues:"
  for repo in $REPOS; do
    gh issue list --repo "data-kinetic/$repo" --milestone "Phase $PHASE*" --state open --json number,title --jq ".[] | \"  $repo #\(.number): \(.title)\"" 2>/dev/null
  done
fi
