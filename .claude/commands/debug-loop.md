---
description: Orchestrated debugging loop — queries logs, identifies issues, dispatches parallel sub-agent fixes in worktrees, merges PRs, syncs Grafana, verifies zero drift. Repeats until clean.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty). The user may specify:
- A specific service or component to focus on (e.g., "platform-api", "probe-service", "dk-cli")
- A specific issue to investigate (e.g., "structlog crash", "500 errors")
- A time range (e.g., "last hour", "last 24h") — default: last 30 minutes
- Additional context files to read
- Whether to auto-merge or wait for approval

If no input, run a full sweep across all platform services.

## Principles

1. **Never create drift** — all changes go through PRs, squash-merged to main
2. **Never deprecate or remove a feature** without explicit user confirmation
3. **Sub-agents work in worktrees** — isolated branches, no conflicts with main
4. **This agent is the orchestrator** — it reads logs, creates tasks, dispatches agents, merges results
5. **Repeat until clean** — the loop runs until no new actionable issues are found
6. **Evidence before assertions** — always query logs/metrics before claiming something is fixed

## Loop Execution

### Phase 1: Gather Evidence

1. **Ensure on main and up to date:**
   ```
   git checkout main && git fetch origin --prune && git reset --hard origin/main
   ```

2. **Query Loki for errors** across the target scope (default: infra namespace, last 30 minutes):
   ```
   Use Grafana API with the Loki datasource UID to query:
   - {container="<target>"} |~ "(?i)(error|exception|traceback|failed|critical)" != "/health" != "DeprecationWarning"
   - Deduplicate by first 80 chars, count occurrences
   - Report unique error patterns with sample lines
   ```

   The Grafana API key is in Doppler: `doppler secrets get GRAFANA_API_KEY --plain -p dk-infrastructure -c prd`
   The Loki datasource UID is `P8E80F9AEF21F6940`
   The Mimir datasource UID is `PAE45454D0EDB9216`
   The Grafana URL is `https://grafana.behaviorlabs.ai`

3. **Query Mimir for anomalies** (optional, based on scope):
   - Check alert states via `/api/prometheus/grafana/api/v1/rules`
   - Check for metric gaps (expected metrics missing)
   - Check for high error rates

4. **Check Grafana dashboard panels** (optional):
   - Use Chrome DevTools MCP to navigate to dashboards
   - Take screenshots and snapshots to identify "No data" panels

5. **Read any user-provided context files** (e.g., gap analysis docs, issue reports)

### Phase 2: Triage & Task Creation

1. **Classify each issue** by severity:
   - **Critical**: Service crashes, data loss, security — fix immediately
   - **High**: Broken functionality, misleading dashboards, stale data
   - **Medium**: Missing features, suboptimal UX, incomplete instrumentation
   - **Low**: Cosmetic, documentation, nice-to-have

2. **Create TaskCreate tasks** for each actionable issue:
   - Subject: imperative description of what to fix
   - Description: root cause, affected files, fix approach
   - Set dependencies between tasks (e.g., zero-drift blocked by all fixes)

3. **Always create a final "Verify zero drift" task** blocked by all other tasks

