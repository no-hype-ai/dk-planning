# CLAUDE.md

Guidance for Claude Code when working in the dk-planning repository.

## Project Overview

dk-planning is the single source of truth for the Data Kinetic platform's architecture, operational patterns, and strategic planning. It contains documentation (docs/), implementation plans (plans/), and the master baseline (01-implementation-plan-baseline.md).

**This repo does NOT contain application code.** It contains documentation, plans, and coordination assets that drive work across sibling repos.

## Repository Structure

```
dk-planning/
├── docs/                          # 22 operational documentation files
│   ├── README.md                  # Documentation index + tooling roadmap
│   ├── platform-overview.md       # Architecture, hosts, network topology
│   ├── infrastructure.md          # K3s, data stores, components inventory
│   ├── gitops-and-cd.md           # ArgoCD patterns, ApplicationSets
│   ├── observability.md           # LGTM stack, dashboards, alerts
│   ├── dk-cli.md                  # CLI tool spec
│   ├── platform-api.md            # Platform API spec
│   ├── litellm.md                 # LLM proxy documentation
│   ├── preview-environments.md    # Preview stack documentation
│   └── ...                        # 13 more docs
├── plans/
│   ├── dk-alchemy/                # 11 plans for platform services
│   ├── dk-clusters/               # 7 plans for infrastructure
│   └── dk-template/               # 7 plans for repo scaffolding
├── 01-implementation-plan-baseline.md  # Master execution plan
└── compliance-and-attestation/    # Compliance program overview
```

## Sibling Repositories

| Repo | Local Path | Purpose | Docs |
|------|-----------|---------|------|
| [dk-alchemy](https://github.com/data-kinetic/dk-alchemy) | `/Users/nick/Code/dk-alchemy` | Platform mono-repo — K8s infra, ArgoCD, observability, CI/CD | Has own CLAUDE.md |
| [dk-clusters](https://github.com/data-kinetic/dk-clusters) | `/Users/nick/Code/dk-clusters` | Proxmox cluster management — penguin + krang hosts, VM lifecycle | Has own CLAUDE.md |
| [dk-template](https://github.com/data-kinetic/dk-template) | `/Users/nick/Code/dk-template` | GitHub template for scaffolding new product repos | Has own CLAUDE.md |
| [dk-compliance-v2](https://github.com/data-kinetic/dk-compliance-v2) | `/Users/nick/Code/dk-compliance-v2` | Compliance management (SOC 2, HIPAA, NIST) | — |
| [behavior-labs-ai](https://github.com/data-kinetic/behavior-labs-ai) | `/Users/nick/Code/behavior-labs-ai` | Reference product repo (pharma SaaS) | — |

## Implementation Plan

The master plan is `01-implementation-plan-baseline.md`. It defines 4 phases across 16 weeks:

- **Phase 0 (Weeks 1-2):** Stabilize infrastructure — P0 critical fixes in dk-clusters
- **Phase 1 (Weeks 3-6):** Foundation — Platform API, SLOs, CI/CD, observability package
- **Phase 2 (Weeks 7-12):** Core platform — Security, Sentry migration, DR, template scaffold
- **Phase 3 (Weeks 13-16):** Product onboarding — Migrations, dk-cli v1.0

## Cross-Repo Coordination Commands

```bash
# Check milestone progress across all repos
for repo in dk-alchemy dk-clusters dk-template; do
  echo "=== $repo ===" && gh api repos/data-kinetic/$repo/milestones --jq '.[] | "\(.title): \(.open_issues) open, \(.closed_issues) closed"'
done

# Check P0 issues across repos
for repo in dk-alchemy dk-clusters dk-template; do
  echo "=== $repo ===" && gh issue list --repo data-kinetic/$repo --label priority/p0 --json number,title --jq '.[] | "#\(.number) \(.title)"'
done

# Check blocked issues
for repo in dk-alchemy dk-clusters dk-template; do
  echo "=== $repo ===" && gh issue list --repo data-kinetic/$repo --label status/blocked --json number,title --jq '.[] | "#\(.number) \(.title)"'
done
```

## Doppler Project Map

| Project | Configs | Purpose |
|---------|---------|---------|
| `dk-infrastructure` | `prd` | Platform infra secrets |
| `dk-cluster` | `prd` | ArgoCD + cluster secrets |
| `00-dk-tools` | `prd` | LiteLLM master key, shared tools |
| `behaviorlabs-applications` | `dev`, `stg`, `prd` | BehaviorLabs app secrets |
| `60-dk-compliance-v2` | `dev`, `stg`, `prd` | Compliance platform |

## Working Conventions

- **Docs are the source of truth.** When editing docs/, verify claims against actual dk-alchemy manifests.
- **Plans drive issues.** Each plan in plans/ maps to GitHub issues in the target repo.
- **Don't duplicate.** dk-alchemy has its own specs/ directory. Plans here complement, not replace, those specs.
- **Cross-reference.** When updating a doc that affects another repo, note the impact.
- **Verify before claiming.** Use `gh repo view`, `gh issue list`, or read actual manifests before stating what exists.

## Slash Commands

| Command | Usage | Purpose |
|---------|-------|---------|
| `/dk-execute` | `/dk-execute` or `/dk-execute phase 1` | Orchestrate subagents to work through current phase issues across all repos. Reports to Slack, escalates blockers. |
| `/dk-epic-execute` | `/dk-epic-execute dk-planning#15` | Execute multi-repo epic — resolves dependency DAG, launches parallel sub-agents per wave, merges PRs in order. See [docs/epic-orchestration.md](docs/epic-orchestration.md). |
| `/dk-status` | `/dk-status` or `/dk-status 1` | Show milestone progress, P0 issues, blocked work, and phase gate status across all repos. |
| `/dk-notify` | `/dk-notify "message"` or `/dk-notify dm blocker details` | Send coordination message to Slack (#dk-infrastructure or DM Nick King). |

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/cross-repo-status.sh` | Dashboard view of milestones, P0s, blocked issues across repos |
| `scripts/phase-gate.sh <N>` | Validate phase exit criteria (all issues closed?) |
| `scripts/dk-notify.sh "msg"` | Webhook-based Slack notification fallback |

## Hooks

When committing changes to docs/:
- Verify all internal links resolve (relative paths to other docs)
- Verify external repo links are valid GitHub URLs
- Check that the tooling roadmap in docs/README.md stays sorted by priority
