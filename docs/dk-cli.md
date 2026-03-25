# dk-cli

## Overview

`dk` is the Data Kinetic platform CLI — a single entry point for scaffolding, local development, secrets, observability, standards compliance, and issue governance across all product repos.

**Package:** [`dk-alchemy/src/dk-cli/`](https://github.com/data-kinetic/dk-alchemy/tree/main/src/dk-cli)
**Runtime:** [Bun](https://bun.sh/) (TypeScript, compiled binary)
**Install:** `curl -fsSL https://dk.datakinetic.com/install | sh`
**Update:** `dk self-update`
**Version:** 0.1.0

## Commands

Status key: **Implemented** = shipped and working, **Planned** = documented but not yet built.

### Auth & Identity

| Command | Purpose | Status |
|---------|---------|--------|
| `dk login` | Authenticate via DK-OS Clerk device code flow. Supports `--api-key <key>` for CI. | Implemented |
| `dk logout` | Clear stored session, revoke server-side token (best-effort). | Implemented |
| `dk whoami` | Show current identity — user, role, organization, permissions. | Implemented |
| `dk doctor` | Diagnose dk installation, configuration, and connectivity to Platform API. | Implemented |

### Repo Lifecycle

| Command | Purpose | Status |
|---------|---------|--------|
| `dk init` | Scaffold a new product repo from [`dk-template`](https://github.com/data-kinetic/dk-template). Interactive prompts for product name, team, services. Alias: `dk create`. | Implemented |
| `dk adopt` | Onboard an existing repo to the DK platform. Generates `.dk-standards.yaml`, CI workflows, gitops scaffolds. `--verify` for dry-run. | Implemented |
| `dk onboard` | Interactive walkthrough of the onboarding checklist (7 steps). `--status` for progress-only. | Implemented |

### Promotion Lifecycle

| Command | Purpose | Status |
|---------|---------|--------|
| `dk promote preview` | Deploy preview from current branch. | Implemented |
| `dk promote staging` | Promote to staging (creates approval issue). `--skip-preview` available. | Implemented |
| `dk promote production` | Promote to production (requires admin role, cross-approval). | Implemented |
| `dk promote status` | Show promotion state across all stages for current repo. | Implemented |
| `dk promote rollback <stage>` | Rollback staging or production to previous version. | Implemented |

### Preview Environments

Commands backed by the [Platform API](platform-api.md), which orchestrates docker-compose on VM101. See [Preview Environments](preview-environments.md).

| Command | Purpose | Status |
|---------|---------|--------|
| `dk preview up` | Deploy preview from current repo/branch. Options: `--name`, `--ttl`, `--domain`, `--doppler-config`. | Implemented |
| `dk preview down <name>` | Tear down a preview and clean up resources. | Implemented |
| `dk preview list` | Show all active preview deployments with URLs and status. | Implemented |
| `dk preview logs <name>` | Stream logs from a preview's services. Options: `--service`, `--tail`. | Implemented |

### Data Metering

Commands backed by the [Platform API](platform-api.md) data router, managing consumer API keys for [dk-data-fe](https://github.com/data-kinetic/dk-data-fe).

| Command | Purpose | Status |
|---------|---------|--------|
| `dk data keys create` | Create a consumer API key. Options: `--app`, `--schemas`, `--rpm`, `--tier`. | Implemented |
| `dk data keys list` | List all consumer keys with usage stats. | Implemented |
| `dk data keys rotate <alias>` | Rotate a key (24h grace period for old key). | Implemented |
| `dk data keys update <alias>` | Update key config — rate limits, schemas, tier. | Implemented |
| `dk data keys revoke <alias>` | Revoke a consumer key immediately. | Implemented |
| `dk data usage [alias]` | Show usage metrics. Options: `--from`, `--to`. | Implemented |
| `dk data schemas` | List available schemas and access tiers. | Implemented |
| `dk data limits` | View rate limits per consumer. | Implemented |

### LLM Management

Commands backed by the [Platform API](platform-api.md), which proxies to [LiteLLM](litellm.md).

| Command | Purpose | Status |
|---------|---------|--------|
| `dk llm keys list` | List all virtual keys with budgets and usage stats. | Implemented |
| `dk llm keys create` | Create a virtual key. Options: `--alias`, `--budget`, `--models`. | Implemented |
| `dk llm keys delete <key_id>` | Delete (revoke) an LLM API key. | Implemented |
| `dk llm models` | List available models from all configured providers. | Implemented |
| `dk llm spend` | Show spend data across all keys. | Implemented |

### Labels & Governance

| Command | Purpose | Status |
|---------|---------|--------|
| `dk labels sync` | Show label taxonomy and dry-run check for current repo. | Implemented |
| `dk labels sync --apply` | Create/update labels to match the taxonomy. | Implemented |
| `dk labels sync --org --apply` | Sync labels across all repos in the `data-kinetic` org. | Implemented |
| `dk labels audit` | Audit label compliance across all repos. | Implemented |

### Plugin System

| Command | Purpose | Status |
|---------|---------|--------|
| `dk self-update` | Check for and install the latest dk binary. Options: `--check`, `--version`, `--channel`. | Implemented |
| `dk plugin install` | Download and install skills, agents, and hooks from the registry. | Implemented |
| `dk plugin update` | Update all installed plugins. `--check` for dry-run. | Implemented |

### Local Development (Planned)

| Command | Purpose | Status |
|---------|---------|--------|
| `dk up` | Start local dev environment via docker-compose with Doppler secrets injection. | Planned |
| `dk down` | Stop and clean up local environment. | Planned |
| `dk logs [service]` | Stream logs from local services. | Planned |
| `dk status` | Show running services, health checks, and port mappings. | Planned |

### Secrets (Planned)

| Command | Purpose | Status |
|---------|---------|--------|
| `dk secrets setup` | Initialize Doppler project structure for the current repo. | Planned |
| `dk secrets pull` | Pull secrets from Doppler `dev` config into `.env`. | Planned |
| `dk secrets push <key> <value>` | Set a secret in the current Doppler config. | Planned |
| `dk secrets list` | List secret keys (values masked). | Planned |

### Observability (Planned)

| Command | Purpose | Status |
|---------|---------|--------|
| `dk observe init` | Add observability package, generate scaffolds. | Planned |
| `dk observe dashboard <service>` | Generate Grafana dashboard JSON. | Planned |
| `dk observe alert <service>` | Generate alert rule YAML. | Planned |
| `dk observe validate` | Validate dashboards and alerts against conventions. | Planned |

### Standards & Compliance (Planned)

| Command | Purpose | Status |
|---------|---------|--------|
| `dk check` | Run standards compliance checks locally. | Planned |
| `dk check --tier <n>` | Run checks for a specific tier only. | Planned |
| `dk check --fix` | Auto-fix issues where possible. | Planned |

### Infrastructure (Planned)

| Command | Purpose | Status |
|---------|---------|--------|
| `dk health` | Full infrastructure health check. | Planned |
| `dk ssh <target>` | SSH shortcut to infrastructure targets. | Planned |
| `dk kubectl <args>` | Proxy kubectl commands to K3s master via SSH jump. | Planned |

### Cross-Repo Operations (Planned)

| Command | Purpose | Status |
|---------|---------|--------|
| `dk status` | Cross-repo dashboard — milestones, P0 issues, blocked work. | Planned |
| `dk notify <message>` | Send coordination message to Slack. | Planned |

## Configuration

`dk` reads configuration from `.dk-standards.yaml` in the repo root (same file used by [standards compliance](standards-compliance.md) CI checks):

```yaml
product: behavior-labs-ai
team: bla-engineering
tiers: [1, 2, 3]
services:
  - name: api
    port: 3000
  - name: worker
    port: 3001
promotion:
  staging:
    approvers: [nick]
  production:
    approvers: [nick]
    require_cross_approval: true
```

Global config lives in `~/.dk/config.yaml`:

```yaml
auth:
  token: dk_clerk_...             # Clerk session token (set by dk login)
  api_key: dk_...                 # API key (alternative to Clerk)
  user: nick@datakinetic.com
  role: admin
  expires_at: "2026-04-01T00:00:00Z"
  refresh_token: "..."

api_url: https://dk.datakinetic.com  # Platform API base URL
github_org: data-kinetic
doppler_token: dp.st.xxx            # Or use DOPPLER_TOKEN env var

# Infrastructure (for dk health, dk ssh — planned)
ssh_jump_host: penguin
k3s_master: 10.0.0.11
preview_host: 192.168.10.51
litellm_host: 192.168.10.50
```

## Architecture

```
dk-alchemy/src/dk-cli/
├── src/
│   ├── index.ts                   # CLI entry point (commander)
│   ├── commands/
│   │   ├── create.ts              # dk init (alias: dk create)
│   │   ├── adopt.ts               # dk adopt
│   │   ├── onboard.ts             # dk onboard
│   │   ├── login.ts               # dk login, dk logout, dk whoami
│   │   ├── doctor.ts              # dk doctor
│   │   ├── promote.ts             # dk promote *
│   │   ├── preview.ts             # dk preview * (via Platform API)
│   │   ├── data.ts                # dk data * (via Platform API)
│   │   ├── llm.ts                 # dk llm * (via Platform API)
│   │   ├── labels.ts              # dk labels * (via Platform API)
│   │   ├── plugin.ts              # dk plugin install/update
│   │   └── self-update.ts         # dk self-update
│   ├── lib/
│   │   ├── api-client.ts          # Platform API HTTP client (auth, retry, refresh)
│   │   ├── auth.ts                # Token resolution, role hierarchy, requireRole()
│   │   ├── config.ts              # ~/.dk/config.yaml read/write/merge
│   │   ├── github.ts              # GitHub API (Octokit — issues, labels, repos)
│   │   ├── standards.ts           # .dk-standards.yaml parsing and validation
│   │   ├── template.ts            # Placeholder replacement for dk-template scaffolding
│   │   └── update-checker.ts      # Background version check (24h cache)
│   └── tests/                     # Test directory (empty — tests planned)
├── build.ts                       # Bun cross-compilation (4 platform targets)
├── package.json
└── tsconfig.json
```

## Skills & Hooks Registry

Skills and hooks are distributed via a git-backed registry in [`dk-alchemy/packages/dk-skills/`](https://github.com/data-kinetic/dk-alchemy/tree/main/packages/dk-skills):

```
packages/dk-skills/
├── skills/           # Skill definitions (YAML/TypeScript)
├── hooks/            # Hook scripts (shell/TypeScript)
├── manifest.json     # Version registry with SHA256 checksums
└── README.md
```

Installed locally to `~/.dk/`:

```
~/.dk/
├── config.yaml       # Global configuration
├── skills/           # Downloaded skills
├── hooks/            # Downloaded hooks
├── manifest.lock     # Installed versions + checksums
└── bin/dk            # Binary (if installed via curl)
```

Version checking runs in the background on every `dk` invocation. If updates are available, a non-blocking message is displayed.

## Label Taxonomy

`dk labels sync` enforces the following taxonomy across repos. This matches the [behavior-labs-ai](https://github.com/data-kinetic/behavior-labs-ai) label set:

| Prefix | Labels | Purpose |
|--------|--------|---------|
| `type/` | bug, feature, chore, docs, security, refactor, test, ci | Issue classification |
| `priority/` | p0, p1, p2, p3 | Urgency (p0 = blocking production) |
| `status/` | blocked, in-progress, needs-review, ready | Workflow state machine |
| `risk/` | high, medium, low | Risk assessment |

The label definitions (name, color, description) are stored in the Platform API labels router and used as the source of truth for `dk labels sync`.

## Dependencies

| Package | Purpose |
|---------|---------|
| [commander](https://github.com/tj/commander.js) | CLI framework |
| [@octokit/rest](https://github.com/octokit/rest.js) | GitHub API |
| [execa](https://github.com/sindresorhus/execa) | Shell command execution |
| [chalk](https://github.com/chalk/chalk) | Terminal colors |
| [ora](https://github.com/sindresorhus/ora) | Spinners |
| [inquirer](https://github.com/SBoudrias/Inquirer.js) | Interactive prompts |
| [js-yaml](https://github.com/nodeca/js-yaml) | YAML parsing |

## Related Documentation

- [Platform API](platform-api.md) — server-side counterpart (LLM, preview, webhook, label, data endpoints)
- [LiteLLM](litellm.md) — LLM proxy managed via `dk llm` commands
- [Preview Environments](preview-environments.md) — preview stack managed via `dk preview` commands
- [Onboarding](onboarding.md) — the checklist `dk onboard` walks through
- [Template Repository](template-repo.md) — the template `dk init` scaffolds from
- [Standards Compliance](standards-compliance.md) — the checks `dk check` runs
- [Secrets Management](secrets-management.md) — Doppler integration details
- [Issue Governance](issue-governance.md) — label taxonomy and governance automation
- [GitOps & CD](gitops-and-cd.md) — local development patterns
- [dk-cli PRD](../plans/dk-alchemy/12-dk-cli-prd.md) — comprehensive product requirements document
