---
description: "Execute a multi-repo epic — resolve dependency DAG, launch sub-agents per wave with PR isolation, merge in dependency order, track progress via GitHub + Slack."
---

# DK Epic Execution Orchestrator

## User Input

```text
$ARGUMENTS
```

Parse arguments:
- **Required:** Epic reference in `{repo}#{issue}` format (e.g., `dk-planning#15`)
- **Optional flags:**
  - `--dry-run` — compute waves and print plan without executing
  - `--start-wave N` — resume from wave N (for crash recovery)
  - `--wave-only N` — execute only wave N
  - `--skip-review` — skip code-reviewer agents (faster, less safe)

## Configuration

**Repos & Local Paths:**
- dk-alchemy: `/Users/nick/Code/dk-alchemy` (GitHub: `data-kinetic/dk-alchemy`)
- dk-clusters: `/Users/nick/Code/dk-clusters` (GitHub: `data-kinetic/dk-clusters`)
- dk-template: `/Users/nick/Code/dk-template` (GitHub: `data-kinetic/dk-template`)
- dk-data-fe: `/Users/nick/Code/dk-data-fe` (GitHub: `data-kinetic/dk-data-fe`)
- behavior-labs-ai: `/Users/nick/Code/behavior-labs-ai` (GitHub: `data-kinetic/behavior-labs-ai`)
- dk-planning: `/Users/nick/Code/dk-planning` (GitHub: `data-kinetic/dk-planning`)

**Slack:**
- Progress updates → #dk-infrastructure
- Escalations/blockers → DM Nick King

**Branch naming:** `epic/{epic-number}/{issue-number}-{slug}`

**SSH Access:** Approved for penguin (192.168.10.8), krang (192.168.10.100), k3s-master (10.0.0.11 via penguin), k3s-slave (10.0.0.12 via penguin)

---

## Step 1: Resolve Epic

Fetch the epic issue and parse its structure:

```bash
gh issue view {ISSUE_NUMBER} --repo data-kinetic/{REPO} --json body,title,labels
```

From the issue body, extract:
1. **Linked issues** — look for checkbox lists (`- [ ] data-kinetic/{repo}#{number}`) or tables with issue references
2. **Dependency graph** — look for "Execution Order", "Dependency Graph", or "Blocked by" references
3. **Plan file references** — look for `plans/{workstream}/{nn}-{slug}.md` paths

Build a data structure:
```
issues = [
  { repo: "dk-data-fe", number: 133, slug: "platform-alignment-audit", deps: [], wave: 0 },
  { repo: "dk-data-fe", number: 134, slug: "production-hardening", deps: [133], wave: 1 },
  ...
]
```

## Step 2: Compute Waves

Topological sort the issues into waves:
1. **Wave 0:** Issues with no dependencies (entry points)
2. **Wave N:** Issues whose dependencies are all in waves < N
3. Issues in the same wave can run in parallel

Print the wave map for user confirmation:
```
╔══════════════════════════════════════════════════════╗
║  Epic: {TITLE} ({REPO}#{ISSUE})                     ║
╚══════════════════════════════════════════════════════╝

Wave 0 (serial):
  {repo}#{number} — {title}

Wave 1 (parallel, 4 agents):
  {repo}#{number} — {title}
  {repo}#{number} — {title}
  ...

Wave 2 (serial):
  {repo}#{number} — {title}

Merge strategy: sequential within same-repo, parallel across repos
```

If `--dry-run`, stop here.

## Step 3: Create Task Tracking

Create a TaskCreate entry for each issue:
```
TaskCreate(
  subject: "{repo}#{number} — {title}",
  description: "Wave {N}. Plan: plans/{workstream}/{file}. Branch: epic/{epic}/{number}-{slug}",
  metadata: { repo, number, wave, branch, plan_file }
)
```

Set up blockedBy relationships matching the dependency graph.

## Step 4: Execute Waves

For each wave, starting from `--start-wave` (default 0):

### 4a. Pre-Wave Check

For each issue in the wave, verify dependencies are met:
```bash
# Check that blocking issues have merged PRs
for dep in {DEPENDENCY_ISSUES}; do
  gh pr list --repo "data-kinetic/{dep_repo}" --search "epic/{epic}/{dep_number}" --state merged --json number
done
```

If any dependency doesn't have a merged PR, STOP and report the blocker.

### 4b. Launch Agents

For each issue in the wave, launch a sub-agent. Use `run_in_background: true` for waves with multiple agents.

**Agent prompt template:**