4. **Skip issues that are**:
   - Pre-existing and out of scope (document but don't fix)
   - Already being tracked in GitHub issues
   - Require user decision before acting

### Phase 3: Dispatch Sub-Agents

1. **Group tasks** that can run in parallel (different files/services)

2. **Dispatch sub-agents** using the Agent tool with `isolation: "worktree"`:
   - Each agent gets a complete, self-contained prompt with:
     - Problem description and root cause
     - Exact file paths to read and modify
     - The fix approach (be specific — don't leave design decisions to the sub-agent)
     - Instructions to create a branch, commit, push, and create a PR
   - Commit message format:
     ```
     fix(<scope>): <description>

     <optional body>

     Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
     ```
   - Sub-agents must run `validate.sh` or equivalent before committing if touching Grafana files
   - Sub-agents must NOT merge PRs — only create them

3. **Maximum 5 parallel agents** to avoid overwhelming CI

### Phase 4: Merge & Verify

1. **Check CI status** for each PR:
   ```
   gh pr checks <PR_NUMBER> | grep fail
   ```

2. **If CI fails**: Read failure logs, determine if it's the sub-agent's fault or a pre-existing issue
   - If sub-agent's fault: fix in the orchestrator (small edit + push to same branch)
   - If pre-existing: note and merge anyway if the fix itself is correct

3. **Squash merge each PR** sequentially:
   ```
   gh pr merge <PR_NUMBER> --squash --subject "<title> (#<PR_NUMBER>)"
   ```

4. **Mark tasks as completed** after successful merge

5. **After all PRs merged**, sync to Grafana if dashboard/alert files changed:
   ```
   GRAFANA_URL=https://grafana.behaviorlabs.ai GRAFANA_API_KEY=$KEY ./grafana/scripts/sync-all.sh
   ```

### Phase 5: Zero Drift Verification

1. **Sync main**:
   ```
   git checkout main && git fetch origin --prune && git reset --hard origin/main
   ```

2. **Clean up**:
   - Remove worktrees: `git worktree remove <path> --force`
   - Delete local branches: `git branch | grep -v main | xargs git branch -D`

3. **Verify**:
   - `git branch` — only `main`
   - `git worktree list` — only repo root
   - `git status --short` — only expected untracked files
   - `./grafana/scripts/validate.sh` — 0 errors
   - `gh pr list --state open` — 0 open PRs
   - Alert health check via Grafana API — all platform alerts healthy

4. **Report**: Summary table of all issues found, fixes applied, PRs merged

### Phase 6: Repeat or Complete

1. **Re-run Phase 1** to check if fixes introduced new issues
2. **If new issues found**: create new tasks and dispatch agents (go to Phase 2)
3. **If no new issues**: report "Clean — no actionable issues found" and complete
4. **Maximum 3 iterations** to prevent infinite loops — if issues persist after 3 rounds, report remaining issues and ask user for guidance

## Output Format

After each loop iteration, report:

```
## Debug Loop — Iteration N

### Issues Found
| # | Severity | Issue | Root Cause | Fix |
|---|----------|-------|------------|-----|

### PRs Merged
| PR | Title |
|----|-------|

### Remaining Issues
| # | Issue | Reason Not Fixed |
|---|-------|-----------------|

### Zero Drift Status
| Check | Result |
|-------|--------|
```

## Grafana API Reference

```bash
# Get API key
GRAFANA_API_KEY=$(doppler secrets get GRAFANA_API_KEY --plain -p dk-infrastructure -c prd)

# Query Loki logs
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  -G "https://grafana.behaviorlabs.ai/api/datasources/proxy/uid/P8E80F9AEF21F6940/loki/api/v1/query_range" \
  --data-urlencode 'query={container="platform-api"} |~ "error"' \
  --data-urlencode "start=$(python3 -c 'import time; print(int(time.time()-1800))')" \
  --data-urlencode "end=$(python3 -c 'import time; print(int(time.time()))')" \
  --data-urlencode 'limit=50'

# Query Mimir metrics
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  -G "https://grafana.behaviorlabs.ai/api/datasources/proxy/uid/PAE45454D0EDB9216/api/v1/query" \
  --data-urlencode 'query=up{job=~".*platform.*"}'

# Check alert states
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "https://grafana.behaviorlabs.ai/api/prometheus/grafana/api/v1/rules"

# Sync dashboards/alerts
GRAFANA_URL="https://grafana.behaviorlabs.ai" GRAFANA_API_KEY="$GRAFANA_API_KEY" \
  ./grafana/scripts/sync-all.sh
```

## Key Infrastructure Facts

| Component | Endpoint / UID |
|-----------|---------------|
| Grafana URL | https://grafana.behaviorlabs.ai |
| Loki datasource UID | P8E80F9AEF21F6940 |
| Mimir datasource UID | PAE45454D0EDB9216 |
| Tempo datasource UID | P214B5B846CF3925F |
| OTLP endpoint | http://alloy.infra.svc.cluster.local:4318 |
| Platform API | https://dk.datakinetic.com |
| kube-state-metrics label | Use `exported_namespace` (not `namespace`) |
| OTel HTTP metric name | `http_server_duration_milliseconds_*` |
| Probe metrics | `probe_target_up`, `probe_cycles_total`, etc. |
| Grafana API key source | `doppler secrets get GRAFANA_API_KEY --plain -p dk-infrastructure -c prd` |
