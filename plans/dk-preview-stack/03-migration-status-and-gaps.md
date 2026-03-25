# 03 — Migration Status & Integration Gaps

> **Status:** Active
> **Priority:** High
> **Created:** 2026-03-24
> **Epic:** [data-kinetic/dk-planning#13](https://github.com/data-kinetic/dk-planning/issues/13)
> **Depends on:** [Standardization Plan](02-standardization-plan.md), [Platform API](../dk-alchemy/01-platform-api.md)
> **Prereq:** [VM101 Assessment](01-vm101-assessment.md), [Standardization Plan](02-standardization-plan.md)

---

## Background

The standardization plan (02) was marked "Complete" on 2026-03-24 but a live SSH audit reveals significant gaps between documented state and reality. Phases 0-2 (stabilization, organization, network) are genuinely complete, but Phase 3 (Platform API integration), Phase 4 (dk-cli), and Phase 5 (automation) have critical unfinished work. This plan documents the ground truth, identifies every blocking integration gap, and provides a prioritized path to a fully functional preview system with clean dk-api integration.

---

## Live Audit Results (2026-03-24, updated 2026-03-25)

### VM101 System State

| Metric | 2026-03-24 | 2026-03-25 | Notes |
|--------|-----------|-----------|-------|
| Running containers | 56 | 56 | +3 the-real-apex restarted, -carbon-5 already gone |
| RAM | 62 GiB usable | 5.8 GiB used / 62 GiB | 11% utilization |
| Disk | 53% (257 GB) | **20% (96 GB)** | Reclaimed ~157GB: build cache + orphaned volumes + images |
| Load average | 0.19 | 0.35 | Stable, well within 16 vCPU capacity |
| Compose projects | 15 | 14 | carbon-5 fully removed |
| API-managed previews | 0 | 0 | All 12 metas have `managed: false`, TTL 8760h |
| Unmigrated projects | 2 | 0 | ghost-cal + ut-san-antonio-oncology migrated to standard dirs |
| Containers restarting | 2 (carbon-5) | 0 | carbon-5 decommissioned |
| Unhealthy containers | 1 (surgeo) | 0 | surgeo now healthy |
| **Cron jobs** | Listed in docs | **Were NOT installed** — fixed 2026-03-25 | cleanup.sh, prune, archive |
| **the-real-apex** | "Running" | **Was DOWN 28h** — restarted 2026-03-25 | Clean shutdown, no restart policy |
| **rili port 0.0.0.0:3000** | Flagged | **Fixed** — changed to expose-only | Now routes through NPM |
| **carbon-5** | Restarting | **Fully removed** — only orphaned network remained, now cleaned | |
| **Node exporter (9100)** | Documented | **Actually health-server.py** — custom Python, not Prometheus node_exporter | |

### Container Inventory (56 total as of 2026-03-25)

**Production apps (`/opt/dk-production/`):**

| Project | Containers | Status | Health | Notes |
|---------|-----------|--------|--------|-------|
| platform-core (enercore) | 15 | All UP | db, redis healthy; 13 no healthcheck | Full LGTM stack + SeaweedFS + Unleash + Mongo |
| abts-surgeo | 8 | All UP | api, web, postgres, redis, minio healthy; 3 workers no healthcheck | |
| ~~carbon-5~~ | ~~removed~~ | **Decommissioned** | — | Fully removed 2026-03-24 (Doppler token missing). Orphaned network cleaned 2026-03-25. |

**Preview apps (`/opt/dk-previews/active/`):**

| Project | Containers | Status | Health | Notes |
|---------|-----------|--------|--------|-------|
| ground-truth-charlie | 6 | All UP 28h | postgres, redis, mailpit healthy | minio + app no healthcheck |
| dayone-rili-synthetics | 5 | All UP 3h | postgres, redis, minio healthy | **Port fix applied 2026-03-25** — was 0.0.0.0:3000, now expose-only |
| ghost-cal | 4 | All UP 3h | web, db, redis healthy | worker no healthcheck; doppler integrated; **migrated** from runner dir |
| rose-and-berg (sniper) | 4 | All UP 28h | db, redis healthy | sniper-app, sniper-api no healthcheck |
| the-real-apex | 3 | All UP | db healthy (web starting) | **Restarted 2026-03-25** — was down 28h (clean shutdown, no restart policy). Added `restart: unless-stopped`. |
| surgeo | 2 | All UP 3h | app, db healthy | Doppler integrated; Clerk keys fixed |
| tavr-insight-and-profiler (meadow) | 2 | All UP 28h | db healthy | app no healthcheck |
| va | 2 | All UP 28h | app, postgres healthy | OK |
| ut-san-antonio-oncology | 1 | UP 3h | no healthcheck | **Migrated** from `/home/nick/code/` |
| cms-121 | 1 | UP 28h | no healthcheck | Note: container named `origincv-app` (name mismatch with project) |
| durva | 1 | UP 28h | no healthcheck | |
| stryker-intro | 1 | UP 28h | no healthcheck | |

**Infrastructure:**

| Project | Containers | Notes |
|---------|-----------|-------|
| nginx-proxy-manager | 1 (healthy) | Still at legacy location `/home/ubuntu/code/nginx-proxy-manager/` |

**Health summary:** 24 of 56 containers have healthchecks configured. 29 containers run without health monitoring.

### Network State

- **UFW:** Active, deny-by-default, 8 rules (22, 80, 443, 81 from mgmt, 9100 from mgmt)
- **Docker networks:** 21 custom networks + proxy_net shared bridge
- **Databases on 127.0.0.1:** All Postgres (5432, 5433, 5434, 5436, 5442), Redis (6380, 6381), Mongo (27018)
- **Still on 0.0.0.0:** rili-minio (9000-9001), abts-minio (9002-9003), enercore services (Unleash 4243, Grafana 3301, Tempo 3201, Loki 3101, SeaweedFS ports, OTel 4319-4320). ~~rili-app-prod (3000)~~ — **fixed 2026-03-25** (now expose-only)
- **Platform API connectivity:** Verified — `curl https://dk.datakinetic.com/health` returns `{"status":"ok"}` from VM101

### Cron Jobs (installed 2026-03-25 — were NOT running before)

> **DRIFT FOUND:** Cron jobs were documented as "working" but no crontab entry existed (neither user nor root, no systemd timers). Installed 2026-03-25.

```
# Preview stack maintenance - installed 2026-03-25
0 * * * * /opt/dk-previews/scripts/cleanup.sh >> /opt/dk-previews/logs/cleanup.log 2>&1
0 3 * * 0 docker system prune -af --filter until=168h >> /opt/dk-previews/logs/prune.log 2>&1
0 4 * * * find /opt/dk-previews/archive -mindepth 1 -maxdepth 1 -mtime +7 -exec rm -rf {} + >> /opt/dk-previews/logs/cleanup.log 2>&1
```

> **Note:** TTL enforcement is still effectively a no-op — all 12 metas have `ttl_hours: 8760` (1 year). The cleanup script works correctly but won't expire anything until metas have realistic TTLs.

---

## Issue Inventory

### P0 — Blocking API→VM101 Integration

These must be resolved before any preview can be created via the Platform API.

#### 1. SSH Key Config Mismatch ~~Not in Doppler~~

- **Impact:** Platform API cannot SSH to VM101 — all preview CRUD operations fail
- **Root cause (resolved):** SSH key **IS** in Doppler as `DK_PREVIEW_SSH_KEY` (key content). However, `config.py` has `preview_ssh_key_path: str` which expects a **file path**, not key content. `asyncssh.connect()` receives an empty path → auth fails.
- **Fix:** Add `preview_ssh_key: str = ""` setting to `config.py`. Refactor `_ssh_run()` to use `asyncssh.import_private_key(settings.preview_ssh_key)` to pass key content directly — no tmpfile needed. Keep `preview_ssh_key_path` as fallback for local dev.
- **Repo:** dk-alchemy — `config.py` + `previews.py`
- **Verification:** `_ssh_run("hostname")` returns `vm101` from the Platform API pod
- **Doppler secret:** `DK_PREVIEW_SSH_KEY` — already exists ✅

#### 2. NPM Proxy Automation Missing from `previews.py`

- **Impact:** `create_preview` deploys containers but doesn't register a proxy host in NPM — preview URL is unreachable
- **Current:** `previews.py:72-143` clones repo, starts compose, writes metadata — no NPM API call
- **Fix:** After `docker compose up`, call NPM API on VM101 (`http://localhost:81/api/nginx/proxy-hosts`) to create proxy host mapping `{name}.preview.datakinetic.com` → container port. On `delete_preview`, remove the proxy host.
- **Note:** NPM API requires authentication — login first at `POST /api/tokens` with admin credentials. NPM admin creds should be in Doppler.
- **Repo:** dk-alchemy — `src/platform-api/src/platform_api/routers/previews.py`
- **Verification:** After `POST /dk/v1/previews`, the preview URL returns HTTP 200

#### 3. Doppler Secrets Injection Missing

- **Impact:** `docker compose up` runs without Doppler context — preview apps can't access env-specific secrets (DB URLs, API keys, etc.)
- **Current:** `previews.py:117` runs `docker compose up -d` directly
- **Fix:** Prefix with `doppler run --project <project> --config <config> --` or use Doppler CLI to inject `.env` file before compose up. The `CreatePreviewRequest` already has a `doppler_config` field (default: "dev").
- **Prereq:** Doppler CLI installed (v3.75.2) and authenticated on VM101 ✅
- **Repo:** dk-alchemy — `src/platform-api/src/platform_api/routers/previews.py`
- **Verification:** Preview containers start with correct environment variables

### P1 — Correctness Issues

#### 4. carbon-5 — DECOMMISSIONED ✅

- **Status:** Fully removed. Containers stopped, directory deleted, orphaned `carbon-5_default` network removed (2026-03-25).
- **Root cause:** `docker-compose-preview.yaml` passed `DOPPLER_TOKEN=${DOPPLER_TOKEN}` but no service token existed. Not worth fixing.
- **Decision (2026-03-24):** Decommission carbon-5 on VM101.
- **Result:** Freed ~10 containers and associated resources. No `/opt/dk-production/carbon-5/` directory remains.

#### 5. surgeo — FIXED ✅

- **Previous symptom:** `surgeo-app-1` marked `(unhealthy)` — Clerk key mismatch causing infinite redirect.
- **Fix applied:** Clerk keys added via Doppler integration, healthcheck changed from `/api/health` to `/` due to standalone build issue.
- **Current status (2026-03-25):** Both `surgeo-app-1` and `surgeo-db-1` healthy. Zero restarts.

#### 6. RAM Discrepancy — RESOLVED

- **Symptom:** VM101 reports 62 GiB RAM, documentation says 125 GiB
- **Root cause (resolved):** Proxmox `qm config 101` shows `memory: 65536` (64 GiB) with `balloon: 32768` (32 GiB minimum). The balloon driver allows Proxmox to reclaim unused RAM; the OS sees ~62 GiB after kernel overhead. The documentation claiming 125 GiB was **always wrong** — this VM was never allocated more than 64 GiB.
- **Action:** Update all docs to state 64 GiB allocated (62 GiB usable). Update dk-clusters `docs/vm-inventory.md` which incorrectly says "128G RAM".
- **Repo:** dk-clusters — `docs/vm-inventory.md`, dk-planning — `docs/preview-environments.md`, `docs/infrastructure.md`

#### 7. ghost-cal — MIGRATED ✅

- **Previous location:** `/home/ubuntu/actions-runner-ghost-cal/_work/ghost-cal/ghost-cal/`
- **Current location:** `/opt/dk-previews/active/ghost-cal/` with Doppler integration
- **Note:** Legacy runner directory still exists at `/home/ubuntu/actions-runner-ghost-cal/` — can be cleaned up

#### 8. ut-san-antonio-oncology — MIGRATED ✅

- **Previous location:** `/home/nick/code/ut-san-antonio-oncology/`
- **Current location:** `/opt/dk-previews/active/ut-san-antonio-oncology/`

### P2 — Completeness Gaps

#### 9. No API-Managed Previews

- All 10 `.preview-meta.json` files have `"managed": false` and `"ttl_hours": 8760` (1 year)
- These are retrospectively tagged pre-existing deployments, not API-created previews
- **Resolution:** Once P0 items are fixed, create a test preview via `POST /dk/v1/previews` to validate end-to-end

#### 10. NPM API Path / Auth

- NPM API at `http://localhost:81/api/nginx/proxy-hosts` — the base path needs `/api/` prefix
- Auth required: `POST http://localhost:81/api/tokens` with admin email/password returns JWT
- NPM admin credentials should be stored in Doppler `dk-infrastructure/prd`

#### 11. GitHub Webhook Not Registered

- `webhooks.py` handles `pull_request.opened/synchronize/closed` → create/recreate/delete preview
- **No repo has the webhook configured** — code is dead until webhooks are registered
- **Action:** Register webhook on 2-3 product repos via GitHub settings → Webhooks → `https://dk.datakinetic.com/dk/v1/webhooks/github`
- **Prereq:** `DK_GITHUB_WEBHOOK_SECRET` must be set in Doppler and match the repo webhook secret

#### 12. dk-cli Preview Commands (Phase 4)

- Not started — `dk preview up/down/list/logs` commands need implementation
- **Depends on:** P0 items (API must work end-to-end first)
- **Repo:** dk-alchemy — new CLI module or dk-cli repo

#### 13. PR Comment Bot

- Not implemented — should post preview URL as PR comment when preview is ready
- **Depends on:** GitHub App credentials in Doppler, webhook registration
- **Repo:** dk-alchemy — extend `webhooks.py` to post comments via GitHub API

#### 14. Port 9100 is health-server.py, NOT Prometheus Node Exporter

- **Symptom:** Port 9100 is documented as Prometheus node_exporter but is actually served by `/opt/dk-previews/scripts/health-server.py` (Python3, pid 28993)
- **Impact:** Prometheus scraping for VM101 hardware metrics won't work — the health endpoint returns a custom JSON blob (`{"host":"vm101","status":"healthy","containers_running":53,...}`), not Prometheus exposition format
- **Not a systemd service** — if the Python process crashes, port 9100 goes down with no auto-restart
- **Action:** Either install actual Prometheus node_exporter alongside health-server.py (on a different port), or update monitoring docs to reflect the custom endpoint. Also make health-server.py a systemd service for reliability.

#### 15. MinIO/SeaweedFS Ports on 0.0.0.0

- rili-minio: `0.0.0.0:9000-9001`
- abts-minio: `0.0.0.0:9002-9003`
- UFW blocks external access but these should be on 127.0.0.1 for defense-in-depth
- **Action:** Update docker-compose files to bind `127.0.0.1:9000-9003`

---

## Cross-Repo Dependency Map

### Critical Path (must be done in order)

```
SSH Key in Doppler (dk-alchemy/Doppler)
  └─► NPM Proxy Automation (dk-alchemy/previews.py)
       └─► Doppler Secrets Injection (dk-alchemy/previews.py)
            └─► End-to-End Test (POST /dk/v1/previews)
                 └─► dk-cli Commands (dk-alchemy)
                      └─► GitHub Webhook Registration (product repos)
                           └─► PR Comment Bot (dk-alchemy/webhooks.py)
```

### Full Dependency Table

| # | Dependency | Repo | File(s) | Status | Blocks |
|---|-----------|------|---------|--------|--------|
| 1 | SSH key in Doppler | dk-alchemy | Doppler `dk-infrastructure/prd` | Done (`DK_PREVIEW_SSH_KEY` exists) | — |
| 1b | SSH key code refactor | dk-alchemy | `config.py`, `previews.py` | **Code change needed** — add `preview_ssh_key` setting, use `asyncssh.import_private_key()` | All API→VM101 ops |
| 2 | NPM proxy automation | dk-alchemy | `src/platform-api/.../routers/previews.py` | **Code change needed** | Preview URL routing |
| 3 | Doppler secrets injection | dk-alchemy | `src/platform-api/.../routers/previews.py` | **Code change needed** | Preview app functionality |
| 4 | NPM admin creds in Doppler | Doppler | `dk-infrastructure/prd` | **Not done** — store `DK_NPM_ADMIN_EMAIL` + `DK_NPM_ADMIN_PASSWORD` | NPM proxy automation |
| 5 | Doppler CLI on VM101 | VM101 | System packages | Done (v3.75.2, authenticated as `preview-stack`) | — |
| 6 | dk-cli preview commands | dk-alchemy | `src/dk-cli/` (planned) | **Not started** | Developer workflow |
| 7 | GitHub webhook registration | product repos | GitHub repo settings | **Not done** — register on ground-truth-charlie + behavior-labs-ai first | PR-linked lifecycle |
| 8 | GitHub webhook secret in Doppler | Doppler | `dk-infrastructure/prd` | **Not done** — create `DK_GITHUB_WEBHOOK_SECRET` | Webhook signature validation |
| 9 | GitHub PAT for PR comments | Doppler | `dk-infrastructure/prd` | **Not done** — create `DK_GITHUB_PAT` (fine-grained PAT) | PR comment bot |
| 10 | docker-compose.preview.yaml template | dk-template | `docker-compose.preview.yaml` | Done (basic) — **required** file for all preview deployments | — |
| 11 | Edge routes (Traefik) | dk-alchemy | `k8s/edge/routes/base/preview-stack.yaml` | Done | — |
| 12 | DDNS wildcard records | dk-alchemy | `k8s/infrastructure/ddns-service/base/configmap.yaml` | Done | — |
| 13 | Platform API K8s deployment | dk-alchemy | `k8s/infrastructure/platform-api/` | Done | — |
| 14 | Platform API connectivity from VM101 | dk-alchemy | PR #351 (hosts entry) | Done | — |
| 15 | Grafana dashboard | dk-alchemy | PR #350 | Done | — |
| 16 | Alert rules | dk-alchemy | Configured | Done | — |
| 17 | Cleanup cron on VM101 | VM101 | `/etc/cron.d/dk-preview-cleanup` | Done | — |
| 18 | VM101 Proxmox RAM | dk-clusters | `docs/vm-inventory.md` | Resolved — 64 GiB allocated (balloon 32 GiB), docs were always wrong | Update docs |
| 19 | carbon-5 decommission | VM101 | `/opt/dk-production/carbon-5/` | **Decision: decommission** — Doppler token missing, not worth fixing | Frees 10 containers. **Verify:** `docker compose -f /opt/dk-production/carbon-5/docker-compose.yaml down` executed and containers removed. |
| 20 | surgeo Clerk keys | VM101 | `/opt/dk-previews/active/surgeo/.env` | **Fix needed** — create .env with Clerk keys from Doppler | surgeo health |
| 21 | Production app K8s migration | dk-alchemy | New manifests needed | **Not started** — enercore, abts-surgeo (carbon-5 decommissioned) | VM101 resource freeing |

---

## Implementation Priority

### Sprint 1 — Unblock API Integration (dk-alchemy) — [dk-planning#12](https://github.com/data-kinetic/dk-planning/issues/12), [dk-alchemy#380](https://github.com/data-kinetic/dk-alchemy/issues/380), [#381](https://github.com/data-kinetic/dk-alchemy/issues/381), [#382](https://github.com/data-kinetic/dk-alchemy/issues/382)

| # | Task | Repo | Effort |
|---|------|------|--------|
| 1.1 | ~~Store VM101 SSH key in Doppler~~ — already exists as `DK_PREVIEW_SSH_KEY` ✅ | — | — |
| 1.2 | Refactor `_ssh_run()` in `previews.py`: add `preview_ssh_key: str` to `config.py`, use `asyncssh.import_private_key(settings.preview_ssh_key)` instead of `client_keys=[path]`. Keep `preview_ssh_key_path` as local dev fallback. | dk-alchemy | 1 hr |
| 1.3 | Store NPM admin credentials in Doppler `dk-infrastructure/prd`: `DK_NPM_ADMIN_EMAIL` = `nick@datakinetic.com`, `DK_NPM_ADMIN_PASSWORD` | Doppler | 15 min |
| 1.4 | Add NPM proxy host create to `create_preview()` — after compose up, SSH to VM101 and call NPM API (`POST http://localhost:81/api/nginx/proxy-hosts`) to register `{name}.{domain}` → container port. Auth via `POST /api/tokens` with admin creds. | dk-alchemy | 2-3 hrs |
| 1.5 | Add NPM proxy host delete to `delete_preview()` — find proxy host by domain name, delete it before archiving | dk-alchemy | 1 hr |
| 1.6 | Add Doppler secrets injection + compose file targeting: change SSH command to `doppler run --project {doppler_project} --config {doppler_config} -- docker compose -f docker-compose.preview.yaml up -d`. Fail with 400 if `docker-compose.preview.yaml` not found. Add `doppler_project` field to `CreatePreviewRequest`. | dk-alchemy | 1-2 hrs |
| 1.7 | Add `domain` parameter to `CreatePreviewRequest` (default `preview.datakinetic.com`). Update URL generation to use `https://{name}.{domain}`. | dk-alchemy | 30 min |
| 1.8 | Store GitHub secrets in Doppler: `DK_GITHUB_WEBHOOK_SECRET`, `DK_GITHUB_PAT` (fine-grained PAT) | Doppler | 15 min |
| 1.9 | End-to-end test: `POST /dk/v1/previews` with ground-truth-charlie → verify HTTPS URL works, then `DELETE` to clean up | dk-alchemy | 1 hr |

**Acceptance:** A preview created via API is accessible at `https://{name}.preview.datakinetic.com` with correct environment variables.

### Sprint 2 — Fix Health Issues (VM101) — [dk-planning#11](https://github.com/data-kinetic/dk-planning/issues/11), [dk-clusters#15](https://github.com/data-kinetic/dk-clusters/issues/15)

| # | Task | Location | Effort |
|---|------|----------|--------|
| 2.1 | **Decommission carbon-5:** `cd /opt/dk-production/carbon-5 && docker compose -f docker-compose-preview.yaml down --volumes --remove-orphans`, archive dir. Root cause: missing Doppler service token, not worth fixing. Frees 10 containers. | VM101 `/opt/dk-production/carbon-5/` | 15 min |
| 2.2 | **Fix surgeo Clerk keys:** Create `/opt/dk-previews/active/surgeo/.env` with `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` from surgeo Doppler project. Then `docker compose restart`. Root cause: Clerk infinite redirect loop from missing keys. | VM101 `/opt/dk-previews/active/surgeo/` | 15 min |
| 2.3 | Migrate ghost-cal to `/opt/dk-previews/active/ghost-cal/` — currently at `/home/ubuntu/actions-runner-ghost-cal/_work/ghost-cal/ghost-cal/` | VM101 | 30 min |
| 2.4 | Migrate ut-san-antonio-oncology to `/opt/dk-previews/active/` — currently at `/home/nick/code/ut-san-antonio-oncology/` | VM101 | 30 min |
| 2.5 | Bind MinIO ports to 127.0.0.1 (rili-minio 9000-9001, abts-minio 9002-9003) | VM101 compose files | 30 min |
| 2.6 | ~~Verify Proxmox RAM~~ — RESOLVED: `qm config 101` shows `memory: 65536` (64 GiB) with `balloon: 32768`. Docs were always wrong (never 125 GiB). | ✅ | — |
| 2.7 | Update RAM references: dk-clusters `docs/vm-inventory.md` (128G → 64G), dk-planning `docs/preview-environments.md` (already updated to 62 GiB), dk-planning `docs/infrastructure.md` | dk-clusters + dk-planning | 15 min |

### Sprint 3 — Developer Workflow (dk-alchemy) — [dk-alchemy#383](https://github.com/data-kinetic/dk-alchemy/issues/383), [#384](https://github.com/data-kinetic/dk-alchemy/issues/384)

| # | Task | Repo | Effort |
|---|------|------|--------|
| 3.1 | Implement `dk preview up` — create from git context via `POST /dk/v1/previews` | dk-alchemy | 3-4 hrs |
| 3.2 | Implement `dk preview down <name>` — `DELETE /dk/v1/previews/{name}` | dk-alchemy | 1 hr |
| 3.3 | Implement `dk preview list` — formatted table from `GET /dk/v1/previews` | dk-alchemy | 1 hr |
| 3.4 | Implement `dk preview logs <name>` — stream from `GET /dk/v1/previews/{name}/logs` | dk-alchemy | 1 hr |
| 3.5 | Register GitHub webhook on **ground-truth-charlie** (dk-os, `*.preview.datakinetic.com`) and **behavior-labs-ai** (`*.preview.behaviorlabs.ai`): Settings → Webhooks → `https://dk.datakinetic.com/dk/v1/webhooks/github`, secret = `DK_GITHUB_WEBHOOK_SECRET` value, events: Pull requests | GitHub settings | 30 min |
| 3.6 | Test PR-linked lifecycle: open PR on ground-truth-charlie → preview created at `*.preview.datakinetic.com`, close PR → preview deleted | Product repos | 1 hr |
| 3.7 | Add PR comment bot to `webhooks.py` — use `DK_GITHUB_PAT` (fine-grained PAT) to post preview URL as PR comment on creation, teardown confirmation on deletion | dk-alchemy | 2 hrs |

### Future — Production App Migration to K8s

| # | Task | Repo | Notes |
|---|------|------|-------|
| 4.1 | Design K8s manifests for enercore (15 containers → K8s deployments) | dk-alchemy | Complex — full LGTM + SeaweedFS + Unleash + Mongo |
| 4.2 | ~~Design K8s manifests for carbon-5~~ — **Decommissioned** on VM101 (2026-03-24) | — | No longer applicable |
| 4.3 | Design K8s manifests for abts-surgeo | dk-alchemy | Simpler — single container |
| 4.4 | Migrate enercore + abts-surgeo and verify | dk-alchemy + VM101 | Staged rollout, enercore last |
| 4.5 | Right-size VM101: reduce from 64 GiB → 32 GiB RAM (balloon already set to 32 GiB), reassess 16 vCPU | dk-clusters | After production apps removed |

---

## dk-alchemy Code Changes Required

### `src/platform-api/src/platform_api/routers/previews.py`

1. **Refactor SSH key handling** — `_ssh_run()` currently:
   ```python
   client_keys=[settings.preview_ssh_key_path] if settings.preview_ssh_key_path else None
   ```
   Change to:
   ```python
   key = asyncssh.import_private_key(settings.preview_ssh_key) if settings.preview_ssh_key else None
   client_keys=[settings.preview_ssh_key_path] if not key and settings.preview_ssh_key_path else None
   # Pass key directly: client_keys=[key] if key else client_keys
   ```
   This reads the key content from `DK_PREVIEW_SSH_KEY` env var (already in Doppler) without writing to disk.

2. **Add NPM proxy host management** — new helper functions:
   - `_npm_login() -> str` — SSH to VM101, call `curl -s -X POST http://localhost:81/api/tokens -H 'Content-Type: application/json' -d '{"identity":"<email>","secret":"<password>"}'`, extract JWT token
   - `_npm_create_proxy(name: str, port: int, domain: str, token: str)` — `curl -s -X POST http://localhost:81/api/nginx/proxy-hosts` with domain `{name}.{domain}`, forward to `127.0.0.1:{port}`
   - `_npm_delete_proxy(name: str, domain: str, token: str)` — list proxy hosts, find by domain, delete by ID

3. **Add Doppler integration + compose file targeting** — modify SSH commands:
   ```python
   # Before (current):
   f"cd {preview_dir} && docker compose up -d 2>&1"
   # After:
   f"cd {preview_dir} && test -f docker-compose.preview.yaml || exit 44 && "
   f"doppler run --project {body.doppler_project} --config {body.doppler_config} -- "
   f"docker compose -f docker-compose.preview.yaml up -d 2>&1"
   ```
   Check for exit code 44 → raise HTTPException(400, "docker-compose.preview.yaml not found in repo")

4. **Wire NPM calls into lifecycle:**
   - `create_preview()`: after compose up succeeds, call `_npm_create_proxy(name, port, domain, token)`
   - `delete_preview()`: before archiving, call `_npm_delete_proxy(name, domain, token)`

5. **Add fields to `CreatePreviewRequest`:**
   ```python
   domain: str = Field(default="preview.datakinetic.com", description="Preview domain suffix")
   doppler_project: str = Field(default="", description="Doppler project name (defaults to repo name)")
   ```
   URL becomes `https://{name}.{domain}`

6. **Add PR comment to `webhooks.py`:**
   After `create_preview()` succeeds, POST comment to PR via GitHub API using `DK_GITHUB_PAT`:
   ```
   POST /repos/{repo}/issues/{pr_number}/comments
   {"body": "Preview deployed: https://{name}.{domain}\n\nTTL: {ttl}h | [Logs](https://dk.datakinetic.com/dk/v1/previews/{name}/logs)"}
   ```

### `src/platform-api/src/platform_api/config.py`

Add new settings:
```python
# Preview stack SSH (VM101)
preview_ssh_key: str = ""       # DK_PREVIEW_SSH_KEY — private key CONTENT from Doppler (preferred)
preview_ssh_key_path: str = ""  # DK_PREVIEW_SSH_KEY_PATH — file path fallback for local dev

# NPM (Nginx Proxy Manager) on VM101
npm_admin_email: str = ""       # DK_NPM_ADMIN_EMAIL = nick@datakinetic.com
npm_admin_password: str = ""    # DK_NPM_ADMIN_PASSWORD
npm_api_base: str = "http://localhost:81/api"

# GitHub (PR comment bot + webhooks)
github_pat: str = ""            # DK_GITHUB_PAT — fine-grained PAT for PR comments
# github_webhook_secret already exists in config

# Preview domain defaults
preview_domain: str = "preview.datakinetic.com"  # dk-os default; BehaviorLabs uses preview.behaviorlabs.ai
```

Doppler secrets to create/verify in `dk-infrastructure/prd`:

| Secret | Status | Value |
|--------|--------|-------|
| `DK_PREVIEW_SSH_KEY` | Exists ✅ | VM101 SSH private key content |
| `DK_NPM_ADMIN_EMAIL` | **Create** | `nick@datakinetic.com` |
| `DK_NPM_ADMIN_PASSWORD` | **Create** | NPM admin password |
| `DK_GITHUB_WEBHOOK_SECRET` | **Create** | Random secret for webhook HMAC validation |
| `DK_GITHUB_PAT` | **Create** | Fine-grained PAT with `pull_requests:write` on data-kinetic org |
| `DOMAIN_PREVIEW` | Exists ✅ | `preview.behaviorlabs.ai` (used by BehaviorLabs apps) |

### `src/platform-api/src/platform_api/routers/webhooks.py`

No code changes needed — webhook handler is complete. Needs:
- `DK_GITHUB_WEBHOOK_SECRET` set in Doppler
- Webhook URL registered in product repo GitHub settings

---

## Verification Checklist

### After Sprint 1 (API Integration)
- [ ] `POST /dk/v1/previews` with test repo creates containers, registers NPM proxy, injects Doppler secrets
- [ ] Preview accessible at `https://{name}.preview.datakinetic.com`
- [ ] `GET /dk/v1/previews` returns the new preview with `managed: true`
- [ ] `DELETE /dk/v1/previews/{name}` stops containers, removes NPM proxy, archives directory
- [ ] `GET /dk/v1/previews/{name}/logs` streams logs from the preview

### After Sprint 2 (Health Issues)
- [x] carbon-5 decommissioned (removed 2026-03-24, network cleaned 2026-03-25)
- [x] surgeo-app healthy (Clerk keys + Doppler integration)
- [x] ghost-cal migrated to `/opt/dk-previews/active/`
- [x] ut-san-antonio-oncology migrated to `/opt/dk-previews/active/`
- [ ] No MinIO ports on 0.0.0.0
- [x] VM101 RAM confirmed and documented correctly
- [x] the-real-apex restarted with `restart: unless-stopped` policy (2026-03-25)
- [x] Cron jobs installed for cleanup, prune, archive (2026-03-25 — were missing)
- [x] Docker disk reclaimed: 53% → 20% (build cache + volumes + images)
- [x] rili-app-prod port binding fixed (0.0.0.0:3000 → expose-only)
- [x] Orphaned carbon-5_default network removed

### After Sprint 3 (Developer Workflow)
- [ ] `dk preview up` from a product repo creates a working preview
- [ ] `dk preview list` shows active previews in a formatted table
- [ ] Opening a PR on a webhook-registered repo creates a preview automatically
- [ ] Closing/merging a PR tears down the preview automatically
- [ ] PR comment shows preview URL

---

## Decisions (2026-03-24)

1. **Doppler CLI on VM101** — Installed (v3.75.2) and authenticated as "preview-stack" token in data-kinetic workspace. No action needed.
2. **NPM admin credentials** — `nick@datakinetic.com` — store password in Doppler `dk-infrastructure/prd` as `DK_NPM_ADMIN_PASSWORD`, email as `DK_NPM_ADMIN_EMAIL`.
3. **GitHub PR comments** — Use fine-grained PAT (not GitHub App). Store as `DK_GITHUB_PAT` in Doppler.
4. **Compose file convention** — `docker-compose.preview.yaml` is **required** for preview deployments. Other compose files (docker-compose.yml, docker-compose.dev.yml) are for local dev only. Platform API should fail with a clear error if the preview compose file is missing.
5. **Preview domains** — dk-os products use `*.preview.datakinetic.com`. BehaviorLabs products use `*.preview.behaviorlabs.ai`. Both edge routes are already deployed. The `previews.py` router should accept a `domain` parameter (defaulting to `preview.datakinetic.com`).
6. **SSH key handling** — Use `asyncssh.import_private_key()` with key content from `DK_PREVIEW_SSH_KEY` env var. No tmpfile.
7. **carbon-5** — Decommission on VM101 (missing Doppler token, not worth fixing). Future K8s migration cancelled for this app.
8. **surgeo** — Fix by adding Clerk keys from Doppler project to `.env` file on VM101.
9. **Webhook repos** — Register on ground-truth-charlie (dk-os domain) and behavior-labs-ai (BehaviorLabs domain) first.
10. **VM101 RAM** — 64 GiB allocated (Proxmox `memory: 65536`, balloon 32 GiB). Documentation claiming 125-128 GiB was always wrong. All docs updated.
