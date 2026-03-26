---
description: "Show implementation plan status across dk-alchemy, dk-clusters, and dk-template — milestones, P0 issues, blocked work, and phase gate validation."
---

# DK Platform Status Dashboard

## User Input

```text
$ARGUMENTS
```

If arguments specify a phase number, focus on that phase. Otherwise show the full dashboard.

## Execution Steps

### Step 1: Run Cross-Repo Status

Execute the status script:

```bash
/Users/nick/Code/dk-planning/scripts/cross-repo-status.sh
```

This shows milestones, P0 issues, blocked issues, and in-progress work across all 3 repos.

### Step 2: Run Phase Gate Check

If a phase is specified in `$ARGUMENTS`, check that phase:

```bash
/Users/nick/Code/dk-planning/scripts/phase-gate.sh {PHASE_NUMBER}
```

If no phase specified, check all phases to find the active one:

```bash
for phase in 0 1 2 3; do
  echo "--- Phase $phase ---"
  /Users/nick/Code/dk-planning/scripts/phase-gate.sh $phase
  echo ""
done
```

### Step 3: Summarize

Present a concise summary:

1. **Current phase** — which phase is active (lowest with open issues)
2. **Progress** — issues closed vs open per repo
3. **Blockers** — any issues labeled `status/blocked`
4. **Dependencies** — which open issues block other open issues (cross-reference with `01-implementation-plan-baseline.md`)
5. **Next actions** — what should be worked on next based on dependency order

### Step 4: Reference the Baseline

Read `/Users/nick/Code/dk-planning/01-implementation-plan-baseline.md` to map issue numbers to the dependency graph and identify the critical path.

## Output Format

```
╔══════════════════════════════════════════╗
║     DK Platform — Phase {N} Status      ║
╚══════════════════════════════════════════╝

Progress: {CLOSED}/{TOTAL} issues ({PERCENT}%)

dk-alchemy:  {CLOSED}/{TOTAL} — {DETAILS}
dk-clusters: {CLOSED}/{TOTAL} — {DETAILS}
dk-template: {CLOSED}/{TOTAL} — {DETAILS}

Blockers: {COUNT or "None"}
Next up: {NEXT_ISSUE_DESCRIPTIONS}

Phase gate: {PASS/FAIL}
```
