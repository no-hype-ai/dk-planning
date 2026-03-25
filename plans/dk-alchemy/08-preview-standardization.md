# Preview Environment Standardization

## Context

VM101 (preview-stack) runs ad-hoc docker-compose projects with Nginx Proxy Manager. The standardization effort has completed infrastructure hardening (Phases 0-2) but the Platform API integration is not yet end-to-end functional. Additionally, K8s per-PR ephemeral environments are planned but not implemented.

See [dk-preview-stack/03-migration-status-and-gaps.md](../dk-preview-stack/03-migration-status-and-gaps.md) for the comprehensive live audit, issue inventory, and cross-repo dependency map.

## Current Status (2026-03-24)

| Component | Status | Notes |
|-----------|--------|-------|
| Edge routes (Traefik) | Done | `preview-stack.yaml`, `datakinetic-preview.yaml` deployed |
| Platform API endpoints | Merged (PR #342) | CRUD + health + logs — code complete but not end-to-end functional |
| SSH key in Doppler | **Not done** | P0 blocker — API can't SSH to VM101 |
| NPM proxy automation | **Not done** | `create_preview()` doesn't register proxy host |
| Doppler secrets injection | **Not done** | `docker compose up` runs without secrets |
| dk-cli commands | **Not started** | Phase 4 of standardization plan |
| GitHub webhook handler | Done (code) | `webhooks.py` handles PR events — but no repo has webhook registered |
| Grafana dashboard | Done (PR #350) | VM101 metrics visible |
| Cleanup automation | Done | Hourly TTL + weekly prune + daily archive cron |

## Scope

- Standardize VM-based previews via Platform API + dk-cli
- Create docker-compose.preview.yaml template in dk-template
- Automate NPM proxy host configuration
- Implement TTL-based cleanup
- Design K8s per-PR preview environments (ArgoCD ApplicationSet + pull-request generator)
- **New:** Migrate production apps (enercore, carbon-5, abts-surgeo) from VM101 to K8s (future)

## Dependencies

- Plan 01 (Platform API) — preview endpoints needed for orchestration
- dk-template — generates preview docker-compose config
- [dk-preview-stack/03-migration-status-and-gaps.md](../dk-preview-stack/03-migration-status-and-gaps.md) — comprehensive gap analysis

## Existing Work

- dk-alchemy: `k8s/edge/routes/base/preview-stack.yaml`, `datakinetic-preview.yaml` (deployed)
- dk-alchemy: `src/platform-api/src/platform_api/routers/previews.py` (merged, needs NPM + Doppler)
- dk-alchemy: `src/platform-api/src/platform_api/routers/webhooks.py` (merged, needs webhook registration)
- dk-alchemy specs: 009-infra-evolution (preview stack as P3)
- dk-planning docs: preview-environments.md, gitops-and-cd.md (K8s previews)
- dk-template: `docker-compose.preview.yaml` (basic template exists)

## Implementation Steps

### Phase 1: VM Preview Standardization

**1a. Unblock API integration (P0 — dk-alchemy code changes):**

1. ~~Store VM101 SSH key in Doppler~~ — already exists as `DK_PREVIEW_SSH_KEY` ✅
2. **Refactor SSH key handling in `previews.py`:**
   - Add `preview_ssh_key: str = ""` to `config.py` (reads `DK_PREVIEW_SSH_KEY` content)
   - Change `_ssh_run()` to use `asyncssh.import_private_key(settings.preview_ssh_key)` — passes key content directly, no tmpfile
   - Keep `preview_ssh_key_path` as fallback for local dev where a file path is more convenient
3. Store NPM admin credentials in Doppler `dk-infrastructure/prd`: `DK_NPM_ADMIN_EMAIL` = `nick@datakinetic.com`, `DK_NPM_ADMIN_PASSWORD`
4. Store GitHub secrets in Doppler: `DK_GITHUB_WEBHOOK_SECRET` (random), `DK_GITHUB_PAT` (fine-grained PAT with `pull_requests:write`)
5. Add new config settings to `config.py`:
   ```python
   preview_ssh_key: str = ""       # DK_PREVIEW_SSH_KEY — key content (preferred)
   preview_ssh_key_path: str = ""  # file path fallback for local dev
   npm_admin_email: str = ""       # DK_NPM_ADMIN_EMAIL
   npm_admin_password: str = ""    # DK_NPM_ADMIN_PASSWORD
   npm_api_base: str = "http://localhost:81/api"
   github_pat: str = ""            # DK_GITHUB_PAT
   preview_domain: str = "preview.datakinetic.com"
   ```
6. Add NPM proxy host management to `previews.py`:
   - `_npm_login()` — SSH to VM101, `curl POST /api/tokens` with admin creds, return JWT
   - `_npm_create_proxy(name, port, domain, token)` — create proxy host `{name}.{domain}` → `127.0.0.1:{port}`
   - `_npm_delete_proxy(name, domain, token)` — list hosts, find by domain, delete by ID
7. Add Doppler secrets injection + compose file targeting:
   - Change compose command to `doppler run --project {project} --config {config} -- docker compose -f docker-compose.preview.yaml up -d`
   - Doppler CLI is installed (v3.75.2) and authenticated on VM101 ✅
   - Fail with 400 if `docker-compose.preview.yaml` not found (other compose files are for local dev only)
8. Add new fields to `CreatePreviewRequest`:
   - `domain: str = "preview.datakinetic.com"` — dk-os default, BehaviorLabs passes `preview.behaviorlabs.ai`
   - `doppler_project: str = ""` — defaults to repo name if empty
9. Wire NPM calls into `create_preview()` (after compose up) and `delete_preview()` (before archive)
10. Add PR comment posting to `webhooks.py` — use `DK_GITHUB_PAT` to post preview URL on PR open, teardown confirmation on PR close

**1b. Standard template (dk-template):**
- docker-compose.preview.yaml template exists (basic) — may need enhancement for multi-service apps
- .env.preview file with Doppler injection points

**1c. dk-cli integration (Phase 4 of standardization plan):**
- `dk preview up` — auto-detect repo/branch, call `POST /dk/v1/previews`
- `dk preview down <name>` — call `DELETE /dk/v1/previews/{name}`
- `dk preview list` — formatted table from `GET /dk/v1/previews`
- `dk preview logs <name>` — stream from `GET /dk/v1/previews/{name}/logs`

**1d. Automation:**
- Register GitHub webhook on product repos → `https://dk.datakinetic.com/dk/v1/webhooks/github`
- TTL-based cleanup: 72h default (cron already running, but existing metas need realistic TTLs)
- PR comment bot: extend `webhooks.py` to post preview URL on PR open

### Phase 2: K8s Per-PR Previews (Future)

6. Create ArgoCD ApplicationSet with pull-request generator:
   - On PR open: create `<app>-preview-<pr>` namespace
   - Deploy from PR branch using product repo's k8s/ manifests
   - IngressRoute at `pr-<number>.preview.<domain>`
   - On PR close/merge: prune namespace (ArgoCD automated cleanup)
7. Add PR comment bot that posts preview URL
8. Resource limits on preview namespaces (prevent cluster overload)

### Phase 3: Production App Migration (Future)

9. Design K8s manifests for enercore (15 containers — full LGTM stack + SeaweedFS + Unleash + Mongo)
10. ~~Design K8s manifests for carbon-5~~ — **Decommissioned** on VM101 (2026-03-24, missing Doppler token)
11. Design K8s manifests for abts-surgeo (1 container)
12. Staged migration with rollback plan (abts-surgeo first, then enercore)
13. Right-size VM101: reduce from 64 GiB → 32 GiB RAM (balloon already at 32 GiB), reassess 16 vCPU

## dk-alchemy Changes

- MODIFY: `src/platform-api/src/platform_api/config.py` (add NPM settings)
- MODIFY: `src/platform-api/src/platform_api/routers/previews.py` (add NPM + Doppler integration)
- NO CHANGE: `src/platform-api/src/platform_api/routers/webhooks.py` (code complete — needs external config)
- CREATE: `docs/runbooks/preview-management.md` (operational runbook)
- For Phase 2: CREATE k8s ApplicationSet for PR previews
- For Phase 3: CREATE k8s manifests for production apps

## Other Repo Changes

- MODIFY: dk-template (enhance docker-compose.preview.yaml for multi-service apps)
- MODIFY: dk-clusters `docs/vm-inventory.md` (correct RAM: 62 GiB not 128 GiB)
- MODIFY: product repos (register GitHub webhooks)

## Verification

- `POST /dk/v1/previews` from a product repo creates working preview at `*.preview.datakinetic.com`
- Preview has correct environment variables (Doppler-injected)
- NPM proxy host is created automatically and removed on delete
- `dk preview list` shows active previews with URLs and age
- Preview auto-cleans after TTL expiry
- GitHub webhook creates preview on PR open and tears down on PR close

## Options/Recommendations

**Preview cleanup:**
- **Option A (Recommended): TTL-based** — 72h default, configurable via API. Simple, predictable. Already partially working.
- **Option B: PR-linked** — Tear down when source branch is deleted or PR is merged. More responsive but requires GitHub webhook integration.
- **Recommendation:** Both — TTL as safety net (already running), PR-linked for responsiveness (webhook code exists, needs registration).

**Production app migration:**
- **Recommendation:** Migrate to K8s eventually. Start with abts-surgeo (simplest), then carbon-5, then enercore (most complex). This frees VM101 resources for its intended preview-only role.