```
You are executing issue #{NUMBER} for the Data Kinetic platform epic #{EPIC_NUMBER}.

## Working Directory
/Users/nick/Code/{REPO}
ALL git and file operations MUST use this directory. Start with: cd /Users/nick/Code/{REPO}

## Issue
Title: {TITLE}
Body: {ISSUE_BODY}

## Plan Reference
Read the detailed implementation plan at:
/Users/nick/Code/dk-planning/{PLAN_FILE_PATH}

Follow the plan's implementation steps in order. The plan contains exact file paths, code structures, and validation steps.

## Git Workflow

1. SETUP:
   cd /Users/nick/Code/{REPO}
   git fetch origin main
   git checkout -b epic/{EPIC_NUMBER}/{NUMBER}-{SLUG} origin/main

2. IMPLEMENT:
   Follow the plan. Make atomic commits with clear messages.
   Each commit message must reference the issue:
   git commit -m "feat: {description}

   Part of data-kinetic/dk-planning#{EPIC_NUMBER}"

3. PUSH + CREATE PR:
   git push -u origin epic/{EPIC_NUMBER}/{NUMBER}-{SLUG}
   gh pr create \
     --repo data-kinetic/{REPO} \
     --title "{PR_TITLE}" \
     --body "$(cat <<'PREOF'
   ## Summary
   {BULLET_SUMMARY}

   ## Plan Reference
   - Epic: data-kinetic/dk-planning#{EPIC_NUMBER}
   - Plan: `{PLAN_FILE_PATH}`

   ## Test Plan
   {VALIDATION_STEPS_FROM_PLAN}

   Closes #{NUMBER}
   Part of data-kinetic/dk-planning#{EPIC_NUMBER}

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   PREOF
   )"

4. REPORT: Print the PR URL as the LAST line of your output so the orchestrator can parse it.

## Validation
Before creating the PR, run any validation steps from the plan:
- For K8s changes: kustomize build k8s/base (if kustomize is available)
- For Python changes: run linting/tests if configured
- For CI workflows: validate YAML syntax

## Rules
- Do NOT merge the PR — the orchestrator handles merging
- Do NOT modify files outside the scope of this issue
- If blocked or stuck: document the blocker in your output, do NOT try to work around it
- Reference sibling repos at /Users/nick/Code/{SIBLING} for cross-references only (read, don't write)

## Sibling Repos (read-only reference)
- dk-alchemy: /Users/nick/Code/dk-alchemy
- dk-clusters: /Users/nick/Code/dk-clusters
- dk-template: /Users/nick/Code/dk-template
- dk-data-fe: /Users/nick/Code/dk-data-fe
- dk-planning: /Users/nick/Code/dk-planning (docs, plans, baseline)
- behavior-labs-ai: /Users/nick/Code/behavior-labs-ai

## SSH Access (if needed for infrastructure validation)
- ssh penguin (Proxmox node 1, 192.168.10.8)
- ssh -J penguin ubuntu@10.0.0.11 (K3s master)
- ssh -J penguin ubuntu@10.0.0.12 (K3s slave)
- ssh krang (Proxmox node 2, 192.168.10.100)

## Doppler Projects
- dk-infrastructure/prd (infra secrets)
- dk-cluster/prd (ArgoCD + cluster)
- 00-dk-tools/prd (LiteLLM, shared tools)
- behaviorlabs-applications (app secrets)
```

### 4c. Collect Results

As each agent completes:
1. Parse the PR URL from agent output
2. TaskUpdate the corresponding task with `{ pr_url, status: "in_progress" }`
3. If agent failed (no PR URL): log the error, mark for retry

### 4d. Review Pipeline

For each PR created (unless `--skip-review`):

```
Agent(subagent_type="feature-dev:code-reviewer",
      prompt="Review PR #{PR_NUMBER} in data-kinetic/{REPO}.
              PR diff: gh pr diff {PR_NUMBER} --repo data-kinetic/{REPO}
              Focus on:
              - Security: no hardcoded secrets, proper securityContext
              - K8s best practices: resource limits, probes, labels
              - Code quality: no dead code, clear naming, minimal complexity
              - Plan compliance: changes match the plan at /Users/nick/Code/dk-planning/{PLAN_FILE}
              Report issues as HIGH/MEDIUM/LOW. Only HIGH issues block merge.")
```

If HIGH issues found: launch a fix-agent on the same branch, then re-review.

### 4e. Merge Gate

Merge PRs in the wave **sequentially within the same repo** to prevent conflicts:

1. **Determine merge order** for same-repo PRs:
   - PRs touching fewer shared files merge first
   - When in doubt, merge P1 before P0 (P1 changes are typically smaller/additive)

2. **For each PR in merge order:**
   ```bash
   # Wait for CI
   gh pr checks {PR_NUMBER} --repo data-kinetic/{REPO} --watch --fail-fast

   # If this isn't the first same-repo merge in this wave, rebase first
   cd /Users/nick/Code/{REPO}
   git fetch origin main
   git checkout epic/{EPIC}/{NUMBER}-{SLUG}
   git rebase origin/main
   git push --force-with-lease origin epic/{EPIC}/{NUMBER}-{SLUG}
   # Wait for CI again after rebase
   gh pr checks {PR_NUMBER} --repo data-kinetic/{REPO} --watch --fail-fast

   # Merge
   gh pr merge {PR_NUMBER} --repo data-kinetic/{REPO} --squash --delete-branch
   ```

