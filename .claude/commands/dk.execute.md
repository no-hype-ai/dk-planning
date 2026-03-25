---
description: "Execute implementation plan — orchestrate subagents across dk-alchemy, dk-clusters, and dk-template to work through current phase issues. Reports progress to Slack, escalates blockers."
---

# DK Platform Execution Orchestrator

> **For epic-scoped work** spanning multiple repos with dependency DAGs and PR isolation, use `/dk-epic-execute` instead. This command works best for phase-level execution within individual repos.

## User Input

```text
$ARGUMENTS
```

If arguments specify a phase number (e.g., "phase 1", "1"), target that phase. If empty, auto-detect the current active phase.

## Configuration

**Repos & Local Paths:**
- dk-alchemy: `/Users/nick/Code/dk-alchemy` (GitHub: `data-kinetic/dk-alchemy`)
- dk-clusters: `/Users/nick/Code/dk-clusters` (GitHub: `data-kinetic/dk-clusters`)
- dk-template: `/Users/nick/Code/dk-template` (GitHub: `data-kinetic/dk-template`)
- dk-planning: `/Users/nick/Code/dk-planning` (GitHub: `data-kinetic/dk-planning`)

**Slack:**
- Progress updates → #dk-infrastructure
- Escalations/blockers → DM Nick King

**SSH Access:** Approved for penguin (192.168.10.8), krang (192.168.10.100), k3s-master (10.0.0.11 via penguin), k3s-slave (10.0.0.12 via penguin)

## Execution Steps

### Step 1: Determine Current Phase

Run the phase gate script to find which phase has open work:

```bash
/Users/nick/Code/dk-planning/scripts/phase-gate.sh 0
/Users/nick/Code/dk-planning/scripts/phase-gate.sh 1
/Users/nick/Code/dk-planning/scripts/phase-gate.sh 2
/Users/nick/Code/dk-planning/scripts/phase-gate.sh 3
```

The lowest-numbered phase with open issues is the current phase. If user specified a phase in `$ARGUMENTS`, use that instead.

### Step 2: Read the Baseline Plan

Read `/Users/nick/Code/dk-planning/01-implementation-plan-baseline.md` to understand:
- Which tasks belong to the current phase
- Dependencies between tasks (which must complete before others start)
- Which tasks can run in parallel

### Step 3: Get Open Issues for Current Phase

For each repo, query open issues in the current phase milestone:

```bash
for repo in dk-alchemy dk-clusters dk-template; do
  gh issue list --repo "data-kinetic/$repo" --milestone "Phase N — MILESTONE_NAME" --state open --json number,title,labels,body --limit 20
done
```

### Step 4: Sort Issues by Dependencies

From the baseline plan:
- **No dependencies:** Can start immediately (launch in parallel)
- **Has dependencies:** Check if blocking issues are closed before starting

### Step 5: Launch Subagents

For EACH repo that has open issues in the current phase, launch a subagent using the Agent tool:

**Subagent prompt template:**

```
You are working on data-kinetic/{REPO} for the Data Kinetic platform.
Working directory: /Users/nick/Code/{REPO}

## Current Phase Issues
{LIST OF OPEN ISSUES WITH NUMBERS AND TITLES}

## Plan References
Read the detailed plan for each issue at /Users/nick/Code/{REPO}/plans/

## Execution Rules

1. **Work through issues in order** — respect the Phase X.Y numbering
2. **For each issue:**
   - Read the issue body (gh issue view {NUMBER} --repo data-kinetic/{REPO})
   - Read the linked plan file for detailed implementation steps
   - Execute the implementation
   - Comment on the issue with progress updates
   - Close the issue when acceptance criteria are met
3. **SSH access is approved** — use for infrastructure operations:
   - ssh penguin (Proxmox node 1, 192.168.10.8)
   - ssh -J penguin ubuntu@10.0.0.11 (K3s master) — or: ssh penguin 'sudo ssh ubuntu@10.0.0.11 "CMD"'
   - ssh -J penguin ubuntu@10.0.0.12 (K3s slave)
   - ssh krang (Proxmox node 2, 192.168.10.100)
4. **Slack notifications:**
   - After completing each issue: use the slack skill to post to #dk-infrastructure
   - If stuck or blocked: DM Nick King on Slack with what's needed
   - Before breaking changes: DM Nick King with what you're about to do
5. **If a step fails:** Document the error in a GitHub issue comment, move to the next non-dependent task
6. **Doppler projects:** dk-infrastructure/prd (infra), dk-cluster/prd (ArgoCD), 00-dk-tools/prd (LiteLLM), behaviorlabs-applications (apps)

## Sibling Repos (for cross-references)
- dk-alchemy: /Users/nick/Code/dk-alchemy
- dk-clusters: /Users/nick/Code/dk-clusters
- dk-template: /Users/nick/Code/dk-template
- dk-planning: /Users/nick/Code/dk-planning (docs, plans, baseline)
```

**Parallelization rules:**
- Launch subagents for different repos in parallel (they work on independent codebases)
- Within a repo, work issues sequentially (they may have dependencies)
- Use `run_in_background: true` for parallel subagents

### Step 6: Monitor and Validate

After all subagents complete:

1. Run the phase gate check:
   ```bash
   /Users/nick/Code/dk-planning/scripts/phase-gate.sh {PHASE_NUMBER}
   ```

2. Run the cross-repo status:
   ```bash
   /Users/nick/Code/dk-planning/scripts/cross-repo-status.sh
   ```

3. Report results:
   - If phase gate passes: post summary to #dk-infrastructure, ask user to start next phase
   - If issues remain: list what's still open and any blockers

### Step 7: Post-Phase Summary

Post a summary to Slack #dk-infrastructure:
```
✅ Phase {N} Complete — {PHASE_NAME}

Closed: {COUNT} issues across {REPOS}
• dk-alchemy: {details}
• dk-clusters: {details}
• dk-template: {details}

Next: Phase {N+1} — {NEXT_PHASE_NAME}
```

## Error Handling

- **Subagent fails:** Report the error, continue with other subagents
- **SSH fails:** Try 3 times with 10s timeout, then DM Nick on Slack
- **GitHub API fails:** Retry once, then report
- **Slack fails:** Print to console as fallback
- **Phase gate fails:** Report remaining issues, do NOT auto-advance
