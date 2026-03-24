# dk-cli Product Requirements Document

> **Status:** Draft
> **Last Updated:** 2026-03-23
> **Owner:** Platform Engineering
> **Target Repo:** [dk-alchemy](https://github.com/data-kinetic/dk-alchemy) (`src/dk-cli/`)

---

## 1. Overview

`dk` is the unified CLI for the Data Kinetic platform. It provides a single entry point for scaffolding new product repos, managing local development environments, syncing secrets, enforcing standards compliance, governing issue labels, managing LLM keys and budgets, and orchestrating preview environments.

dk-cli lives in the dk-alchemy monorepo at `src/dk-cli/`. It is built with TypeScript on the Bun runtime and compiled to a standalone binary via `bun build --compile`. Distribution is handled through GitHub Releases, with an install script hosted at `https://dk.datakinetic.com/install`.

The CLI connects to the Platform API at `dk.datakinetic.com` for preview environment, LLM management, and label operations. It includes a git-backed skills and hooks registry (`dk-alchemy/packages/dk-skills/`) that enables extensibility without modifying the core binary.

---

## 2. Problem Statement

Today, Data Kinetic platform users face several friction points:

- **Manual processes everywhere.** Scaffolding a new repo requires manually copying files from dk-template, setting up Doppler projects, creating Kubernetes manifests, and configuring CI workflows. Each step is documented but error-prone when done by hand.
- **No unified tooling.** Developers must context-switch between `docker-compose`, `doppler`, `gh`, `kubectl`, `kustomize`, and custom scripts. There is no single tool that understands the platform's conventions and can orchestrate these tools together.
- **No plugin or extensibility system.** Platform patterns evolve faster than documentation. There is no mechanism to distribute reusable automation (pre-commit hooks, scaffolding extensions, team-specific commands) across repos.
- **CI/CD and local parity gap.** Standards checks run in CI via GitHub Actions but cannot be run locally before pushing. Developers discover compliance failures after they have already committed and pushed.
- **Preview and LLM management require API knowledge.** Deploying a preview or managing LLM keys requires knowing the Platform API endpoints, constructing HTTP requests, and handling auth tokens manually.

dk-cli solves these problems by providing a single, opinionated CLI that encodes platform knowledge and automates common workflows.

---

## 3. Target Users

| User | Use Cases |
|------|-----------|
| **Product Developers** | `dk init` to scaffold repos, `dk up/down` for local dev, `dk secrets pull` for env vars, `dk check` before pushing, `dk preview up` to share work |
| **Platform Engineers** | `dk observe init/validate` to enforce observability standards, `dk labels sync --org` to govern labels, `dk llm keys/budget` to manage LLM access, `dk skills` to publish reusable automation |
| **CI/CD Pipelines** | `dk check` in pull request workflows, `dk labels sync --apply` in scheduled jobs, `dk preview up/down` in PR lifecycle hooks |

---

## 4. Architecture

### 4.1 Monorepo Location

dk-cli lives inside the dk-alchemy monorepo:

```
dk-alchemy/
├── src/
│   └── dk-cli/          ← CLI source
├── packages/
│   └── dk-skills/       ← Skills & hooks registry
└── ...
```

This co-location ensures the CLI stays in sync with platform infrastructure definitions, ArgoCD configurations, and observability packages that also live in dk-alchemy.

### 4.2 Build & Distribution

| Aspect | Detail |
|--------|--------|
| **Runtime** | [Bun](https://bun.sh/) (TypeScript, no transpilation step) |
| **Build** | `bun build --compile --target=<target> src/dk-cli/src/index.ts --outfile dk` |
| **Artifact** | Single standalone binary (no runtime dependency) |
| **Release** | GitHub Releases on `data-kinetic/dk-alchemy` with tag pattern `dk-cli/v*` |
| **CI** | GitHub Actions workflow builds on push to `src/dk-cli/` changes |

**Cross-compilation targets:**

| Target | Platform | Architecture |
|--------|----------|-------------|
| `bun-linux-x64` | Linux | x86_64 |
| `bun-linux-arm64` | Linux | ARM64 (Graviton, Raspberry Pi) |
| `bun-darwin-x64` | macOS | Intel |
| `bun-darwin-arm64` | macOS | Apple Silicon |

Each release attaches four binaries plus a SHA256 checksums file:

```
dk-linux-x64
dk-linux-arm64
dk-darwin-x64
dk-darwin-arm64
checksums.sha256
```

### 4.3 Install Flow

Users install dk-cli with a single command:

```bash
curl -fsSL https://dk.datakinetic.com/install | sh
```

The install script performs the following steps:

1. **Detect OS and architecture** — `uname -s` and `uname -m` to determine the correct binary.
2. **Determine latest version** — Query GitHub Releases API for the latest `dk-cli/v*` tag.
3. **Download binary** — Fetch the platform-appropriate binary from the release assets.
4. **Verify checksum** — Download `checksums.sha256` and verify the binary's SHA256 hash.
5. **Place in PATH** — Move the binary to `~/.dk/bin/dk` and add `~/.dk/bin` to the user's shell profile (`~/.zshrc`, `~/.bashrc`, or `~/.config/fish/config.fish`) if not already present.
6. **Verify installation** — Run `dk --version` to confirm success.
7. **Print next steps** — Suggest `dk doctor` to validate the environment.

### 4.4 Self-Update

dk-cli includes a built-in self-update mechanism:

```bash
dk self-update              # Update to latest version
dk self-update --check      # Check for updates without installing
dk self-update --version v1.2.0  # Install a specific version
```

**Update flow:**

1. Query GitHub Releases API for the latest `dk-cli/v*` release.
2. Compare remote version with the running binary's embedded version.
3. If newer, download the platform-appropriate binary.
4. Verify SHA256 checksum.
5. Replace the running binary atomically (write to temp file, then rename).
6. Print changelog summary from the release notes.

**Background version check:** On every invocation, dk-cli performs a non-blocking background check against the GitHub Releases API. If a newer version is available, it prints a one-line notice after command output:

```
A new version of dk is available: v1.3.0 (current: v1.2.0). Run `dk self-update` to upgrade.
```

The check result is cached in `~/.dk/update-check.json` for 24 hours to avoid excessive API calls.

### 4.5 Directory Layout

```
src/dk-cli/
├── src/
│   ├── index.ts                   # CLI entry point (commander program definition)
│   ├── version.ts                 # Embedded version constant (set at build time)
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
│   │   ├── llm.ts                 # dk llm * (Platform API)
│   │   ├── preview.ts             # dk preview * (Platform API)
│   │   ├── self-update.ts         # dk self-update
│   │   ├── skills.ts              # dk skills *
│   │   ├── hooks.ts               # dk hooks *
│   │   └── doctor.ts              # dk doctor
│   ├── lib/
│   │   ├── api-client.ts          # Platform API HTTP client (base URL, auth, retries)
│   │   ├── doppler.ts             # Doppler API client
│   │   ├── docker.ts              # Docker/docker-compose helpers
│   │   ├── github.ts              # GitHub API (labels, repos, releases)
│   │   ├── kustomize.ts           # Kustomize validation helpers
│   │   ├── standards.ts           # Standards check logic (Tiers 1-4)
│   │   ├── config.ts              # Config file parsing (.dk-standards.yaml, ~/.dk/config.yaml)
│   │   ├── skills-registry.ts     # Skills & hooks registry client
│   │   ├── updater.ts             # Self-update and version check logic
│   │   └── output.ts              # Shared formatting (tables, spinners, colors)
│   └── templates/                 # Scaffolding templates (subset from dk-template)
│       ├── gitops/
│       ├── k8s/
│       ├── monitoring/
│       └── ci/
├── test/
│   ├── commands/                  # Command-level integration tests
│   └── lib/                       # Unit tests for library modules
├── package.json
├── tsconfig.json
├── bunfig.toml                    # Bun configuration
└── README.md
```

---

## 5. Skills & Hooks System

The skills and hooks system provides a lightweight extensibility mechanism. Skills are reusable command extensions; hooks are git hook scripts distributed via the same registry.

### 5.1 Registry Structure

The registry lives in dk-alchemy at `packages/dk-skills/`:

```
packages/dk-skills/
├── manifest.json                  # Registry manifest (versions, checksums, metadata)
├── skills/
│   ├── sentry-migration/
│   │   ├── skill.yaml             # Skill metadata (name, version, description, commands)
│   │   └── index.ts               # Skill entry point
│   ├── compliance-check/
│   │   ├── skill.yaml
│   │   └── index.ts
│   └── db-migrate/
│       ├── skill.yaml
│       └── index.ts
└── hooks/
    ├── pre-commit/
    │   ├── hook.yaml              # Hook metadata
    │   └── run.sh                 # Hook script
    ├── commit-msg/
    │   ├── hook.yaml
    │   └── run.sh
    └── pre-push/
        ├── hook.yaml
        └── run.sh
```

**manifest.json** structure:

```json
{
  "version": "1.0.0",
  "skills": {
    "sentry-migration": {
      "version": "0.2.1",
      "checksum": "sha256:abc123...",
      "description": "Migrate from self-hosted Sentry to Sentry Cloud",
      "commands": ["dk sentry migrate", "dk sentry validate"]
    }
  },
  "hooks": {
    "pre-commit": {
      "version": "1.0.0",
      "checksum": "sha256:def456...",
      "description": "Run dk check and lint before commit"
    }
  }
}
```

### 5.2 Local Storage

Installed skills and hooks are stored in the user's home directory:

```
~/.dk/
├── config.yaml                    # Global CLI configuration
├── bin/
│   └── dk                         # The CLI binary
├── skills/
│   ├── sentry-migration/          # Installed skill files
│   └── compliance-check/
├── hooks/
│   ├── pre-commit/
│   └── commit-msg/
├── manifest.lock                  # Locked versions of installed skills/hooks
├── update-check.json              # Cached version check result
└── logs/
    └── dk.log                     # Debug log (when DK_DEBUG=1)
```

### 5.3 Commands

**Skills commands:**

| Command | Purpose |
|---------|---------|
| `dk skills list` | List available skills from the registry, showing installed status and version |
| `dk skills install <name>` | Download and install a skill to `~/.dk/skills/` |
| `dk skills update [name]` | Update one or all installed skills to the latest registry version |
| `dk skills remove <name>` | Remove an installed skill |

**Hooks commands:**

| Command | Purpose |
|---------|---------|
| `dk hooks list` | List available hooks from the registry, showing installed status |
| `dk hooks install <name>` | Install a hook into the current repo's `.git/hooks/` |
| `dk hooks update [name]` | Update one or all installed hooks to the latest registry version |
| `dk hooks remove <name>` | Remove a hook from the current repo |

### 5.4 Version Checking

- On every CLI invocation, a background (non-blocking) check fetches the latest `manifest.json` from the dk-skills registry.
- If any installed skill or hook is outdated, a one-line notice is printed after command output:

  ```
  Updates available: sentry-migration v0.2.1 → v0.3.0. Run `dk skills update` to upgrade.
  ```

- The manifest is cached locally for 4 hours to reduce network overhead.
- Version checking never blocks or delays the primary command execution.

---

## 6. Command Reference

### 6.1 Scaffolding

| Command | Flags | Description |
|---------|-------|-------------|
| `dk init` | `--template <name>` | Scaffold a new product repo from [dk-template](https://github.com/data-kinetic/dk-template). Generates `.gitops/`, `k8s/`, `monitoring/`, CI workflows, and local dev config. Interactive prompts for product name, team, and service name. |
| `dk onboard` | `--resume` | Interactive walkthrough of the onboarding checklist. Tracks progress in `.dk-onboard.json`, validates each step, and generates the dk-alchemy PR content for platform registration. |

### 6.2 Local Development

| Command | Flags | Description |
|---------|-------|-------------|
| `dk up` | `--detach`, `--service <name>` | Start the local development environment. Detects `docker-compose.yaml` or `k3d` config in `.gitops/local/apps/` and starts services with secrets injected from Doppler. |
| `dk down` | `--volumes` | Stop and clean up the local environment. Tears down containers/clusters and optionally removes ephemeral volumes. |
| `dk logs [service]` | `--follow`, `--tail <n>` | Stream logs from local services. Without a service name, streams all. |
| `dk status` | `--json` | Show running services, health check results, port mappings, and resource usage. |

### 6.3 Secrets

| Command | Flags | Description |
|---------|-------|-------------|
| `dk secrets setup` | — | Initialize Doppler project structure for the current repo. Creates `dev`, `stg`, `prd` configs and generates `DopplerSecret` CRD manifests. |
| `dk secrets pull` | `--config <env>` | Pull secrets from Doppler config into a local `.env` file (git-ignored). Defaults to `dev`. |
| `dk secrets push <key> <value>` | `--config <env>` | Set a secret in the specified Doppler config. |
| `dk secrets list` | `--config <env>` | List secret keys (values masked) for the specified config. |

### 6.4 Observability

| Command | Flags | Description |
|---------|-------|-------------|
| `dk observe init` | — | Add the `@datakinetic/observability` package, generate `instrumentation.ts`, create dashboard and alert scaffolds in `monitoring/`. |
| `dk observe dashboard <service>` | `--output <path>` | Generate a Grafana dashboard JSON for a service with standard panels (request rate, error rate, latency, resource usage). |
| `dk observe alert <service>` | `--severity <level>` | Generate alert rule YAML with required labels (`team`, `service`, `product`, `severity`). |
| `dk observe validate` | `--strict` | Validate dashboard JSON and alert YAML against platform conventions. |

### 6.5 Standards & Compliance

| Command | Flags | Description |
|---------|-------|-------------|
| `dk check` | — | Run all applicable standards compliance checks locally. Validates manifests (Tier 1), observability (Tier 2), CI/CD (Tier 3), and code patterns (Tier 4). |
| `dk check` | `--tier <n>` | Run checks for a specific tier only. |
| `dk check` | `--fix` | Auto-fix issues where possible (add missing labels, resource limits, etc.). |
| `dk check` | `--json` | Output results as JSON for CI consumption. |

### 6.6 Labels & Governance

| Command | Flags | Description |
|---------|-------|-------------|
| `dk labels sync` | — | Validate GitHub labels in the current repo against the platform taxonomy (type/, priority/, status/, risk/, area/ prefixes). Dry-run mode by default; reports missing, extra, and misconfigured labels. |
| `dk labels sync` | `--apply` | Create/update labels to match the taxonomy. |
| `dk labels sync` | `--org` | Sync labels across all repos in the `data-kinetic` org. Requires Platform API token. |

### 6.7 LLM Management

Commands backed by the Platform API, which proxies to LiteLLM.

| Command | Flags | Description |
|---------|-------|-------------|
| `dk llm keys list` | `--json` | List all virtual keys with budgets, rate limits, and usage stats. |
| `dk llm keys create` | — | Create a virtual key. Interactive prompts for app name, budget, RPM, TPM, and allowed models. |
| `dk llm keys rotate <alias>` | — | Rotate a virtual key, returning the new key value. |
| `dk llm keys update <alias>` | `--budget <n>`, `--rpm <n>` | Update key config (budget, rate limits, model restrictions). |
| `dk llm budget` | `--json` | Show budget usage across all apps (spent, remaining, % used). |
| `dk llm models` | `--provider <name>` | List available models from all configured providers. |

### 6.8 Preview Environments

Commands backed by the Platform API, which orchestrates docker-compose on VM101.

| Command | Flags | Description |
|---------|-------|-------------|
| `dk preview up` | `--branch <name>` | Deploy preview from current repo/branch. Generates subdomain at `<branch>.preview.behaviorlabs.ai`. |
| `dk preview down <name>` | — | Tear down a preview and clean up resources. |
| `dk preview list` | `--json` | Show all active preview deployments with URLs and status. |
| `dk preview logs <name>` | `--follow`, `--tail <n>` | Stream logs from a preview's services. |

### 6.9 Self-Update & Maintenance

| Command | Flags | Description |
|---------|-------|-------------|
| `dk self-update` | `--check`, `--version <v>` | Update dk-cli to the latest version (or a specific version). `--check` shows available updates without installing. |
| `dk doctor` | `--fix` | Validate the local environment: check for required tools (Docker, Doppler, git, kubectl), verify config files, test API connectivity, and report issues. `--fix` attempts to resolve problems automatically. |
| `dk version` | — | Print the CLI version, build date, and platform. |

### 6.10 Skills & Hooks

| Command | Flags | Description |
|---------|-------|-------------|
| `dk skills list` | — | List available skills from the registry with install status and version. |
| `dk skills install <name>` | — | Download and install a skill to `~/.dk/skills/`. |
| `dk skills update [name]` | — | Update one or all installed skills to the latest registry version. |
| `dk skills remove <name>` | — | Remove an installed skill. |
| `dk hooks list` | — | List available hooks from the registry with install status. |
| `dk hooks install <name>` | — | Install a hook into the current repo's `.git/hooks/`. |
| `dk hooks update [name]` | — | Update one or all installed hooks. |
| `dk hooks remove <name>` | — | Remove a hook from the current repo. |

---

## 7. Template Integration

dk-cli is tightly integrated with [dk-template](https://github.com/data-kinetic/dk-template) — the GitHub template repository for scaffolding new product repos.

### `dk init` Flow

1. **Prompt** for product name, team, services (interactive via inquirer)
2. **Create repo** from dk-template via `gh repo create --template data-kinetic/dk-template`
3. **Clone** the new repo locally
4. **Run** `scripts/init.sh --product <name> --team <team> --service <svc1,svc2>`
   - Replaces all `{{placeholders}}` in 30+ template files
   - Creates per-service K8s manifests, dashboards, and alerts
   - Generates dk-alchemy PR bootstrap content
   - Self-deletes init.sh after completion
5. **Validate** scaffold via `scripts/validate-scaffold.sh`
6. **Commit** and push initial scaffold
7. **Print** next steps (Doppler setup, Slack channel, dk-alchemy PR, `dk onboard`)

### `dk onboard` Flow

Interactive walkthrough of the post-init checklist:
1. Verify scaffold complete (no `{{placeholders}}`)
2. Check Doppler project exists
3. Check CI/CD workflows are valid
4. Check observability templates (dashboards + alerts)
5. Verify docker-compose.preview.yaml works
6. Guide dk-alchemy PR submission
7. Track progress with checkmarks

### Template-CLI Synchronization

The dk-template repo contains a reference implementation of `dk init` at `src/commands/init.ts`. When dk-cli is built in dk-alchemy, this reference should be the source of truth:

| Component | Location | Purpose |
|-----------|----------|---------|
| init.ts reference | dk-template/src/commands/init.ts | Reference implementation |
| init.sh scaffold | dk-template/scripts/init.sh | Bash scaffold engine |
| validate-scaffold.sh | dk-template/scripts/validate-scaffold.sh | Post-init validation |
| dk init command | dk-alchemy/src/dk-cli/src/commands/init.ts | Production CLI command |

Changes to dk-template's scaffold structure should be reflected in dk-cli's init command.

---

## 8. Preview Stack Operations

dk-cli manages preview environments on VM101 (preview-stack) via the Platform API.

### Preview Lifecycle

```
Developer runs `dk preview up`
  → dk-cli reads repo/branch from git context
  → POST /dk/v1/previews (repo, branch, name, ttl)
  → Platform API SSHs to VM101 (192.168.10.51)
  → Clones repo to /opt/dk-previews/active/{name}/
  → Writes .preview-meta.json (metadata + TTL)
  → docker compose up -d
  → Configures NPM proxy host ({name}.preview.datakinetic.com)
  → Returns preview URL to developer
```

### Integration Points

| dk-cli Command | Platform API Endpoint | VM101 Action |
|---------------|----------------------|--------------|
| `dk preview up` | POST /dk/v1/previews | git clone + compose up + NPM config |
| `dk preview down <name>` | DELETE /dk/v1/previews/{name} | compose down + archive + NPM remove |
| `dk preview list` | GET /dk/v1/previews | Read .preview-meta.json files |
| `dk preview logs <name>` | GET /dk/v1/previews/{name}/logs | docker compose logs |
| `dk preview health` | GET /dk/v1/previews/health | System metrics (disk, load, memory) |

### Automatic Preview via Webhooks

When GitHub webhooks are configured:
- PR opened → auto-create preview → comment URL on PR
- PR updated (push) → rebuild preview
- PR closed/merged → auto-teardown preview

This is handled by the Platform API webhook router, not dk-cli directly.

### VM101 Automation (Server-Side)

| Component | Location on VM101 | Purpose |
|-----------|-------------------|---------|
| Cleanup script | /opt/dk-previews/scripts/cleanup.sh | Hourly TTL enforcement |
| Health server | /opt/dk-previews/scripts/health-server.py | Port 9100 health JSON |
| Cron: cleanup | /etc/cron.d/dk-preview-cleanup | Hourly + daily + weekly |
| Systemd | dk-preview-health.service | Health endpoint daemon |

---

## 9. Cross-Repo Operations

dk-cli operates across the Data Kinetic ecosystem:

### Repo Awareness

dk-cli auto-detects context from the current working directory:
- `.dk-standards.yaml` → product name, team, services, tier config
- `.git/config` → repo name, current branch
- `~/.dk/config.yaml` → API token, org, default settings

### dk-alchemy Integration

| Operation | What dk-cli Does | What dk-alchemy Provides |
|-----------|------------------|-------------------------|
| `dk init` | Scaffolds from dk-template | Kustomize components, shared workflows |
| `dk check` | Runs tier 1-4 checks | .dk-standards.yaml schema, check definitions |
| `dk preview` | Calls Platform API | Preview orchestration on VM101 |
| `dk llm` | Calls Platform API | LiteLLM proxy management |
| `dk labels` | Calls Platform API + GitHub | Label taxonomy, sync logic |
| `dk observe` | Generates monitoring config | Grafana dashboard/alert conventions |
| `dk secrets` | Manages Doppler | DopplerSecret CRD templates |

### Claude Code Skills

dk-template ships Claude Code skills (`.claude/commands/`) that mirror dk-cli functionality for teams using Claude Code directly:

| Skill | Maps to dk-cli Command |
|-------|----------------------|
| `/dk-preview` | `dk preview up/down/list/logs` |
| `/dk-api` | `dk llm keys/models/spend` + `dk labels` |
| `/dk-standards` | `dk check` |
| `/dk-onboard` | `dk onboard` |

These skills call the Platform API directly via curl, providing the same functionality without requiring dk-cli installation.

---

## 10. Platform API Integration

dk-cli communicates with the Platform API for operations that require server-side orchestration or access to shared infrastructure.

### Base URL Configuration

The API base URL is configured in `~/.dk/config.yaml` under `api_url`. Default: `https://dk.datakinetic.com`.

### Authentication

All API requests include an `Authorization: Bearer <token>` header. The token is read from:

1. `DK_API_TOKEN` environment variable (highest priority, used in CI)
2. `api_token` field in `~/.dk/config.yaml`

If no token is available, commands that require API access print an error with setup instructions.

### Endpoints Used

| dk Command | HTTP Method | Endpoint | Purpose |
|------------|-------------|----------|---------|
| `dk preview up` | `POST` | `/api/v1/previews` | Create a preview environment |
| `dk preview down` | `DELETE` | `/api/v1/previews/:name` | Tear down a preview |
| `dk preview list` | `GET` | `/api/v1/previews` | List active previews |
| `dk preview logs` | `GET` | `/api/v1/previews/:name/logs` | Stream preview logs (SSE) |
| `dk llm keys list` | `GET` | `/api/v1/llm/keys` | List virtual keys |
| `dk llm keys create` | `POST` | `/api/v1/llm/keys` | Create a virtual key |
| `dk llm keys rotate` | `POST` | `/api/v1/llm/keys/:alias/rotate` | Rotate a key |
| `dk llm keys update` | `PATCH` | `/api/v1/llm/keys/:alias` | Update key config |
| `dk llm budget` | `GET` | `/api/v1/llm/budget` | Get budget overview |
| `dk llm models` | `GET` | `/api/v1/llm/models` | List available models |
| `dk labels sync --org` | `GET` | `/api/v1/labels/taxonomy` | Fetch canonical label definitions |
| `dk self-update --check` | `GET` | GitHub Releases API | Check for new versions |

### Error Handling

- **401 Unauthorized:** Print "API token is invalid or expired. Run `dk doctor` to troubleshoot."
- **429 Rate Limited:** Retry with exponential backoff (max 3 attempts).
- **5xx Server Error:** Print error message and suggest checking Platform API status.
- **Network Error:** Print "Cannot reach the Platform API. Check your network connection and `api_url` in ~/.dk/config.yaml."

---

## 11. Configuration

### 8.1 Per-Repo Configuration: `.dk-standards.yaml`

Located in the repository root. Defines product identity, services, and compliance tier targets. This is the same file used by standards compliance CI checks.

```yaml
# .dk-standards.yaml
product: behavior-labs-ai
team: bla-engineering
tiers: [1, 2, 3]

services:
  - name: api
    port: 3000
    healthcheck: /health
  - name: worker
    port: 3001

doppler:
  project: bla-applications

preview:
  compose_file: docker-compose.preview.yaml
  subdomain_pattern: "{branch}.preview.behaviorlabs.ai"

observability:
  dashboards_dir: monitoring/dashboards
  alerts_dir: monitoring/alerts
  instrumentation: src/instrumentation.ts
```

### 8.2 Global Configuration: `~/.dk/config.yaml`

User-level configuration for credentials and defaults.

```yaml
# ~/.dk/config.yaml
api_url: https://dk.datakinetic.com
api_token: dk_pat_abc123...

doppler_token: dp.st.xxx          # Or use DOPPLER_TOKEN env var
github_org: data-kinetic
default_runner: standard

# Self-update preferences
auto_update_check: true            # Background version check on every invocation
update_channel: stable             # stable | preview

# Skills & hooks
skills_check_interval: 4h         # How often to check for registry updates
```

---

## 12. CI/CD Integration

dk-cli is designed to run in CI pipelines, particularly GitHub Actions.

### Setup Action

A reusable setup step installs dk-cli in the runner:

```yaml
# .github/workflows/ci.yaml
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dk-cli
        run: |
          curl -fsSL https://dk.datakinetic.com/install | sh
          echo "$HOME/.dk/bin" >> $GITHUB_PATH

      - name: Run standards checks
        run: dk check --json
        env:
          DK_API_TOKEN: ${{ secrets.DK_API_TOKEN }}
          DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}
```

### Standards Check in PRs

```yaml
# Run dk check on every pull request
- name: Standards compliance
  run: |
    dk check --json > results.json
    # Post results as PR comment via gh
```

### Label Sync (Scheduled)

```yaml
# .github/workflows/label-sync.yaml
on:
  schedule:
    - cron: '0 6 * * 1'  # Weekly on Monday at 6am UTC
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Install dk-cli
        run: curl -fsSL https://dk.datakinetic.com/install | sh && echo "$HOME/.dk/bin" >> $GITHUB_PATH
      - name: Sync labels
        run: dk labels sync --apply --org
        env:
          DK_API_TOKEN: ${{ secrets.DK_API_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### CI Behavior Differences

When running in CI (detected via `CI=true` or `GITHUB_ACTIONS=true` environment variables), dk-cli adjusts its behavior:

| Behavior | Interactive | CI |
|----------|------------|-----|
| Color output | Enabled | Disabled (unless `FORCE_COLOR=1`) |
| Spinners | Animated | Static progress messages |
| Prompts | Interactive (inquirer) | Fail with error if input required |
| Version check | Background notice | Suppressed |
| Output format | Human-readable | Prefer `--json` for machine parsing |

---

## 13. Implementation Phases

### Phase 1: Core Foundation (Weeks 1-2)

| Deliverable | Description |
|-------------|-------------|
| Project scaffold | Initialize `src/dk-cli/` with package.json, tsconfig.json, bunfig.toml |
| CLI framework | Set up commander with top-level help, version flag, and command routing |
| Build pipeline | GitHub Actions workflow for `bun build --compile` across 4 targets |
| Release automation | Tag-based release workflow that uploads binaries and checksums |
| Install script | `install.sh` hosted at dk.datakinetic.com, OS/arch detection, checksum verification |
| `dk self-update` | Version check, download, checksum verify, atomic replace |
| `dk doctor` | Check for Docker, Doppler CLI, git, kubectl; verify config files; test API connectivity |
| `dk version` | Print version, build date, platform |
| Config loading | Parse `~/.dk/config.yaml` and `.dk-standards.yaml` |

### Phase 2: Core Commands (Weeks 3-4)

| Deliverable | Description |
|-------------|-------------|
| `dk init` | Scaffold from dk-template (port reference implementation from dk-template/src/commands/init.ts) with interactive prompts, generate .gitops/, k8s/, monitoring/, CI |
| `dk up` / `dk down` | Docker-compose lifecycle with Doppler secret injection |
| `dk logs` / `dk status` | Log streaming and service status display |
| `dk secrets *` | Full Doppler integration (setup, pull, push, list) |
| `dk check` | Standards compliance checks for Tiers 1-4 with --fix and --json |

### Phase 3: Platform API Commands (Weeks 5-6)

| Deliverable | Description |
|-------------|-------------|
| API client library | HTTP client with auth, retries, error handling |
| `dk preview *` | Preview environment lifecycle (up, down, list, logs) |
| `dk llm *` | LLM key management, budget, and model listing |
| `dk labels sync` | Label taxonomy enforcement (local, repo, org-wide) |
| `dk observe *` | Observability scaffolding (init, dashboard, alert, validate) |

### Phase 4: Skills & Hooks (Week 7)

| Deliverable | Description |
|-------------|-------------|
| Registry structure | Set up `packages/dk-skills/` with manifest.json schema |
| `dk skills *` | List, install, update, remove skills |
| `dk hooks *` | List, install, update, remove hooks |
| Background version check | Non-blocking registry check on every invocation |
| Initial skills | Ship 2-3 built-in skills (e.g., compliance-check, db-migrate) |
| Initial hooks | Ship pre-commit and commit-msg hooks |

### Phase 5: Onboarding & Polish (Week 8)

| Deliverable | Description |
|-------------|-------------|
| `dk onboard` | Interactive onboarding checklist (mirrors dk-template/.claude/commands/dk-onboard.md) |
| Sync Claude Code skills | Ensure .claude/commands/ in dk-template match dk-cli functionality |
| Shell completions | Bash, Zsh, and Fish completion scripts via `dk completions <shell>` |
| Error messages | Consistent, actionable error messages across all commands |
| Documentation | README, inline help text, man-page-style `dk help <command>` |
| Integration tests | End-to-end tests for critical paths (init, check, preview) |

---

## 14. Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| [commander](https://github.com/tj/commander.js) | ^12.x | CLI framework — command parsing, flags, help generation |
| [@octokit/rest](https://github.com/octokit/rest.js) | ^21.x | GitHub API — labels, repos, releases, PRs |
| [chalk](https://github.com/chalk/chalk) | ^5.x | Terminal color output |
| [ora](https://github.com/sindresorhus/ora) | ^8.x | Terminal spinners for long-running operations |
| [inquirer](https://github.com/SBoudrias/Inquirer.js) | ^9.x | Interactive prompts (init, onboard, llm keys create) |
| [js-yaml](https://github.com/nodeca/js-yaml) | ^4.x | YAML parsing for config and manifest files |
| [execa](https://github.com/sindresorhus/execa) | ^9.x | Shell command execution (docker-compose, kubectl, doppler) |
| [semver](https://github.com/npm/node-semver) | ^7.x | Version comparison for self-update and skills |
| [undici](https://github.com/nodejs/undici) | built-in | HTTP client (Bun built-in, used via fetch) |

**Dev dependencies:**

| Package | Purpose |
|---------|---------|
| `bun-types` | Bun runtime type definitions |
| `@types/inquirer` | TypeScript types for inquirer |
| `vitest` | Test runner |

---

## 15. Success Criteria

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| **Cross-platform install** | Works on all 4 targets (linux-x64, linux-arm64, darwin-x64, darwin-arm64) | Automated install test in CI on each platform |
| **Binary size** | < 50 MB per platform | CI build step reports size; alert if exceeded |
| **Cold start time** | < 500 ms for `dk --version` | Benchmark in CI; p95 latency |
| **Self-update reliability** | Atomic update with rollback on checksum failure | Integration test covering update + corrupt download |
| **dk init time** | Scaffold a complete repo in < 30 seconds | End-to-end test |
| **dk check performance** | Complete Tier 1-4 checks in < 10 seconds for a typical repo | Benchmark against behavior-labs-ai |
| **CI compatibility** | Works in GitHub Actions ubuntu-latest without extra setup beyond install | CI workflow test |
| **Test coverage** | > 80% line coverage for `lib/` modules | Vitest coverage report |
| **Command documentation** | Every command has `--help` with examples | Automated check that all commands produce help output |
| **Error quality** | Every error message includes a suggested fix or next step | Manual review checklist |

---

## 16. Open Questions

| # | Question | Context | Status |
|---|----------|---------|--------|
| 1 | **Claude Code plugin integration** | Should dk-cli ship a Claude Code skill or MCP integration so that Claude Code can invoke dk commands directly? What would the interface look like? | Open |
| 2 | **npm dual-publish** | Should we also publish `@datakinetic/cli` to npm for `npx dk` usage, in addition to the standalone binary? Adds maintenance burden but improves discoverability. | Open |
| 3 | **Windows support** | Bun supports `bun-windows-x64` as a compile target. Do we have Windows users? If so, what is the install story (no curl\|sh, need PowerShell script or winget)? | Open — no known Windows users currently |
| 4 | **Offline mode** | Should dk-cli work fully offline (cached skills, no version check)? Or is network access assumed? | Leaning toward graceful degradation |
| 5 | **Plugin sandboxing** | Skills execute arbitrary TypeScript. Should there be a permission model or sandbox? | Open — low priority for internal use |
| 6 | **Telemetry** | Should dk-cli collect anonymous usage metrics (command frequency, errors) to inform prioritization? | Open — needs privacy review |

---

## 17. Related Documentation

| Document | Path | Relevance |
|----------|------|-----------|
| dk-cli Spec | [docs/dk-cli.md](../../docs/dk-cli.md) | Existing command spec — this PRD supersedes and extends it |
| Platform API Spec | [docs/platform-api.md](../../docs/platform-api.md) | Server-side API that dk-cli calls for preview, LLM, and label operations |
| Preview Environments | [docs/preview-environments.md](../../docs/preview-environments.md) | Preview stack architecture that `dk preview` commands orchestrate |
| Platform API Plan | [plans/dk-alchemy/01-platform-api.md](01-platform-api.md) | Implementation plan for the API dk-cli depends on |
| Preview Standardization Plan | [plans/dk-alchemy/08-preview-standardization.md](08-preview-standardization.md) | Plan for preview environment improvements |
| Standards Compliance | [docs/standards-compliance.md](../../docs/standards-compliance.md) | Tier definitions that `dk check` validates |
| Onboarding | [docs/onboarding.md](../../docs/onboarding.md) | Checklist that `dk onboard` walks through |
| Template Repository | [docs/template-repo.md](../../docs/template-repo.md) | Template that `dk init` scaffolds from |
| Secrets Management | [docs/secrets-management.md](../../docs/secrets-management.md) | Doppler integration details for `dk secrets` |
| Issue Governance | [docs/issue-governance.md](../../docs/issue-governance.md) | Label taxonomy enforced by `dk labels sync` |
| Master Implementation Plan | [01-implementation-plan-baseline.md](../../01-implementation-plan-baseline.md) | dk-cli is a Phase 3 deliverable (Weeks 13-16) |