3. **After each merge:**
   ```bash
   # Update task
   TaskUpdate(taskId, status: "completed", metadata: { merged: true })

   # Comment on epic issue
   gh issue comment {EPIC_NUMBER} --repo data-kinetic/{EPIC_REPO} --body \
     "✅ Merged: data-kinetic/{REPO}#{NUMBER} via PR #{PR_NUMBER}"
   ```

4. **After all PRs in the wave merge:**
   - Notify Slack: `/dk-notify "Wave {N} complete — {EPIC_TITLE}. Merged {COUNT} PRs. Next: Wave {N+1}"`
   - Proceed to next wave

### 4f. Failure Recovery

**Agent produced no PR:**
```
1. Check if branch exists: git ls-remote origin epic/{EPIC}/{NUMBER}-{SLUG}
2. If branch exists with commits: launch new agent to continue from branch
3. If no branch: re-launch agent from scratch
4. After 2 retries: escalate via /dk-notify dm
```

**CI failure:**
```
1. Read failure: gh run view --repo data-kinetic/{REPO} --log-failed (latest run)
2. Launch fix-agent:
   Agent(prompt="Fix CI failure on branch epic/{EPIC}/{NUMBER}-{SLUG} in /Users/nick/Code/{REPO}.
                 Error: {FAILURE_LOG}. Push a fix commit.")
3. After fix: re-check CI
4. After 3 CI failures: escalate
```

**Merge conflict:**
```
1. cd /Users/nick/Code/{REPO}
2. git checkout epic/{EPIC}/{NUMBER}-{SLUG}
3. git fetch origin main
4. git rebase origin/main
5. If clean rebase: git push --force-with-lease, retry merge
6. If conflict: launch agent to resolve, or escalate
```

## Step 5: Epic Completion

After all waves complete:

1. **Close the epic issue:**
   ```bash
   gh issue close {EPIC_NUMBER} --repo data-kinetic/{EPIC_REPO} --comment "$(cat <<'EOF'
   ## Epic Complete 🎉

   All waves executed successfully.

   ### Merged PRs
   {LIST_OF_ALL_PRS_WITH_REPOS}

   ### Acceptance Criteria
   {CHECKLIST_FROM_EPIC_BODY — verify each item}

   ### Summary
   - Total PRs: {COUNT}
   - Waves: {WAVE_COUNT}
   - Repos touched: {REPO_LIST}
   EOF
   )"
   ```

2. **Post to Slack:**
   `/dk-notify "Epic complete: {TITLE} (dk-planning#{EPIC_NUMBER}). {PR_COUNT} PRs merged across {REPO_COUNT} repos."`

3. **Cleanup verification:**
   ```bash
   # Verify no orphaned branches
   for repo in {ALL_REPOS}; do
     echo "=== $repo ==="
     gh api repos/data-kinetic/$repo/branches --jq '.[].name | select(startswith("epic/{EPIC}/"))'
   done

   # Verify no orphaned worktrees
   for repo in {ALL_REPOS}; do
     cd /Users/nick/Code/$repo && git worktree list
   done

   # Verify main is clean in all repos
   for repo in {ALL_REPOS}; do
     cd /Users/nick/Code/$repo && git checkout main && git pull && git status
   done
   ```

4. **Save memory** if this is the first run of the pattern — record what worked, timing, any issues.

---

## Crash Recovery

If the session dies mid-execution, restart with:

```
/dk-epic-execute {repo}#{issue} --start-wave N
```

The orchestrator reconstructs state from GitHub:

```bash
# Find all PRs for this epic
for repo in {ALL_REPOS}; do
  echo "=== $repo ==="
  gh pr list --repo "data-kinetic/$repo" --search "epic/{EPIC}" --state all \
    --json number,title,state,mergedAt,headRefName
done
```

- **Merged PR** → issue complete, skip
- **Open PR** → review and merge (resume merge gate)
- **No PR + open issue** → launch agent (resume from that wave)

---

## Error Handling

| Scenario | Response |
|----------|----------|
| Epic issue not found | Error: "Epic {repo}#{issue} not found. Check the reference." |
| No linked issues found | Error: "No linked issues found in epic body. Expected checkbox or table format." |
| Circular dependency | Error: "Circular dependency detected: {cycle}. Fix the epic issue body." |
| Repo not accessible | Error: "{repo} not found at {path}. Clone it or update the path." |
| Agent fails (no PR) | Retry once from branch, then escalate via Slack DM |
| CI fails | Launch fix-agent, retry up to 3 times, then escalate |
| Merge conflict | Rebase feature branch, retry, then escalate |
| All retries exhausted | `/dk-notify dm "Epic {repo}#{issue} blocked on {details}. Manual intervention needed."` |
