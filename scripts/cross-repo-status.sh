#!/usr/bin/env bash
# cross-repo-status.sh — Quick status check across all DK repos
# Usage: ./scripts/cross-repo-status.sh

set -euo pipefail

REPOS="dk-alchemy dk-clusters dk-template"

echo "╔══════════════════════════════════════════════════════╗"
echo "║         DK Platform — Cross-Repo Status             ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Milestones
echo "━━━ Milestones ━━━"
for repo in $REPOS; do
  echo ""
  echo "[$repo]"
  gh api "repos/data-kinetic/$repo/milestones" --jq '.[] | "  \(.title): \(.open_issues) open / \(.closed_issues) closed"' 2>/dev/null || echo "  (error fetching milestones)"
done

# P0 Issues
echo ""
echo "━━━ P0 Issues (Critical) ━━━"
for repo in $REPOS; do
  ISSUES=$(gh issue list --repo "data-kinetic/$repo" --label priority/p0 --state open --json number,title --jq '.[] | "  #\(.number) \(.title)"' 2>/dev/null)
  if [ -n "$ISSUES" ]; then
    echo ""
    echo "[$repo]"
    echo "$ISSUES"
  fi
done

# Blocked Issues
echo ""
echo "━━━ Blocked Issues ━━━"
for repo in $REPOS; do
  ISSUES=$(gh issue list --repo "data-kinetic/$repo" --label status/blocked --state open --json number,title --jq '.[] | "  #\(.number) \(.title)"' 2>/dev/null)
  if [ -n "$ISSUES" ]; then
    echo ""
    echo "[$repo]"
    echo "$ISSUES"
  fi
done

# In Progress
echo ""
echo "━━━ In Progress ━━━"
for repo in $REPOS; do
  ISSUES=$(gh issue list --repo "data-kinetic/$repo" --label status/in-progress --state open --json number,title --jq '.[] | "  #\(.number) \(.title)"' 2>/dev/null)
  if [ -n "$ISSUES" ]; then
    echo ""
    echo "[$repo]"
    echo "$ISSUES"
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Run: ./scripts/phase-gate.sh 0   — to check Phase 0 gate"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
