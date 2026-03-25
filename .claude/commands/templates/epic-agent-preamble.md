# Epic Agent Preamble

> Include this context in every epic sub-agent prompt. Replace `{PLACEHOLDERS}` with actual values.

## Working Directory

```
/Users/nick/Code/{REPO}
```

ALL git and file operations MUST use this directory. Start every session with:
```bash
cd /Users/nick/Code/{REPO}
```

## Git Workflow

### 1. Branch Setup
```bash
cd /Users/nick/Code/{REPO}
git fetch origin main
git checkout -b epic/{EPIC_NUMBER}/{ISSUE_NUMBER}-{SLUG} origin/main
```

### 2. Commit Convention
Each commit must reference the epic:
```bash
git commit -m "{TYPE}: {DESCRIPTION}

Part of data-kinetic/dk-planning#{EPIC_NUMBER}"
```

Types: `feat` (new capability), `fix` (bug fix), `chore` (maintenance), `docs` (documentation)

### 3. Push + Create PR
```bash
git push -u origin epic/{EPIC_NUMBER}/{ISSUE_NUMBER}-{SLUG}

gh pr create \
  --repo data-kinetic/{REPO} \
  --title "{PR_TITLE}" \
  --body "$(cat <<'EOF'
## Summary
{BULLET_POINTS}

## Plan Reference
- Epic: data-kinetic/dk-planning#{EPIC_NUMBER}
- Plan: `{PLAN_FILE_PATH}`
- Issue: #{ISSUE_NUMBER}

## Test Plan
{VALIDATION_STEPS}

Closes #{ISSUE_NUMBER}
Part of data-kinetic/dk-planning#{EPIC_NUMBER}

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 4. Report
Print the PR URL as the **LAST line** of your output so the orchestrator can parse it.

## Rules

- Do NOT merge the PR — the orchestrator handles merging
- Do NOT modify files outside the scope of this issue
- Do NOT push to main directly — always use your feature branch
- If blocked or stuck: document the blocker in your output clearly
- Reference sibling repos for cross-references only (read, don't write)

## Sibling Repos (read-only reference)

- dk-alchemy: `/Users/nick/Code/dk-alchemy`
- dk-clusters: `/Users/nick/Code/dk-clusters`
- dk-template: `/Users/nick/Code/dk-template`
- dk-data-fe: `/Users/nick/Code/dk-data-fe`
- dk-planning: `/Users/nick/Code/dk-planning` (docs, plans, baseline)
- behavior-labs-ai: `/Users/nick/Code/behavior-labs-ai`

## SSH Access (infrastructure validation only)

- `ssh penguin` — Proxmox node 1 (192.168.10.8)
- `ssh -J penguin ubuntu@10.0.0.11` — K3s master
- `ssh -J penguin ubuntu@10.0.0.12` — K3s slave
- `ssh krang` — Proxmox node 2 (192.168.10.100)

## Doppler Projects

| Project | Config | Purpose |
|---------|--------|---------|
| `dk-infrastructure` | `prd` | Platform infra secrets |
| `dk-cluster` | `prd` | ArgoCD + cluster secrets |
| `00-dk-tools` | `prd` | LiteLLM, shared tools |
| `behaviorlabs-applications` | `dev`, `stg`, `prd` | BehaviorLabs app secrets |
