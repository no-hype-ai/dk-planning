# Issue Governance

## Overview

behavior-labs-ai has a comprehensive automated GitHub issue governance system that enforces quality gates, tracks risk, and generates compliance reports. This system should be generalized and extended to all product repos.

## Current Implementation (behavior-labs-ai)

All scripts live in `scripts/issues/` with a shared policy library in `scripts/issues/lib/`.

### Enforcement Scripts

| Script | Schedule | Purpose |
|--------|----------|---------|
| `enforce-regression-closure-gates.mjs` | Every 25m | Blocks P0/P1 issue closure without regression criteria met. Manages exception requests/approvals with expiry dates. Blocks PR merges referencing non-compliant issues. |
| `enforce-status-traceability.mjs` | Every 20m | Enforces valid status label transitions (triage → in-progress → done). Validates PR-to-issue traceability. |
| `enforce-stub-governance.mjs` | Daily 3 AM UTC | Manages `program/bug-bash-stub` issues: closes overdue stubs past 7-day SLA, escalates P0/P1 stubs, suppresses recently active. |
| `enforce-triage-evidence.mjs` | Hourly | Ensures issues have proper triage evidence (acceptance criteria, reproduction steps, etc.) |
| `sync-risk-prioritization.mjs` | Every 15m | Syncs risk priority labels based on scoring policy. |
| `validate-dk-phantom-scenarios.mjs` | On demand | Validates DK Phantom test scenarios. |

### Weekly Reports

Generated as GitHub issues on schedule (Monday 8 AM UTC):

| Report | Content |
|--------|---------|
| `generate-regression-closure-weekly-report.mjs` | Regression closure gate compliance |
| `generate-stub-weekly-report.mjs` | Stub governance compliance |
| `generate-triage-evidence-report.mjs` | Triage evidence compliance |
| `generate-weekly-top10-p1-report.mjs` | Top 10 P1 issues ranked by risk |
| `generate-scoreboard.mjs` | Contributor gamification scoreboard |
| `generate-risk-priority-report.mjs` | Risk prioritization summary |

### Policy Library (`scripts/issues/lib/`)

| Module | Purpose |
|--------|---------|
| `policy.ts` | Core governance: 7-day SLA, exception records with approval roles (triage-lead, repo-admin), max 7-day extensions |
| `github-issues.ts` | GitHub API wrapper: issue queries, body parsing, comment management |
| `risk-policy.ts` / `risk-priority.ts` | Risk scoring algorithms |
| `regression-closure-policy.ts` | Regression gate evaluation logic |
| `regression-exception-policy.ts` | Exception workflow with approvals |
| `status-transition-policy.ts` | Valid state machine for issue status labels |
| `pr-traceability-policy.ts` | Ensures PRs reference issues |
| `triage-policy.ts` | Triage evidence requirements |
| `run-context.ts` | Execution context (`--dry-run` vs `--apply`) |

### Execution

- All scripts support `--dry-run` (default) and `--apply` modes
- Driven by `GH_TOKEN` and `GITHUB_REPOSITORY` environment variables
- Run via [GitHub Actions](https://docs.github.com/en/actions) scheduled workflows

## Status Label State Machine

```
triage → in-progress → in-review → done
                ↓                    ↑
             blocked ────────────────┘
```

Transitions are enforced by `enforce-status-traceability.mjs` — skipping states (e.g., `triage` → `done`) is blocked.

## Regression Closure Gates

P0/P1 issues cannot be closed unless:
- Regression test added (or exception approved)
- Root cause documented
- Fix verified in staging

**Exception workflow:**
1. Author requests exception in issue comment
2. Triage lead or repo admin approves
3. Exception has an expiry date (max 7 days)
4. Script tracks and enforces expiry

## Risk Prioritization

Issues are scored and labeled based on:
- Severity (P0-P4)
- Impact radius (users affected)
- Blast radius (services affected)
- Time sensitivity (SLA, compliance deadline)

Scoring runs every 15 minutes and auto-applies priority labels.

## Recommendations

### 1. Extract into Shared GitHub Actions

Move the governance system out of behavior-labs-ai into a reusable form:

**Option A: Org-level reusable workflows** (in `data-kinetic/.github`)
```yaml
# Product repo workflow:
on:
  schedule:
    - cron: '*/25 * * * *'
jobs:
  governance:
    uses: data-kinetic/.github/.github/workflows/issue-governance.yaml@main
    with:
      enforcement: regression-gates,status-traceability,triage-evidence
      sla-days: 7
      escalation-roles: triage-lead,repo-admin
    secrets: inherit
```

**Option B: Published GitHub Action**
```yaml
- uses: data-kinetic/issue-governance-action@v1
  with:
    mode: apply
    policies: all
```

### 2. Per-Repo Configuration

Core policies stay consistent; product-specific settings are configurable:

| Setting | Default | Configurable |
|---------|---------|-------------|
| SLA duration | 7 days | Yes |
| Escalation roles | triage-lead, repo-admin | Yes |
| Exception max extension | 7 days | Yes |
| Risk scoring weights | Standard | Yes |
| Stub governance | Enabled | Yes (opt-out) |
| Report schedule | Weekly Monday 8 AM | Yes |

### 3. Connect to Observability Alerts

Bridge [Grafana](https://grafana.com/docs/grafana/latest/) alerts to the issue governance system (see [Incident Management](incident-management.md#automated-error-to-issue-pipeline)):
- Auto-created issues from alerts enter the same governance pipeline
- Triage evidence is pre-populated from alert context (dashboard links, log queries, trace IDs)
- Risk prioritization applies automatically

### 4. Metrics on Governance Health

Track governance effectiveness:
- Mean time from triage to in-progress
- Exception approval rate and frequency
- Regression gate compliance rate over time
- Stale issue counts by product

Consider adding a `governance-health` Grafana dashboard sourced from GitHub API data.

## Doc Gap Scanner Integration

The **doc-gap scanner** (`scripts/doc-gap-scanner/`) runs as a scheduled GitHub Actions workflow in dk-planning. It scans all markdown documentation for gaps (TODO markers, empty sections, TBD cells, unchecked gap items) and creates GitHub issues with the `doc-gap` label.

**How it integrates with governance:**
- Scanner-created issues enter `status/triage` and flow through the standard governance pipeline
- Issues are labeled `doc-gap`, `priority/P2`-`priority/P4`, and `source/doc-scanner`
- The `doc-gap` label enables filtering in weekly reports
- Deduplication is hash-based: each gap gets a deterministic ID from `sha256(file_path + gap_type + normalized_content)`
- If a gap issue is closed but the gap persists in the doc, the issue is reopened with a comment

**When governance extracts to org-level**, the doc-gap scanner can run cross-repo, scanning all product repos' documentation for gaps using the same label taxonomy.

## Gaps

- **behavior-labs-ai only** — no other repos have governance
- **No connection to observability** — alerts don't create governed issues
- **No cross-repo visibility** — no org-wide view of issue health
- **Scripts are tightly coupled** to behavior-labs-ai's label taxonomy

## Related Documentation

- [Incident Management](incident-management.md) — on-call, SLOs, alert-to-issue bridge
- [CI/CD Pipelines](ci-cd-pipelines.md) — scheduled workflow execution
- [Onboarding](onboarding.md) — adding governance to new repos
