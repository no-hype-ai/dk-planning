# Preview Stack Requirements

> Source of truth for how preview environments work across the Data Kinetic platform.
> Covers the full lifecycle: developer workflow, API orchestration, VM101 hosting,
> networking, Docker Compose conventions, promotion pipeline, and dk-template alignment.

**Last updated:** 2026-03-25
**Status:** Draft — pending end-to-end validation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Developer Workflow](#3-developer-workflow)
4. [Application Flow — Preview Deployment](#4-application-flow--preview-deployment)
5. [Docker Compose Preview Convention](#5-docker-compose-preview-convention)
6. [Networking](#6-networking)
7. [Platform API Orchestration](#7-platform-api-orchestration)
8. [dk-cli Commands](#8-dk-cli-commands)
9. [PR Automation](#9-pr-automation)
10. [Promotion Lifecycle](#10-promotion-lifecycle)
11. [dk-template Alignment](#11-dk-template-alignment)
12. [VM101 Ground Truth & Project Inventory](#12-vm101-ground-truth--project-inventory)
13. [Project Migration Runbook](#13-project-migration-runbook)
14. [dk-cli & dk-template Adoption Workflow](#14-dk-cli--dk-template-adoption-workflow)
15. [Workstation & Execution Guide](#15-workstation--execution-guide)
16. [Secrets Management](#16-secrets-management)
17. [Monitoring & Cleanup](#17-monitoring--cleanup)
18. [Validation & Testing Plan](#18-validation--testing-plan)
19. [Implementation Status](#19-implementation-status)
20. [Open Decisions](#20-open-decisions)

---

## 1. Overview

Preview environments give developers a live, URL-accessible deployment of any branch before it reaches staging or production. Previews are:

- **Docker Compose-based** — each preview is a self-contained compose project on VM101
- **Self-contained** — each preview includes its own databases, caches, and supporting services (no shared infrastructure)
- **API-managed** — the Platform API handles all orchestration; VM101 is just a host
- **Ephemeral** — default 72h TTL, auto-cleanup on expiry or PR close
- **Promotable** — previews feed the staging → production pipeline

### What Preview Is NOT

- Preview does **not** use Kubernetes. K8s enters at the staging tier.
- Preview does **not** share databases, Redis, or other stateful services across projects.
- Preview does **not** require manual SSH access to VM101 for deployment or teardown.

---

## 2. Architecture

### System Components

```
Developer workstation          Platform API (K3s)              VM101 (preview-stack)
┌─────────────┐               ┌──────────────────┐           ┌──────────────────────┐
│  dk-cli     │──POST /dk/v1──▶  Platform API    │──SSH──────▶  Ubuntu 22.04        │
│  (or PR     │  /previews    │  (dk-alchemy)    │           │  Docker 29.2.1       │
│   webhook)  │               │                  │           │  Doppler CLI         │
└─────────────┘               │  Responsibilities:│           │  NPM (reverse proxy) │
                              │  - Clone repo     │           │                      │
                              │  - Doppler inject  │           │  /opt/dk-previews/   │
                              │  - Compose up      │           │    active/           │
                              │  - NPM proxy reg   │           │    archive/          │
                              │  - Metadata track   │           │                      │
                              │  - TTL enforce      │           │  /opt/dk-production/ │
                              └──────────────────┘           └──────────────────────┘
```

### Network Path (External Access)

```
Browser → DNS (*.preview.datakinetic.com / *.preview.behaviorlabs.ai)
  → UDM WAN DNAT → 172.16.100.100:443 (Keepalived VIP)
  → Traefik edge LB (phantom/venom, TLS termination)
  → 10.0.0.51:80 (NPM on VM101, plain HTTP)
  → Docker container (host-based routing by NPM)
```

### VM101 Specs

| Property | Value |
|----------|-------|
| VM | vm101-preview-stack (penguin, VMID 101) |
| Cluster IP | 10.0.0.51 (vmbr1, isolated) |
| DMZ IP | 172.16.100.51 (vmbr2, edge routing) |
| Resources | 16 vCPU, 64 GiB RAM, 485 GB disk |
| Firewall | UFW active, deny-by-default |
| Max concurrent previews | 15 |

---

## 3. Developer Workflow

### Manual Preview (dk-cli)

```bash
# From any product repo with a docker-compose.preview.yaml
cd ~/Code/my-product

# Deploy current branch as a preview
dk preview up
# → Preview deployed: https://my-product-feature-branch.preview.datakinetic.com

# Check all active previews
dk preview list

# Stream logs
dk preview logs my-product-feature-branch --service api --tail 100

# Extend TTL
dk preview extend my-product-feature-branch --ttl 168

# Tear down
dk preview down my-product-feature-branch
```

### Automatic Preview (PR Webhook)

```
1. Developer opens PR on a repo with dk-preview GitHub topic
2. GitHub sends webhook to Platform API
3. Platform API deploys preview, posts PR comment with URL
4. Developer pushes updates → webhook redeploys preview
5. PR merged/closed → webhook tears down preview
```

### Promotion Flow

```bash
# After preview is validated, promote to staging
dk promote staging
# → Creates approval issue, waits for status/approved label

# After staging soak period, promote to production
dk promote production
# → Creates approval issue, requires cross-approval (not self-approve)

# Check promotion state across all stages
dk promote status
```

---

## 4. Application Flow — Preview Deployment

This is the end-to-end flow when a preview is created, whether via `dk preview up` or a PR webhook.

### Step 1: Request Received

```
dk-cli OR GitHub webhook
  → POST /dk/v1/previews
  → Body: { repo, branch, name?, ttl_hours?, doppler_project?, doppler_config?, domain? }
```

### Step 2: Pre-flight Checks

The Platform API performs:
1. Sanitize preview name (DNS-safe, max 63 chars)
2. Check if name already exists → 409 if so
3. Check active preview count → 429 if >= 15

### Step 3: Clone & Validate

```
SSH to VM101 →
  git clone --depth 1 -b <branch> https://github.com/<org>/<repo>.git /opt/dk-previews/active/<name>/
  → Verify docker-compose.preview.yaml exists (400 if missing)
  → Read doppler.yaml for project/config defaults (fallback to repo name + "dev")
```

### Step 4: Write Metadata

```json
// /opt/dk-previews/active/<name>/.preview-meta.json
{
  "name": "my-product-feature-branch",
  "repo": "data-kinetic/my-product",
  "branch": "feature-branch",
  "status": "starting",
  "ttl_hours": 72,
  "doppler_project": "my-product-applications",
  "doppler_config": "dev",
  "domain": "preview.datakinetic.com",
  "created_at": "2026-03-25T14:00:00Z",
  "url": "https://my-product-feature-branch.preview.datakinetic.com"
}
```

### Step 5: Start Services

```bash
cd /opt/dk-previews/active/<name>/
doppler run --project <project> --config <config> -- \
  docker compose -f docker-compose.preview.yaml up -d
```

Each preview starts its **own** Postgres, Redis, and any other dependencies. No shared infrastructure.

### Step 6: Register Proxy

Platform API authenticates with NPM on VM101, then:

```
POST http://localhost:81/api/nginx/proxy-hosts
{
  "domain_names": ["<name>.preview.datakinetic.com"],
  "forward_scheme": "http",
  "forward_host": "127.0.0.1",
  "forward_port": <app-port>,
  "allow_websocket_upgrade": true,
  "block_exploits": true
}
```

NPM handles host-based routing to the correct container. The web service exposes its port on the Docker host (not behind an internal-only network).

### Step 7: Return URL

```json
{
  "name": "my-product-feature-branch",
  "url": "https://my-product-feature-branch.preview.datakinetic.com",
  "status": "running",
  "ttl_hours": 72,
  "containers": 4
}
```

### Teardown Flow

```
DELETE /dk/v1/previews/<name>
  → NPM proxy host removed
  → docker compose -f docker-compose.preview.yaml down --volumes --remove-orphans
  → Directory moved to /opt/dk-previews/archive/<name>/
  → Archive retained 7 days, then pruned by cron
```

---

## 5. Docker Compose Preview Convention

Every product repo that supports previews **must** have a `docker-compose.preview.yaml` at the repo root.

### Requirements

1. **Use pre-built images** from GHCR (not `build:` context)
2. **Self-contained** — include own Postgres, Redis, and any other deps
3. **Expose web port on host** — the primary web service must publish its port so NPM can route to it
4. **Health checks** on all services
5. **Restart policy** — `unless-stopped` on all services
6. **No hardcoded secrets** — all secrets come from Doppler injection via environment variables

### Template

```yaml
services:
  app:
    image: ghcr.io/data-kinetic/${REPO_NAME}/app:${IMAGE_TAG:-latest}
    ports:
      - "${APP_PORT:-3000}:3000"
    environment:
      - NODE_ENV=preview
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/${PRODUCT}_preview
      - REDIS_URL=redis://redis:6379
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${PRODUCT}_preview
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Pre-built images (not `build:`) | Preview deploys should be fast. Images are built by CI/CD and pushed to GHCR on every push. |
| Self-contained infra | Previews must not interfere with each other. Shared databases create coupling and cleanup nightmares. |
| Host-published web port | NPM routes to `127.0.0.1:<port>` — the web service must be reachable on the Docker host. |
| No `proxy_net` in compose file | The Platform API handles proxy wiring. The compose file just exposes the port. VM101 networking is an infrastructure concern, not a repo concern. |

---

## 6. Networking

### Recommendation: Deprecate `proxy_net` in Compose Files

**Current state:** Some projects on VM101 use a shared `proxy_net` Docker bridge network. The web service joins both `proxy_net` (for NPM routing) and an internal project network (for database access).

**Problem:** This leaks infrastructure concerns into product repos and creates tight coupling between compose files and the VM101 host configuration.

**Recommended approach:** Product repos should not reference `proxy_net`. Instead:

1. The web service publishes its port on the Docker host (e.g., `ports: ["3000:3000"]`)
2. The Platform API registers an NPM proxy host pointing to `127.0.0.1:<port>`
3. Internal services (databases, caches) use the default Compose project network — no explicit network config needed
4. The Platform API is responsible for port allocation to avoid collisions

### Port Allocation Strategy

The Platform API should manage port assignment to prevent collisions when multiple previews run simultaneously:

- Maintain a port registry in `.preview-meta.json` (field: `host_port`)
- Allocate from range `10000-10999` (1000 ports for up to 15 concurrent previews)
- On teardown, release the port
- NPM proxy points to the allocated port

**Impact on docker-compose.preview.yaml:**

```yaml
services:
  app:
    ports:
      - "${APP_PORT:-3000}:3000"  # APP_PORT set by Platform API
```

The Platform API sets `APP_PORT` via environment before running `docker compose up`.

### DNS & TLS

| Domain | IngressRoute | TLS |
|--------|-------------|-----|
| `*.preview.datakinetic.com` | `k8s/edge/routes/base/datakinetic-preview.yaml` | Let's Encrypt wildcard |
| `*.preview.behaviorlabs.ai` | `k8s/edge/routes/base/preview-stack.yaml` | Let's Encrypt wildcard |

Both resolve via DDNS to the Keepalived VIP (192.168.1.100). Traefik terminates TLS and forwards plain HTTP to NPM on VM101.

### Firewall Rules (VM101)

Only these ports are externally accessible:

| Port | Service | Access |
|------|---------|--------|
| 22 | SSH | Cluster network |
| 80 | NPM HTTP | Edge LBs only |
| 443 | NPM HTTPS | Edge LBs only |
| 81 | NPM Admin | Management network only |
| 9100 | Health endpoint | Monitoring network only |

All database/cache ports bound to `127.0.0.1`. Application ports bound to `127.0.0.1` (NPM routes internally).

---

## 7. Platform API Orchestration

The Platform API (dk-alchemy) is the single orchestrator. VM101 is a dumb host — it runs Docker and NPM, nothing else.

### Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/dk/v1/previews` | Create preview (clone, compose up, register proxy) |
| `GET` | `/dk/v1/previews` | List all active previews with metadata |
| `GET` | `/dk/v1/previews/health` | VM101 health metrics (disk, memory, load, container count) |
| `GET` | `/dk/v1/previews/{name}` | Get preview details + container status |
| `DELETE` | `/dk/v1/previews/{name}` | Teardown (compose down, remove proxy, archive) |
| `PATCH` | `/dk/v1/previews/{name}` | Extend TTL |
| `GET` | `/dk/v1/previews/{name}/logs` | Stream/fetch logs from preview services |
| `POST` | `/dk/v1/webhooks/github` | Receive PR events, auto-create/destroy previews |
| `GET` | `/dk/v1/webhooks/status` | Webhook configuration health check |

### API Responsibilities (VM101 Does NOT Do These)

- Git clone and branch checkout
- Doppler secrets resolution and injection
- Docker Compose lifecycle management
- NPM proxy host registration and removal
- Port allocation and collision avoidance
- Metadata tracking (`.preview-meta.json`)
- TTL enforcement and cleanup
- PR comment posting
- Health monitoring

### Configuration (Doppler: `dk-infrastructure/prd`)

| Setting | Env Var | Purpose |
|---------|---------|---------|
| SSH key content | `DK_PREVIEW_SSH_KEY` | asyncssh private key for VM101 access |
| NPM admin email | `DK_NPM_ADMIN_EMAIL` | NPM API authentication |
| NPM admin password | `DK_NPM_ADMIN_PASSWORD` | NPM API authentication |
| GitHub webhook secret | `DK_GITHUB_WEBHOOK_SECRET` | HMAC-SHA256 signature validation |
| GitHub PAT | `DK_GITHUB_PAT` | PR comment posting |

---

## 8. dk-cli Commands

### Preview Management

| Command | Purpose | API Call |
|---------|---------|---------|
| `dk preview up` | Deploy preview from current branch | `POST /dk/v1/previews` |
| `dk preview down <name>` | Tear down preview | `DELETE /dk/v1/previews/{name}` |
| `dk preview list` | List active previews | `GET /dk/v1/previews` |
| `dk preview logs <name>` | Fetch/stream logs | `GET /dk/v1/previews/{name}/logs` |

### Options for `dk preview up`

| Flag | Default | Description |
|------|---------|-------------|
| `--repo <org/repo>` | Auto-detect from git remote | GitHub repository |
| `--branch <branch>` | Current branch | Branch to deploy |
| `--name <name>` | `{repo}-{branch}` | Preview name (DNS-safe) |
| `--ttl <hours>` | 72 | Time-to-live |
| `--domain <domain>` | `preview.datakinetic.com` | Preview domain suffix |
| `--doppler-config <config>` | `dev` | Doppler config environment |
| `--doppler-project <project>` | From `doppler.yaml` or repo name | Doppler project |

### Promotion Commands

| Command | Purpose | Role Required |
|---------|---------|--------------|
| `dk promote preview` | Deploy branch to preview | `developer` |
| `dk promote staging` | Request staging promotion (creates approval issue) | `developer` |
| `dk promote production` | Request production promotion (requires cross-approval) | `admin` |
| `dk promote status` | Show deployment state across all stages | Any |
| `dk promote rollback <stage>` | Rollback staging or production | `admin` |

---

## 9. PR Automation

### Prerequisites

1. Repository must have the `dk-preview` GitHub topic
2. GitHub webhook registered pointing to `https://dk.datakinetic.com/dk/v1/webhooks/github`
3. `DK_GITHUB_WEBHOOK_SECRET` configured in Doppler
4. `DK_GITHUB_PAT` configured for PR comment posting

### Webhook Events

| Event | Action | Result |
|-------|--------|--------|
| `pull_request.opened` | Create preview | PR comment with URL, TTL, container count |
| `pull_request.synchronize` | Delete + recreate preview | Updated PR comment |
| `pull_request.closed` | Delete preview | PR comment confirming teardown |
| `issues.labeled` (`status/approved`) | Trigger staging/production deploy | Promotion gate passes |
| `issues.labeled` (`status/rejected`) | Cancel promotion | Logged, issue updated |

### PR Comment Format

```markdown
**Preview deployed:** https://pr-42-my-product.preview.datakinetic.com

- TTL: 72h
- Containers: 4
- Tear down: `dk preview down pr-42-my-product`

_Auto-removed when PR is closed._
```

### Setting Up a Repo for PR Previews

```bash
# Add the dk-preview topic to the repo
gh repo edit data-kinetic/my-product --add-topic dk-preview

# Register the webhook
gh api repos/data-kinetic/my-product/hooks -f \
  name=web \
  -f config[url]=https://dk.datakinetic.com/dk/v1/webhooks/github \
  -f config[content_type]=json \
  -f config[secret]="<DK_GITHUB_WEBHOOK_SECRET>" \
  -f events[]=pull_request \
  -f events[]=issues \
  -f active=true
```

---

## 10. Promotion Lifecycle

Preview is the first stage of a three-stage deployment pipeline.

### Stages

```
Preview (Docker Compose / VM101)
  │  Self-contained, branch-based, ephemeral
  │  Own databases, own caches, own networking
  │  Accessible at *.preview.{domain}
  │
  ▼
Staging (Kubernetes / K3s cluster)
  │  Shared cluster infrastructure (centralized Postgres, Redis, observability)
  │  ArgoCD-managed, deployed from staging branch
  │  Approval gate: status/approved label on deployment issue
  │  Minimum soak period (configurable, default 4h)
  │
  ▼
Production (Kubernetes / K3s cluster)
  │  Shared cluster infrastructure
  │  ArgoCD-managed, deployed from main branch
  │  Cross-approval required (requester cannot self-approve)
  │  Rollback available via dk promote rollback production
```

### Infrastructure Differences by Stage

| Concern | Preview | Staging | Production |
|---------|---------|---------|------------|
| **Runtime** | Docker Compose | Kubernetes | Kubernetes |
| **Host** | VM101 | K3s cluster | K3s cluster |
| **Database** | Per-preview Postgres container | Shared cluster Postgres | Shared cluster Postgres |
| **Cache** | Per-preview Redis container | Shared cluster Redis | Shared cluster Redis |
| **Secrets** | Doppler `dev` config | Doppler `stg` config | Doppler `prd` config |
| **Ingress** | NPM → Docker port | Traefik IngressRoute | Traefik IngressRoute |
| **Lifecycle** | Ephemeral (TTL) | Branch-tracked | Tag-tracked |
| **Deployment** | Platform API SSH | ArgoCD sync | ArgoCD sync |
| **Observability** | Basic health checks | Full LGTM stack | Full LGTM stack |
| **Scaling** | Single instance | HPA (min 1) | HPA (min 2) |

### Promotion Flow Detail

#### Preview → Staging

```
dk promote staging
  → Platform API checks preview exists (or --skip-preview to bypass)
  → Reads .dk-standards.yaml for staging approvers list
  → Creates GitHub issue:
      Title: "Promote my-product abc1234 → staging"
      Labels: type/deployment, stage/staging
      Assignees: staging approvers from .dk-standards.yaml
  → Returns issue URL
  → Waits for status/approved label
  → On approval: updates staging kustomize overlay, triggers ArgoCD sync
```

#### Staging → Production

```
dk promote production
  → Requires admin role
  → Checks staging soak period elapsed (min_staging_soak_hours from .dk-standards.yaml)
  → Creates GitHub issue:
      Title: "Promote my-product abc1234 → production"
      Labels: type/deployment, stage/production
      Assignees: production approvers from .dk-standards.yaml
  → Cross-approval enforced: sender (webhook) must differ from issue creator
  → On approval: updates production kustomize overlay, triggers ArgoCD sync
```

#### Rollback

```
dk promote rollback staging|production
  → Requires admin role
  → Reverts kustomize overlay to previous image tag
  → Creates tracking issue
  → Triggers ArgoCD sync
```

---

## 11. dk-template Alignment

The `dk-template` repository scaffolds new product repos. The following files are relevant to the preview system.

### Files Generated by dk-template

| File | Purpose | Preview Relevance |
|------|---------|-------------------|
| `docker-compose.preview.yaml` | VM101 preview deployment | **Primary** — this is what the Platform API runs |
| `.gitops/local/apps/docker-compose.yaml` | Local development (with `build:`) | Not used by preview system |
| `.gitops/local/apps/.env.example` | Local env vars template | Reference for preview env vars |
| `scripts/doppler/setup-doppler-dev.sh` | Local Doppler setup | Not used by preview (API injects via `doppler run`) |
| `.dk-standards.yaml` | Product metadata + approver lists | Used by `dk promote` for approval gates |
| `doppler.yaml` | Doppler project/config defaults | Read by Platform API to resolve secrets |

### Required Template Updates

1. **`docker-compose.preview.yaml`** — Remove any `proxy_net` references. Use `${APP_PORT:-3000}` for the host port mapping to support Platform API port allocation.

2. **`doppler.yaml`** — Ensure template generates this file with the correct project name pattern (`{{product}}-applications`).

3. **GitHub topic** — The `init.sh` script should add the `dk-preview` topic to new repos:
   ```bash
   gh repo edit "data-kinetic/${REPO_NAME}" --add-topic dk-preview
   ```

4. **Webhook registration** — The `init.sh` script or a post-init step should register the GitHub webhook for PR previews.

### Alignment Checklist

- [ ] `docker-compose.preview.yaml` uses GHCR images (not `build:`)
- [ ] `docker-compose.preview.yaml` includes self-contained Postgres + Redis
- [ ] `docker-compose.preview.yaml` has health checks on all services
- [ ] `docker-compose.preview.yaml` uses `restart: unless-stopped`
- [ ] `docker-compose.preview.yaml` exposes web port via `${APP_PORT:-3000}`
- [ ] `docker-compose.preview.yaml` does NOT reference `proxy_net` or external networks
- [ ] `doppler.yaml` exists with correct project/config
- [ ] `.dk-standards.yaml` includes staging/production approver lists
- [ ] Repo has `dk-preview` GitHub topic
- [ ] GitHub webhook registered for `pull_request` and `issues` events

---

## 12. VM101 Ground Truth & Project Inventory

> Captured via SSH on 2026-03-25. 55 containers running across 14 compose projects + NPM.
> VM101 resources: 20% disk (97 GB / 485 GB), 12% memory (7.6 GiB / 62 GiB), load 2.55.

### Directory Layout

```
/opt/dk-previews/
├── active/              ← 12 preview projects (all running)
├── archive/             ← 1 archived project (carbon-5-decommissioned-20260324)
├── staging/             ← Empty (unused)
├── scripts/cleanup.sh   ← TTL enforcement
└── logs/                ← Cron output

/opt/dk-production/
├── Platform-Core/       ← Enercore (15 containers)
└── abts-surgeo/         ← ABTS Surgeo (8 containers)

/home/ubuntu/code/       ← LEGACY location (symlinks + stale real dirs)
├── <symlinks to /opt/>  ← Most projects symlinked correctly
├── ghost-cal/           ← STALE real dir (project runs from /opt/)
├── ground-truth-alpha/  ← STALE (not running)
├── insights/            ← STALE (not running)
├── dk-alchemy/          ← Old clone (legacy)
├── nginx-proxy-manager/ ← NPM config repo (still in use)
├── BehaviorLabs-Logo-Exports/ ← Static assets
├── scripts/             ← Legacy scripts
└── carbon-5 → (broken symlink to /opt/dk-production/carbon-5)

/home/nick/code/
└── ut-san-antonio-oncology/  ← STALE (migrated to /opt/, still here)

/home/ubuntu/
├── actions-runner/                    ← 10 self-hosted GitHub Actions runners
├── actions-runner-apex/
├── actions-runner-carbon5/
├── actions-runner-cms121/
├── actions-runner-durva/
├── actions-runner-ghost-cal/
├── actions-runner-groundtruth-signals/
├── actions-runner-rnb/
├── actions-runner-stryker/
└── actions-runner-tavr/
```

### Complete Project Inventory (from `docker ps`)

#### Production Apps (`/opt/dk-production/`)

| Project | Containers | Git Remote | Org | Running Compose File | Issues |
|---------|-----------|------------|-----|---------------------|--------|
| Platform-Core (enercore) | 15 | `Enercore-AI/Platform-Core` | Enercore-AI | `docker-compose.yml` | SeaweedFS, Grafana, Loki, Tempo, Unleash, Alloy ports on `0.0.0.0`. No `docker-compose.preview.yaml`. |
| abts-surgeo | 8 | `ATARI-Foundation/abts-surgeo` | ATARI-Foundation | `docker-compose.prod.yml` | MinIO ports on `127.0.0.1` (fixed). No `docker-compose.preview.yaml`. |

#### Preview Apps (`/opt/dk-previews/active/`)

| # | Project | Containers | Git Remote | Org | Branch | Has `preview.yaml`? | Compose In Use | Network | Health Issues |
|---|---------|-----------|------------|-----|--------|---------------------|----------------|---------|---------------|
| 1 | ground-truth-charlie | 6 | `data-kinetic-projects/ground-truth-charlie` | data-kinetic-projects | main | **Hyphenated** (`docker-compose-preview.yaml`) | `docker-compose.prod.yml` | `gtc-network` (custom) | app + minio healthchecks missing |
| 2 | dayone-rili-synthetics | 5 | `data-kinetic-projects/dayone-rili-synthetics` | data-kinetic-projects | main | No | `docker-compose.prod.yml` | `rili-network` + `internal` (custom) | worker healthcheck missing |
| 3 | ghost-cal | 4 | `data-kinetic-projects/ghost-cal` | data-kinetic-projects | `fix/add-database-migrations` | No | `docker-compose.prod.yml` | `ghost-cal-network` (custom) | worker healthcheck missing. **Running from non-main branch.** |
| 4 | rose-and-berg (sniper) | 4 | `no-hype-ai/rose-and-berg` | no-hype-ai | main | No | `docker-compose.dev.yml` | `sniper-network` + `internal` (custom) | app + api healthchecks missing |
| 5 | the-real-apex | 3 | `no-hype-ai/the-real-apex` | no-hype-ai | main | No | `docker-compose.yml` | `default` (auto) | worker healthcheck missing |
| 6 | surgeo | 2 | `ATARI-Foundation/surgeo` | ATARI-Foundation | main | No | `docker-compose.yml` | `default` (auto) | **Git remote contains leaked access token.** Doppler integrated. |
| 7 | tavr-insight-and-profiler | 2 | `data-kinetic-projects/tavr-insight-and-profiler` | data-kinetic-projects | main | No | `docker-compose.yml` | `meadow-network` (custom) | app healthcheck missing |
| 8 | va | 2 | `no-hype-ai/VA` | no-hype-ai | `001-va-disability-calculator` | No | `docker-compose.yml` | `va_internal` (custom) | **Running from non-main branch.** |
| 9 | cms-121 | 1 | `data-kinetic-projects/cms-121` | data-kinetic-projects | main | No | `docker-compose.yml` | `default` (auto) | Container named `origincv-app` (mismatch) |
| 10 | durva | 1 | `data-kinetic-projects/durva` | data-kinetic-projects | main | No | `docker-compose.yml` | `default` (auto) | No healthcheck |
| 11 | stryker-intro | 1 | `data-kinetic-projects/stryker-portfolio-dashboard` | data-kinetic-projects | main | No | `docker-compose.yml` | `default` (auto) | No healthcheck |
| 12 | ut-san-antonio-oncology | 1 | `data-kinetic-projects/ut-san-antonio-oncology` | data-kinetic-projects | main | No | `docker-compose.yml` | `default` (auto) | No healthcheck. Stale copy at `/home/nick/code/`. |

#### Infrastructure

| Project | Container | Status | Location |
|---------|-----------|--------|----------|
| NPM | `npm` | Up 39h, healthy | `/home/ubuntu/code/nginx-proxy-manager/` |

### Docker Networks (20 custom + 3 system)

```
abts-surgeo_abts-network            abts-surgeo_internal
carbon-network                      ← STALE (carbon-5 decommissioned)
dayone-rili-synthetics_internal     dayone-rili-synthetics_rili-network
ghost-cal_ghost-cal-network
ground-truth-charlie_default        ground-truth-charlie_gtc-network
platform-core_enercore-network
proxy                               ← STALE (legacy)
proxy_net                           ← Shared NPM bridge (to be deprecated)
rose-and-berg_internal              rose-and-berg_sniper-network
surgeo_default
tavr-insight-and-profiler_meadow-network
the-real-apex_default
va_va_internal
```

**Stale networks to remove:** `carbon-network`, `proxy` (legacy, not `proxy_net`)

### GitHub Org Distribution

| Org | Repos on VM101 | Notes |
|-----|---------------|-------|
| `data-kinetic-projects` | 8 repos | Primary preview org |
| `no-hype-ai` | 3 repos (rose-and-berg, the-real-apex, VA) | External org |
| `ATARI-Foundation` | 2 repos (surgeo, abts-surgeo) | External org |
| `Enercore-AI` | 1 repo (Platform-Core) | Production only |

### Security Issues Found

| Issue | Severity | Location | Action |
|-------|----------|----------|--------|
| Surgeo git remote contains access token | **High** | `/opt/dk-previews/active/surgeo/.git/config` | Rotate token immediately, update remote URL |
| Enercore ports on 0.0.0.0 | Medium | Platform-Core compose | Bind to 127.0.0.1 (UFW mitigates, but defense-in-depth) |

### Cron Jobs (Confirmed Installed)

```cron
# Preview stack maintenance - installed 2026-03-25
0 * * * * /opt/dk-previews/scripts/cleanup.sh >> /opt/dk-previews/logs/cleanup.log 2>&1
0 3 * * 0 docker system prune -af --filter until=168h >> /opt/dk-previews/logs/prune.log 2>&1
0 4 * * * find /opt/dk-previews/archive -mindepth 1 -maxdepth 1 -mtime +7 -exec rm -rf {} +
```

---

## 13. Project Migration Runbook

This section defines the process to standardize each running project **without destroying existing data**. Every project must be migrated in-place — no data loss, no downtime beyond a brief restart.

### Migration Principles

1. **Never `docker compose down --volumes`** on a running project with data — this destroys databases
2. **Create `docker-compose.preview.yaml` alongside existing compose files** — don't replace the running file until validated
3. **Test the new compose file with `docker compose -f docker-compose.preview.yaml config`** before switching
4. **Verify the app is accessible via its preview URL** after each step before moving on
5. **Keep the old compose file as `.bak`** until the migration is confirmed

### Per-Project Migration Steps

For each project in `/opt/dk-previews/active/`:

#### Step 1: Audit Current State (read-only)

```bash
cd /opt/dk-previews/active/<name>/

# What compose file is running?
docker compose ps

# What networks does it use?
docker network inspect <project_network> | jq '.[0].Containers'

# What volumes exist?
docker volume ls | grep <name>

# What ports are published?
docker ps --filter "name=<name>" --format "{{.Names}}\t{{.Ports}}"

# Is the app reachable via its preview URL?
curl -sf https://<name>.preview.datakinetic.com -o /dev/null && echo OK || echo UNREACHABLE
```

#### Step 2: Create `docker-compose.preview.yaml`

Create the standardized preview compose file in the repo. Key rules:

- **Reuse existing volume names** — do NOT change volume names or database data is lost
- **Keep the same database credentials** — changing them locks out the existing database
- **Use the same image references** that are currently running (upgrade images separately later)
- **Remove custom network definitions** — use default compose network
- **Expose web port on host** via `${APP_PORT:-3000}`

```bash
# Validate the new compose file
docker compose -f docker-compose.preview.yaml config --quiet

# Dry-run — see what would change
docker compose -f docker-compose.preview.yaml up --dry-run 2>&1 | head -20
```

#### Step 3: Switch Compose File (brief restart)

```bash
cd /opt/dk-previews/active/<name>/

# Stop with the OLD compose file (preserves volumes)
docker compose -f <old-file>.yml down

# Start with the NEW compose file (reuses volumes)
doppler run --project <project> --config <config> -- \
  docker compose -f docker-compose.preview.yaml up -d

# Verify containers are running
docker compose -f docker-compose.preview.yaml ps

# Verify the app is reachable
curl -sf https://<name>.preview.datakinetic.com -o /dev/null && echo OK || echo FAIL
```

#### Step 4: Update Metadata

```bash
# Update .preview-meta.json with realistic TTL and managed flag
cat > .preview-meta.json << 'EOF'
{
  "name": "<name>",
  "repo": "<org>/<repo>",
  "branch": "<branch>",
  "status": "running",
  "ttl_hours": 720,
  "created_at": "2026-03-25T00:00:00Z",
  "url": "https://<name>.preview.datakinetic.com",
  "managed": true,
  "doppler_project": "<project>",
  "doppler_config": "dev"
}
EOF
```

#### Step 5: Repo-Side Updates

In the product repo (not on VM101):

```bash
# 1. Commit docker-compose.preview.yaml to the repo
git add docker-compose.preview.yaml
git commit -m "Add standardized preview compose file"

# 2. Add doppler.yaml if missing
cat > doppler.yaml << 'EOF'
project: <product>-applications
config: dev
EOF

# 3. Add dk-preview topic
gh repo edit <org>/<repo> --add-topic dk-preview

# 4. Register webhook (after E2E validation passes)
# gh api repos/<org>/<repo>/hooks ...
```

### Project-Specific Migration Plans

Each project has unique considerations based on its current state. Migrate in this order (simplest first, most complex last):

#### Wave 1: Simple Single-Container Apps (No Database)

These are the easiest — no data to preserve, just an app container.

| # | Project | Containers | Migration Notes |
|---|---------|-----------|-----------------|
| 1 | **stryker-intro** | 1 (app) | Simplest case. Create `docker-compose.preview.yaml` with just the app service. |
| 2 | **durva** | 1 (app) | Same as stryker-intro. |
| 3 | **cms-121** | 1 (app) | Fix container name mismatch (shows as `origincv-app`). Set `container_name: cms-121-app`. |
| 4 | **ut-san-antonio-oncology** | 1 (app) | Clean up stale copy at `/home/nick/code/ut-san-antonio-oncology/`. |

#### Wave 2: App + Database (2-3 Containers)

These have databases with data. **Volume names must be preserved.**

| # | Project | Containers | Migration Notes |
|---|---------|-----------|-----------------|
| 5 | **surgeo** | 2 (app + postgres) | **CRITICAL:** Rotate leaked access token in git remote first. Already Doppler-integrated. Uses `prd` config (unusual for preview). |
| 6 | **tavr-insight-and-profiler** | 2 (app + postgres) | Remove `meadow-network`, use default. Preserve `meadow-db` volume. Port 5436 currently on 127.0.0.1 (good). |
| 7 | **va** | 2 (app + pgvector) | Remove `va_internal` network. Uses pgvector 0.8.0-pg17. Running from `001-va-disability-calculator` branch — confirm if this is intentional. |
| 8 | **the-real-apex** | 3 (web + worker + postgres) | Already uses default network. Just add restart policy + healthchecks. Restart policy was added manually 2026-03-25. |

#### Wave 3: Multi-Service Apps (4-6 Containers)

More complex — multiple services, possibly shared networks, external services.

| # | Project | Containers | Migration Notes |
|---|---------|-----------|-----------------|
| 9 | **ghost-cal** | 4 (web + worker + postgres + redis) | Running from `fix/add-database-migrations` branch — is this intentional? Remove `ghost-cal-network`. Already Doppler-integrated. Clean up stale `/home/ubuntu/code/ghost-cal/` directory. |
| 10 | **rose-and-berg** | 4 (app + api + postgres + redis) | Running from `docker-compose.dev.yml` (not `.yml`). Two custom networks (`sniper-network` + `internal`). Must consolidate to default. |
| 11 | **dayone-rili-synthetics** | 5 (app + worker + postgres + redis + minio) | Two custom networks (`rili-network` + `internal`). MinIO on 127.0.0.1 (already fixed). Running from `docker-compose.prod.yml`. |
| 12 | **ground-truth-charlie** | 6 (app + worker + postgres + redis + mailpit + minio) | **Only project with a preview yaml** (hyphenated: `docker-compose-preview.yaml`). Running from `docker-compose.prod.yml` though. Rename to `docker-compose.preview.yaml` (dot not hyphen). |

#### Wave 4: Production Apps (Separate Track)

These are long-running production workloads, not ephemeral previews. They stay in `/opt/dk-production/` and follow a different lifecycle.

| # | Project | Containers | Migration Notes |
|---|---------|-----------|-----------------|
| 13 | **Platform-Core (enercore)** | 15 | Bind all ports to 127.0.0.1 (SeaweedFS, Grafana, Loki, Tempo, Unleash, Alloy currently on 0.0.0.0). No `docker-compose.preview.yaml` needed — this is production, not preview. Future K8s migration candidate. |
| 14 | **abts-surgeo** | 8 | Already fixed (MinIO on 127.0.0.1). No `docker-compose.preview.yaml` needed. Future K8s migration candidate. |

### Legacy Location Cleanup

After all projects are confirmed running from `/opt/`, clean up legacy locations:

```bash
# 1. Remove broken symlink
rm /home/ubuntu/code/carbon-5

# 2. Remove stale real directories (verify not running first!)
# Only remove after confirming containers run from /opt/ NOT from /home/
rm -rf /home/nick/code/ut-san-antonio-oncology
rm -rf /home/ubuntu/code/ghost-cal      # Verify /opt/ copy is authoritative
rm -rf /home/ubuntu/code/ground-truth-alpha  # Not running
rm -rf /home/ubuntu/code/insights            # Not running

# 3. Remove stale docker networks
docker network rm carbon-network proxy 2>/dev/null

# 4. Keep these (still in use):
# /home/ubuntu/code/nginx-proxy-manager  ← NPM config
# /home/ubuntu/code/dk-alchemy           ← May be used by runners
# /home/ubuntu/code/BehaviorLabs-Logo-Exports ← Static assets
# /home/ubuntu/code/scripts              ← Legacy scripts (review before removing)
# /home/ubuntu/actions-runner-*          ← GitHub Actions runners (active)
```

### Actions Runners (10 Self-Hosted)

VM101 hosts 10 GitHub Actions runners. These are **not part of the preview system** but share VM101 resources.

| Runner | Repo | Notes |
|--------|------|-------|
| `actions-runner` | (default) | General purpose |
| `actions-runner-apex` | the-real-apex | Active (last used 2026-03-24) |
| `actions-runner-carbon5` | carbon-5 | **Should be decommissioned** (carbon-5 removed) |
| `actions-runner-cms121` | cms-121 | Active |
| `actions-runner-durva` | durva | Active |
| `actions-runner-ghost-cal` | ghost-cal | Active |
| `actions-runner-groundtruth-signals` | ground-truth-charlie | Active |
| `actions-runner-rnb` | rose-and-berg | Active |
| `actions-runner-stryker` | stryker-portfolio-dashboard | Active |
| `actions-runner-tavr` | tavr-insight-and-profiler | Active |

**Recommendation:** Decommission `actions-runner-carbon5`. Consider migrating runners to K3s cluster long-term (Actions Runner Controller).

---

## 14. dk-cli & dk-template Adoption Workflow

This section defines how existing projects adopt the dk-cli preview workflow and how new projects get preview support from day one.

### For Existing Projects (Migration)

Each project in [Section 13](#13-project-migration-runbook) needs these repo-side changes to become dk-cli compatible:

#### 1. Add `docker-compose.preview.yaml`

Create following the convention in [Section 5](#5-docker-compose-preview-convention). For existing projects, ensure:
- Volume names match what's already on VM101 (data preservation)
- Image tags reference what's in GHCR (or whatever registry the CI pushes to)
- Internal service ports match the running configuration

#### 2. Add `doppler.yaml`

```yaml
project: <product-name>
config: dev
```

If the project doesn't have a Doppler project yet, create one:
```bash
doppler projects create <product-name> --description "Preview secrets for <product>"
doppler configs create dev --project <product-name>
```

#### 3. Add `.dk-standards.yaml`

```yaml
product: <product-name>
team: <team-name>
services:
  - name: app
    port: 3000
doppler_project: <product-name>
staging_approvers:
  - nickking-data-kinetic
production_approvers:
  - nickking-data-kinetic
min_staging_soak_hours: 4
require_cross_approval: true
```

#### 4. Add CI/CD for GHCR Image Publishing

If the project doesn't push images to GHCR, add the shared build workflow:

```yaml
# .github/workflows/build-deploy.yaml
name: Build & Deploy
on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

jobs:
  build:
    uses: data-kinetic/.github/.github/workflows/build-deploy.yaml@main
    with:
      product: <product-name>
      team: <team-name>
    secrets: inherit
```

#### 5. Add GitHub Topic & Webhook

```bash
# Add topic
gh repo edit <org>/<repo> --add-topic dk-preview

# Register webhook (after Platform API E2E is validated)
gh api repos/<org>/<repo>/hooks \
  -f name=web \
  -f config[url]=https://dk.datakinetic.com/dk/v1/webhooks/github \
  -f config[content_type]=json \
  -f config[secret]="$(doppler secrets get DK_GITHUB_WEBHOOK_SECRET --plain --project dk-infrastructure --config prd)" \
  -f events[]=pull_request \
  -f events[]=issues \
  -f active=true
```

#### 6. Test the Full Loop

```bash
cd ~/Code/<product>
git checkout -b test/preview-validation

# Deploy via dk-cli
dk preview up --ttl 1
# Verify URL is reachable
curl -sf https://<name>.preview.datakinetic.com

# Check listing
dk preview list

# Check logs
dk preview logs <name>

# Tear down
dk preview down <name>
```

### For New Projects (dk-template)

New repos scaffolded from dk-template get preview support out of the box:

```bash
# 1. Initialize new product repo
dk init --product my-product --team my-team --service app:3000:node

# init.sh automatically creates:
#   - docker-compose.preview.yaml (standardized)
#   - doppler.yaml
#   - .dk-standards.yaml
#   - .github/workflows/build-deploy.yaml
#   - k8s/ manifests (for staging/production)

# 2. Push to GitHub
git push -u origin main

# 3. Add topic + webhook (automated by init.sh in future)
gh repo edit data-kinetic/my-product --add-topic dk-preview

# 4. First preview
dk preview up
```

### Adoption Tracking

| Project | `preview.yaml` | `doppler.yaml` | `.dk-standards.yaml` | GHCR Images | `dk-preview` Topic | Webhook | dk-cli Tested |
|---------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| stryker-intro | | | | | | | |
| durva | | | | | | | |
| cms-121 | | | | | | | |
| ut-san-antonio-oncology | | | | | | | |
| surgeo | | | | | | | |
| tavr-insight-and-profiler | | | | | | | |
| va | | | | | | | |
| the-real-apex | | | | | | | |
| ghost-cal | | | | | | | |
| rose-and-berg | | | | | | | |
| dayone-rili-synthetics | | | | | | | |
| ground-truth-charlie | partial | | | | | | |

---

## 15. Workstation & Execution Guide

There are three distinct workstreams and each has a correct place to execute from. Do NOT try to manage everything from VM101 — it is a deployment host, not a development environment.

### Workstreams

| Workstream | Where | What | Why There |
|-----------|-------|------|-----------|
| **1. Platform API + dk-cli code** | Mac → `~/Code/dk-alchemy` | `previews.py`, `webhooks.py`, `config.py`, `preview.ts`, `promote.ts` | Code changes, PRs, CI/CD. Platform API runs on K3s — push code, CI builds image, ArgoCD deploys. |
| **2. Per-repo preview files** | Mac → `~/Code/<product-repo>` | `docker-compose.preview.yaml`, `doppler.yaml`, `.dk-standards.yaml`, CI workflow | Each of the 12 repos needs these files committed. Clone locally, create files, push PR. |
| **3. VM101 in-place migration** | SSH → `vm101-preview-stack` | Stop old compose, start new compose, verify data, clean up stale dirs/networks | Only work that must happen on VM101. Can't do remotely — the API isn't validated yet. |

### Where NOT to Work

| Anti-pattern | Problem |
|-------------|---------|
| Editing code on VM101 | Creates drift from repos. No IDE, no git workflow. Changes get overwritten on next deploy. |
| Running `dk preview up` before API is validated | The API must work first. Manual compose switching (Workstream 3) validates the compose files independently. |
| Mixing workstreams in one session | Switching between code changes and SSH operations causes mistakes. Finish one wave before starting the next. |

### Execution Order

```
Phase A: Unblock the API (Mac — dk-alchemy)
─────────────────────────────────────────────
A1. Add missing Doppler secrets (DK_NPM_ADMIN_EMAIL, DK_NPM_ADMIN_PASSWORD,
    DK_GITHUB_WEBHOOK_SECRET, DK_GITHUB_PAT) to dk-infrastructure/prd
A2. Deploy Platform API to K3s (verify pod is running)
A3. Smoke test: API can SSH to VM101 (GET /dk/v1/previews/health)
A4. Smoke test: API can list existing previews (GET /dk/v1/previews)

Phase B: Wave 1 — Simple Apps (Mac + SSH)
─────────────────────────────────────────────
B1. Mac: Create docker-compose.preview.yaml in stryker-intro repo, push PR
B2. SSH: Pull new code on VM101, switch to preview compose file
    ssh vm101-preview-stack
    cd /opt/dk-previews/active/stryker-intro
    git pull
    docker compose down
    docker compose -f docker-compose.preview.yaml up -d
B3. Mac: Test dk preview list — verify API sees it
B4. Mac: Test dk preview down stryker-intro — verify clean teardown
B5. Mac: Test dk preview up — verify fresh deploy works
B6. Repeat B1-B5 for durva, cms-121, ut-san-antonio-oncology

Phase C: Wave 2 — Apps with Databases (Mac + SSH, careful)
─────────────────────────────────────────────────────────────
C1. Mac: Create docker-compose.preview.yaml for each repo
    CRITICAL: Match existing volume names to preserve data
C2. SSH: Switch compose files one project at a time
    docker compose down          # preserves volumes (no --volumes flag!)
    docker compose -f docker-compose.preview.yaml up -d
    Verify app loads with existing data intact
C3. Mac: Test full dk-cli loop for each project
C4. Handle special cases:
    - surgeo: Rotate leaked access token FIRST
    - va: Confirm branch (001-va-disability-calculator) is intentional
    - ghost-cal: Confirm branch (fix/add-database-migrations) is intentional

Phase D: Wave 3 — Multi-Service Apps (Mac + SSH, most complex)
──────────────────────────────────────────────────────────────
D1. Mac: Create docker-compose.preview.yaml for each repo
    Multiple services, multiple volumes — audit each carefully
D2. SSH: Switch compose files, verify all services start
D3. Mac: Test full dk-cli loop
D4. Special cases:
    - ground-truth-charlie: Rename docker-compose-preview.yaml → docker-compose.preview.yaml (dot not hyphen)
    - rose-and-berg: Currently running docker-compose.dev.yml, has 2 custom networks
    - dayone-rili-synthetics: Running docker-compose.prod.yml, has MinIO

Phase E: PR Webhook Validation (Mac)
─────────────────────────────────────────────
E1. Register webhook on one Wave 1 repo (stryker-intro)
E2. Open test PR → verify preview auto-created, PR comment posted
E3. Push to PR → verify preview recreated
E4. Close PR → verify preview torn down
E5. Roll out webhooks to remaining repos

Phase F: Cleanup (SSH)
─────────────────────────────────────────────
F1. Remove stale directories:
    rm /home/ubuntu/code/carbon-5           # broken symlink
    rm -rf /home/nick/code/ut-san-antonio-oncology
    rm -rf /home/ubuntu/code/ghost-cal      # stale real dir
    rm -rf /home/ubuntu/code/ground-truth-alpha
    rm -rf /home/ubuntu/code/insights
F2. Remove stale networks:
    docker network rm carbon-network proxy
F3. Decommission actions-runner-carbon5
F4. Update all .preview-meta.json with managed: true, realistic TTLs
```

### Session Pattern

The most efficient way to work is in focused sessions that don't mix workstreams:

```
Session Type 1: "Code Session" (Mac only)
  Open dk-alchemy or product repo
  Make code changes, test locally, push PR
  Duration: as long as needed

Session Type 2: "Migration Session" (Mac + SSH terminal side-by-side)
  Terminal 1 (Mac): dk-cli commands, curl tests
  Terminal 2 (SSH): vm101 compose operations
  Work through one wave at a time
  Duration: ~30 min per project

Session Type 3: "Cleanup Session" (SSH only)
  Remove stale dirs, networks, runners
  Update metadata files
  Duration: ~15 min total
```

### SSH Quick Reference

```bash
# Connect to VM101
ssh vm101-preview-stack

# Common operations
cd /opt/dk-previews/active/<name>
docker compose -f docker-compose.preview.yaml ps
docker compose -f docker-compose.preview.yaml logs --tail 50 <service>
docker compose -f docker-compose.preview.yaml down        # preserves volumes
docker compose -f docker-compose.preview.yaml up -d       # start with new file

# Check volumes survived (should show existing data)
docker volume ls | grep <name>

# Verify app is reachable
curl -sf https://<name>.preview.datakinetic.com -o /dev/null && echo OK || echo FAIL
```

---

## 16. Secrets Management

### Doppler Layout

| Doppler Project | Config | Used By |
|----------------|--------|---------|
| `dk-infrastructure` | `prd` | Platform API — SSH key, NPM creds, GitHub PAT |
| `{product}-applications` | `dev` | Preview compose (injected via `doppler run`) |
| `{product}-applications` | `stg` | Staging K8s (injected via DopplerSecret) |
| `{product}-applications` | `prd` | Production K8s (injected via DopplerSecret) |

### Required Secrets in `dk-infrastructure/prd`

| Secret | Status | Purpose |
|--------|--------|---------|
| `DK_PREVIEW_SSH_KEY` | Exists | Private key content for VM101 SSH |
| `DK_NPM_ADMIN_EMAIL` | **Needed** | NPM API authentication |
| `DK_NPM_ADMIN_PASSWORD` | **Needed** | NPM API authentication |
| `DK_GITHUB_WEBHOOK_SECRET` | **Needed** | Webhook HMAC validation |
| `DK_GITHUB_PAT` | **Needed** | PR comment posting |

---

## 17. Monitoring & Cleanup

### Grafana Dashboard

- **Dashboard:** VM101 Preview Stack (`/d/vm101-preview-stack`)
- **Panels:** Container count, disk %, memory %, load average, Docker container list, network I/O
- **Location:** `dk-alchemy/grafana/dashboards/infrastructure/vm101-preview-stack.json`

### Alert Rules

| Alert | Threshold | Severity |
|-------|-----------|----------|
| `vm101-disk-warning` | >85% disk | Warning |
| `vm101-disk-critical` | >95% disk | Critical |
| `vm101-load-high` | 5min load >20 | Warning |
| `vm101-health-down` | Scrape target unreachable 3min | Critical |

### Automated Cleanup (Cron on VM101)

| Schedule | Job | Purpose |
|----------|-----|---------|
| Hourly | TTL check | Remove previews past TTL |
| Daily | Archive prune | Delete archives older than 7 days |
| Weekly | Docker prune | Remove unused images, volumes, networks |

---

## 18. Validation & Testing Plan

The Platform API preview endpoints and dk-cli commands exist in code but have **not been validated end-to-end**. The following test plan is required before declaring the preview system operational.

### E2E Validation Steps

#### Phase 1: API Smoke Test (No dk-cli)

1. **Verify Doppler secrets** — Confirm `DK_PREVIEW_SSH_KEY`, `DK_NPM_ADMIN_EMAIL`, `DK_NPM_ADMIN_PASSWORD` are all in `dk-infrastructure/prd`
2. **SSH connectivity** — Platform API pod can SSH to VM101 (10.0.0.51) via `asyncssh.import_private_key()`
3. **Create preview via curl:**
   ```bash
   curl -X POST https://dk.datakinetic.com/dk/v1/previews \
     -H "X-API-Key: <token>" \
     -H "Content-Type: application/json" \
     -d '{"repo": "data-kinetic/dk-template", "branch": "main", "name": "test-preview", "ttl_hours": 1}'
   ```
4. **Verify on VM101:** Directory exists, containers running, `.preview-meta.json` written
5. **Verify NPM proxy:** `test-preview.preview.datakinetic.com` resolves and returns HTTP response
6. **List previews:** `GET /dk/v1/previews` returns the new preview
7. **Get logs:** `GET /dk/v1/previews/test-preview/logs` returns container logs
8. **Delete preview:** `DELETE /dk/v1/previews/test-preview` cleans up containers, proxy, archives directory
9. **Health endpoint:** `GET /dk/v1/previews/health` returns accurate VM101 metrics

#### Phase 2: dk-cli Validation

1. **`dk preview up`** — From a product repo with `docker-compose.preview.yaml`
2. **`dk preview list`** — Verify tabular output matches API response
3. **`dk preview logs <name>`** — Verify logs stream correctly
4. **`dk preview down <name>`** — Verify clean teardown

#### Phase 3: PR Webhook Validation

1. Register webhook on a test repo
2. Open PR → verify preview created, PR comment posted
3. Push to PR → verify preview recreated
4. Close PR → verify preview torn down, PR comment posted

#### Phase 4: Promotion Validation

1. `dk promote staging` → verify approval issue created
2. Apply `status/approved` label → verify staging deployment triggered
3. `dk promote production` → verify cross-approval enforcement
4. `dk promote rollback staging` → verify rollback works

### Known Blockers for Validation

| Blocker | Status | Action |
|---------|--------|--------|
| NPM admin credentials not in Doppler | **Blocking** | Add `DK_NPM_ADMIN_EMAIL` + `DK_NPM_ADMIN_PASSWORD` to `dk-infrastructure/prd` |
| GitHub webhook secret not in Doppler | **Blocking** | Add `DK_GITHUB_WEBHOOK_SECRET` to `dk-infrastructure/prd` |
| GitHub PAT not in Doppler | **Blocking** | Add `DK_GITHUB_PAT` (fine-grained) to `dk-infrastructure/prd` |
| No repos have `dk-preview` topic | Non-blocking | Add topic to test repo |
| No webhooks registered | Non-blocking | Register on test repo after E2E works |

---

## 19. Implementation Status

### dk-alchemy (ahead of dk-planning docs)

| Component | Code Status | Tested E2E? |
|-----------|------------|-------------|
| `previews.py` — full CRUD + health + logs | Complete | **No** |
| `webhooks.py` — PR automation + promotion gates | Complete | **No** |
| `config.py` — SSH key, NPM, Doppler settings | Complete | **No** |
| `preview.ts` — dk-cli up/down/list/logs | Complete | **No** |
| `promote.ts` — staging/production/rollback/status | Complete | **No** |
| IngressRoute — `*.preview.datakinetic.com` | Deployed | Yes |
| IngressRoute — `*.preview.behaviorlabs.ai` | Deployed | Yes |
| Grafana dashboard — VM101 metrics | Deployed (PR #350) | Yes |
| Alert rules — disk, load, health | Configured | Yes |
| DDNS — wildcard records | Running | Yes |

### dk-template

| Component | Status |
|-----------|--------|
| `docker-compose.preview.yaml` template | Exists — needs update (remove proxy_net, add `${APP_PORT}`) |
| `init.sh` scaffolding | Complete — needs `dk-preview` topic step |
| `validate-scaffold.sh` | Validates `docker-compose.preview.yaml` exists |
| `.dk-standards.yaml` template | Complete (includes approver lists) |

### dk-planning (docs lag behind implementation)

| Document | Status |
|----------|--------|
| `docs/preview-environments.md` | Outdated — says "NPM proxy automation missing", but code exists |
| `docs/dk-cli.md` | Says "Implemented" but should note "not E2E tested" |
| `docs/platform-api.md` | Accurate endpoint list |
| `plans/dk-preview-stack/03-migration-status-and-gaps.md` | Says Phase 3 has 3 critical gaps — these are fixed in code but untested |
| `plans/dk-alchemy/08-preview-standardization.md` | Says dk-cli "not started" — code is complete |

---

## 20. Open Decisions

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Port allocation strategy | (A) Static per-project port assignment (B) Dynamic allocation by Platform API (C) Docker random port + discovery | **(B)** — API allocates from `10000-10999`, stores in metadata, sets as env var |
| 2 | Production apps (enercore, abts-surgeo) migration | (A) Stay on VM101 indefinitely (B) Migrate to K8s (C) Hybrid — preview stays, production moves | **(C)** — These are production workloads that should eventually run on K8s with proper HA |
| 3 | NPM replacement | (A) Keep NPM (B) Replace with Caddy (C) Replace with Traefik on VM101 | **(A)** for now — NPM works, has API, and changing adds risk. Revisit when VM101 scope shrinks. |
| 4 | Max concurrent previews | Current: 15. Sufficient? | 15 is fine given VM101 resources (64 GiB RAM, 16 vCPU). Monitor and adjust. |
| 5 | Preview resource limits | Per-preview CPU/memory limits? | Defer — Docker Compose resource limits are unreliable without cgroups v2 tuning. Monitor aggregate via Grafana. |

---

## Related Documentation

- [Preview Environments](docs/preview-environments.md) — operational reference (needs update)
- [Platform API](docs/platform-api.md) — API endpoint reference
- [dk-cli](docs/dk-cli.md) — CLI command reference
- [dk-template](https://github.com/data-kinetic/dk-template) — product repo scaffolding
- [VM101 Assessment](plans/dk-preview-stack/01-vm101-assessment.md) — hardware and container audit
- [Standardization Plan](plans/dk-preview-stack/02-standardization-plan.md) — phased implementation
- [Migration Status](plans/dk-preview-stack/03-migration-status-and-gaps.md) — ground-truth gap analysis
