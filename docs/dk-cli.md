# dk-cli

## Overview

`dk` is the Data Kinetic platform CLI — a single entry point for scaffolding, local development, secrets, observability, standards compliance, and issue governance across all product repos.

**Package:** `@datakinetic/cli` on [npm](https://www.npmjs.com/)
**Repository:** [`data-kinetic/dk-cli`](https://github.com/data-kinetic/dk-cli)
**Runtime:** [Node.js](https://nodejs.org/) (TypeScript)
**Install:** `npm install -g @datakinetic/cli`

## Commands

### Scaffolding

| Command | Purpose |
|---------|---------|
| `dk init` | Scaffold a new product repo from [`dk-template`](https://github.com/data-kinetic/dk-template). Generates `.gitops/`, `k8s/`, `monitoring/`, CI workflows, and local dev config. Prompts for product name, team, service name. |
| `dk onboard` | Interactive walkthrough of the [onboarding checklist](onboarding.md). Tracks progress, validates each step, and generates the dk-alchemy PR content. |

### Local Development

| Command | Purpose |
|---------|---------|
| `dk up` | Start the local development environment. Detects `docker-compose.yaml` or `k3d` config in `.gitops/local/apps/` and starts services with secrets injected from [Doppler](https://docs.doppler.com/). |
| `dk down` | Stop and clean up the local environment. Tears down containers/clusters and removes ephemeral volumes. |
| `dk logs [service]` | Stream logs from local services. Without a service name, streams all. Supports `--follow` and `--tail`. |
| `dk status` | Show running services, health check results, and port mappings. |

### Secrets

| Command | Purpose |
|---------|---------|
| `dk secrets setup` | Initialize Doppler project structure for the current repo. Creates `dev`, `stg`, `prd` configs and generates `DopplerSecret` CRD manifests. |
| `dk secrets pull` | Pull secrets from Doppler `dev` config into a local `.env` file (git-ignored). |
| `dk secrets push <key> <value>` | Set a secret in the current Doppler config. |
| `dk secrets list` | List secret keys (values masked) for the current config. |

### Observability

| Command | Purpose |
|---------|---------|
| `dk observe init` | Add the `@datakinetic/observability` package, generate `instrumentation.ts`, create dashboard and alert scaffolds in `monitoring/`. |
| `dk observe dashboard <service>` | Generate a [Grafana](https://grafana.com/docs/grafana/latest/) dashboard JSON for a service with standard panels (request rate, error rate, latency, resource usage). |
| `dk observe alert <service>` | Generate alert rule YAML with required labels (`team`, `service`, `product`, `severity`). |
| `dk observe validate` | Validate dashboard JSON and alert YAML against platform conventions. |

### Standards & Compliance

| Command | Purpose |
|---------|---------|
| `dk check` | Run all applicable [standards compliance](standards-compliance.md) checks locally. Validates manifests (Tier 1), observability (Tier 2), CI/CD (Tier 3), and code patterns (Tier 4). |
| `dk check --tier <n>` | Run checks for a specific tier only. |
| `dk check --fix` | Auto-fix issues where possible (add missing labels, resource limits, etc.). |

### Labels & Governance

| Command | Purpose |
|---------|---------|
| `dk labels sync` | Validate and create [GitHub](https://docs.github.com/en/actions) labels in the current repo matching the platform taxonomy (type/, priority/, status/, risk/, area/ prefixes). Reports missing, extra, and misconfigured labels. |
| `dk labels sync --apply` | Create/update labels to match the taxonomy. Without `--apply`, runs in dry-run mode. |
| `dk labels sync --org` | Sync labels across all repos in the `data-kinetic` org. |

### LLM Management

Commands backed by the [Platform API](platform-api.md), which proxies to [LiteLLM](litellm.md).

| Command | Purpose |
|---------|---------|
| `dk llm keys list` | List all virtual keys with budgets, rate limits, and usage stats |
| `dk llm keys create` | Create a virtual key (interactive: app name, budget, RPM, TPM, allowed models) |
| `dk llm keys rotate <alias>` | Rotate a virtual key, returning the new key value |
| `dk llm keys update <alias>` | Update key config (budget, rate limits, model restrictions) |
| `dk llm budget` | Show budget usage across all apps (spent, remaining, % used) |
| `dk llm models` | List available models from all configured providers |

### Preview Environments

Commands backed by the [Platform API](platform-api.md), which orchestrates docker-compose on VM101. See [Preview Environments](preview-environments.md).

| Command | Purpose |
|---------|---------|
| `dk preview up` | Deploy preview from current repo/branch. Generates subdomain at `<branch>.preview.behaviorlabs.ai`. |
| `dk preview down <name>` | Tear down a preview and clean up resources |
| `dk preview list` | Show all active preview deployments with URLs and status |
| `dk preview logs <name>` | Stream logs from a preview's services |

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
doppler:
  project: bla-applications
```

Global config lives in `~/.dk/config.yaml`:

```yaml
doppler_token: dp.st.xxx          # Or use DOPPLER_TOKEN env var
github_org: data-kinetic
default_runner: standard
api_url: https://dk.datakinetic.com  # Platform API base URL
api_token: dk_...                    # Personal API token (for dk llm, dk preview, dk labels sync --org)
```

## Architecture

```
dk-cli/
├── src/
│   ├── index.ts                   # CLI entry point (commander)
│   ├── commands/
│   │   ├── init.ts                # dk init
│   │   ├── onboard.ts             # dk onboard
│   │   ├── up.ts                  # dk up
│   │   ├── down.ts                # dk down
│   │   ├── logs.ts                # dk logs
│   │   ├── status.ts              # dk status
│   │   ├── secrets.ts             # dk secrets *
│   │   ├── observe.ts             # dk observe *
│   │   ├── check.ts               # dk check
│   │   ├── labels.ts              # dk labels *
│   │   ├── llm.ts                 # dk llm * (via Platform API)
│   │   └── preview.ts             # dk preview * (via Platform API)
│   ├── lib/
│   │   ├── api-client.ts          # Platform API HTTP client
│   │   ├── doppler.ts             # Doppler API client
│   │   ├── docker.ts              # Docker/docker-compose helpers
│   │   ├── github.ts              # GitHub API (labels, repos, PRs)
│   │   ├── kustomize.ts           # Kustomize validation
│   │   ├── standards.ts           # Standards check logic
│   │   └── config.ts              # Config file parsing
│   └── templates/                 # Scaffolding templates (copied from dk-template)
├── package.json
├── tsconfig.json
└── README.md
```

## Label Taxonomy

`dk labels sync` enforces the following taxonomy across repos. This matches the [behavior-labs-ai](https://github.com/data-kinetic/behavior-labs-ai) label set:

| Prefix | Labels | Purpose |
|--------|--------|---------|
| `type/` | bug, enhancement, chore, security | Issue classification |
| `priority/` | p0, p1, p2, p3 | Urgency (p0 = blocking production) |
| `status/` | triage, spec-needed, planned, in-progress, blocked, review, done, archived | Workflow state machine |
| `risk/` | critical, high, medium, low | Risk assessment |
| `area/` or `surface/` | Repo-specific | Domain area (e.g., `area/architecture` for dk-planning, `surface/api` for product repos) |
| (none) | epic, needs-decision, duplicate, wontfix, documentation | General-purpose |

The label definitions (name, color, description) are stored as a YAML file in dk-cli and used as the source of truth for `dk labels sync`.

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

- [Platform API](platform-api.md) — server-side counterpart (LLM, preview, webhook, label endpoints)
- [LiteLLM](litellm.md) — LLM proxy managed via `dk llm` commands
- [Preview Environments](preview-environments.md) — preview stack managed via `dk preview` commands
- [Onboarding](onboarding.md) — the checklist `dk onboard` walks through
- [Template Repository](template-repo.md) — the template `dk init` scaffolds from
- [Standards Compliance](standards-compliance.md) — the checks `dk check` runs
- [Secrets Management](secrets-management.md) — Doppler integration details
- [Issue Governance](issue-governance.md) — label taxonomy and governance automation
- [GitOps & CD](gitops-and-cd.md) — local development patterns
