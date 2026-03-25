# Epic Orchestration with `/dk-epic-execute`

## Overview

`/dk-epic-execute` is a Claude Code command that orchestrates multi-repo epics using sub-agents, PR-based isolation, and wave-based dependency resolution. It runs from `dk-planning` and coordinates work across any combination of DK repos.

## Quick Start

```bash
# From dk-planning directory
/dk-epic-execute dk-planning#15
```

## Usage

```
/dk-epic-execute {repo}#{issue} [flags]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `{repo}#{issue}` | Yes | Epic issue reference (e.g., `dk-planning#15`) |
| `--dry-run` | No | Print wave map without executing |
| `--start-wave N` | No | Resume from wave N (crash recovery) |
| `--wave-only N` | No | Execute only wave N |
| `--skip-review` | No | Skip code-reviewer agents (faster) |

### Examples

```bash
# Full execution
/dk-epic-execute dk-planning#15

# Preview wave map without executing
/dk-epic-execute dk-planning#15 --dry-run

# Resume after a crash (skip already-merged waves)
/dk-epic-execute dk-planning#15 --start-wave 2

# Execute only one wave
/dk-epic-execute dk-planning#15 --wave-only 1

# Fast mode (no code review between PR and merge)
/dk-epic-execute dk-planning#15 --skip-review
```

## How It Works

### 1. Epic Resolution

The command reads the epic issue body and extracts:
- **Linked issues** from checkbox lists (`- [ ] data-kinetic/{repo}#{number}`)
- **Dependencies** from "Execution Order" or "Dependency Graph" sections
- **Plan file references** from plan links in the issue body

### 2. Wave Computation

Issues are sorted into waves via topological sort:

```
Wave 0: Issues with no dependencies (entry points)
Wave 1: Issues whose deps are all in Wave 0
Wave N: Issues whose deps are all in waves < N
```

Issues in the same wave run **in parallel** via background sub-agents.

### 3. Agent Execution

For each issue, a sub-agent is launched with:
- The target repo's working directory
- A feature branch: `epic/{epic-number}/{issue-number}-{slug}`
- The implementation plan from `dk-planning/plans/`
- Instructions to create a PR (not merge)

### 4. Merge Gate

After all agents in a wave complete:
1. **Code review** (optional) — reviewer agent checks each PR
2. **CI validation** — wait for all checks to pass
3. **Sequential merge** — same-repo PRs merge in conflict-safe order with rebase between each
4. **Notification** — Slack update and epic issue comment

### 5. Wave Progression

After a wave's merge gate passes, the next wave begins. This continues until all waves complete.

## Epic Issue Format

For the command to parse your epic, structure the issue body with:

### Linked Issues (required)

Use checkbox lists with full issue references:

```markdown
### Cross-Repo Issues

**my-repo:**
- [ ] data-kinetic/my-repo#10 — First task
- [ ] data-kinetic/my-repo#11 — Second task

**other-repo:**
- [ ] data-kinetic/other-repo#20 — Third task
```

### Execution Order (required)

Define the dependency graph:

```markdown
### Execution Order

1. **my-repo#10** — entry point, no dependencies
2. **In parallel after #10:**
   - **my-repo#11** — depends on #10
   - **other-repo#20** — depends on #10
3. **my-repo#12** — after #11 + #20
```

### Plan File References (recommended)

Link each issue to its implementation plan:

```markdown
### Plan Files

| Plan | File | Priority |
|------|------|----------|
| 01 | [`plans/my-repo/01-feature.md`](plans/my-repo/01-feature.md) | P0 |
```

## Branch Naming

All branches follow the convention:

```
epic/{epic-number}/{issue-number}-{slug}
```

Examples:
- `epic/15/133-platform-alignment-audit`
- `epic/15/388-data-metering-endpoints`

## Merge Strategy

### Same-Repo Parallel PRs

When multiple PRs target the same repo in one wave, they merge **sequentially** to prevent conflicts:

1. PRs with fewer shared files merge first
2. After each merge, remaining PRs rebase on main
3. Rebase uses `--force-with-lease` (safe — agent-owned branches)

### Cross-Repo PRs

PRs targeting different repos merge independently in parallel.

## Failure Handling

| Failure | Recovery |
|---------|----------|
| Agent produces no PR | Check branch for partial work → retry or escalate |
| CI fails | Read logs → launch fix-agent on same branch → retry (up to 3x) |
| Merge conflict | Rebase feature branch → force-with-lease push → retry |
| Dependency not met | Hold wave, notify Slack, wait |
| 2+ retries fail | `/dk-notify dm` escalation to Nick |

## Crash Recovery

If your session dies mid-epic, restart with:

```bash
/dk-epic-execute dk-planning#15 --start-wave N
```

The command reconstructs state from GitHub — it checks which PRs are merged, open, or missing, and resumes from there.

## State Tracking

State is tracked at three layers:

| Layer | Mechanism | Durability |
|-------|-----------|------------|
| Tasks | `TaskCreate`/`TaskUpdate` | Session only |
| GitHub | Issue comments, PR state | Permanent |
| Slack | Wave notifications | Permanent |

## Review Pipeline

Unless `--skip-review` is set, each PR is reviewed by a `feature-dev:code-reviewer` agent before merge. The reviewer checks:

- Security (no hardcoded secrets, proper auth)
- K8s best practices (resource limits, securityContext)
- Code quality (no silent failures, proper logging)
- Plan compliance (changes match the plan)

Issues are rated HIGH/MEDIUM/LOW. Only HIGH issues block merge.

## Notifications

The command sends Slack notifications at wave boundaries:

- **Wave start**: `#dk-infrastructure` — which issues are starting
- **Wave complete**: `#dk-infrastructure` — which PRs were merged
- **Escalation**: DM to Nick King — blockers requiring human intervention
- **Epic complete**: `#dk-infrastructure` — full summary

## Creating a New Epic

To create an epic suitable for `/dk-epic-execute`:

1. **Create plan files** in `dk-planning/plans/{repo}/` for each workstream
2. **Create GitHub issues** in each target repo, referencing the plans
3. **Create the epic issue** in dk-planning with linked issues and execution order
4. **Run**: `/dk-epic-execute dk-planning#{issue-number}`

## Comparison with `/dk-execute`

| Feature | `/dk-execute` | `/dk-epic-execute` |
|---------|--------------|-------------------|
| Scope | Single phase across repos | Full epic with dependency DAG |
| Isolation | Direct commits to main | PR per issue, merge gates |
| Parallelism | Per-repo agents | Per-issue agents with wave grouping |
| Merge strategy | Auto-commit | Orchestrator reviews + merges |
| Crash recovery | Manual | Auto-recover from GitHub state |
| Best for | Phase-level execution | Multi-repo epics with dependencies |

## Agent Prompt Templates

Reusable templates in `.claude/commands/templates/`:

| Template | Purpose |
|----------|---------|
| `epic-agent-preamble.md` | Common setup: git workflow, PR conventions, branch naming |
| `epic-agent-k8s.md` | K8s validation: kustomize build, security checklist, conventions |
| `epic-agent-platform-api.md` | Platform API: FastAPI patterns, router conventions, migrations |
