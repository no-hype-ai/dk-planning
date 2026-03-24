# Plan 01: K8s/ArgoCD Migration

## Goal

Migrate DK-OS from Docker Compose on Megatron VM (192.168.10.88) to K3s cluster with ArgoCD GitOps. This is the **P0 critical path** — all other DK-OS platform work depends on this migration completing.

DK-OS will be the **first Docker Compose → K8s migration** in the platform. Patterns established here will inform carbon-5 and future onboarding.

## Current State

| Area | Current | Target |
|------|---------|--------|
| **Compute** | Megatron VM (4 vCPU / 32 GB), Docker Compose | K3s cluster (penguin + krang), ArgoCD |
| **Deployment** | `docker-compose.staging.yml` / `docker-compose.prod.yml` | Kustomize overlays, ArgoCD sync |
| **Networking** | Docker bridge, port mapping | Traefik IngressRoute, K8s Services |
| **Secrets** | Doppler via `docker run --env-file` | DopplerSecret CRD, Doppler Operator |
| **Images** | GHCR with sha/staging/semver tags | Same — ArgoCD Image Updater |
| **Database** | PostgreSQL 16 + PgBouncer on Megatron | CloudNativePG in cluster or VM-hosted |
| **Storage** | SeaweedFS on Megatron | SeaweedFS (dk-alchemy or in-cluster) |
| **Redis** | Redis 7 on Megatron | dk-alchemy shared Redis or dedicated |
| **Observability** | Local Grafana+Loki+Tempo → Alloy to cluster | Direct to dk-alchemy LGTM stack |
| **CI/CD** | Self-hosted runner on Megatron, matrix builds | Shared workflows, ARC v2 runners |

## Dependencies

| Dependency | Source | Status |
|-----------|--------|--------|
| dk-template scaffold | [dk-template](../../dk-template/) | Complete — init.sh ready |
| dk-alchemy bootstrap PR capacity | [dk-alchemy/11](../dk-alchemy/11-argocd-onboarding-scaffolds.md) | Not started |
| Doppler CRD operator | dk-alchemy infra | Operational |
| Available cluster capacity | dk-clusters | 2 nodes (penguin + krang), verify headroom |

---

## Phase 1: Scaffold & Manifests

### 1.1 Generate dk-template Scaffold

```bash
# Clone dk-template and generate DK-OS structure
gh repo create data-kinetic/dk-os-k8s --template data-kinetic/dk-template --private
cd dk-os-k8s
./scripts/init.sh --product dk-os --team megatron --service app --service portal --service web --service api
```

**Services to scaffold:**
| Service | Port | Notes |
|---------|------|-------|
| app | 3000 | Main Next.js frontend |
| portal | 3001 | Customer portal |
| web | 3002 | Marketing website |
| api | 3004 | NestJS backend (non-standard port — override in kustomize) |
| agent-mesh | 8765 | Python FastAPI — **manual scaffold** (see Plan 04) |
| email | — | Build-time only (React Email preview) — **skip K8s deploy** |
| adf-validator | — | Internal tool — **defer K8s deploy** |

**Post-scaffold adjustments:**
- Override api port from 3000 → 3004 in deployment.yaml and service.yaml
- Add PgBouncer sidecar or connection pooling configuration
- Update resource requests/limits based on Megatron current usage

### 1.2 Create Kustomize Manifests

For each service, customize the dk-template output:

**Base deployment adjustments:**
- Add `securityContext: runAsNonRoot: true` (align with dk-template/07 enforcement gaps)
- Set environment variables from DopplerSecret (DATABASE_URL, REDIS_URL, SEAWEEDFS_ENDPOINT, CLERK vars, OTEL vars)
- Add inter-service dependency annotations

**Overlay adjustments:**
- Production: replicas=2 for app/api, replicas=1 for portal/web
- Staging: replicas=1 for all
- HPA components: production for app/api, standard for portal/web

### 1.3 DopplerSecret Manifests

```yaml
# k8s/apps/doppler-secrets/base/doppler-secret.yaml
apiVersion: secrets.doppler.com/v1alpha1
kind: DopplerSecret
metadata:
  name: dk-os-secrets
spec:
  tokenSecret:
    name: doppler-token
  managedSecret:
    name: dk-os-secrets
    type: Opaque
```

Overlays:
- Production: Doppler config `prd_main`
- Staging: Doppler config `stg_main`

**Doppler project rename consideration:** Current project uses `dk-os` with configs `dev_main`, `stg_main`, `prd_main`. Platform convention is `<product>-applications` with `dev`, `stg`, `prd`. Decide: rename or keep existing.

---

## Phase 2: ArgoCD Bootstrap

### 2.1 dk-alchemy PR Content

Generate via dk-template `_dk-alchemy-pr/` directory:

**External app bootstraps:**
- `.gitops/external/dk-os-prod.yaml` → points to DK-OS repo main branch
- `.gitops/external/dk-os-staging.yaml` → points to DK-OS repo staging branch

**AppProject:**
- `.gitops/repositories/dk-os-bootstrap.yaml`
- Allowed namespaces: `dk-os-prod`, `dk-os-staging`
- Allowed repos: `https://github.com/data-kinetic/DK-OS`

**Alerting:**
- Slack contact point for `#megatron-alerts`
- Notification policy: `team=megatron` → contact point

### 2.2 Namespace Setup

Create K8s namespaces:
- `dk-os-prod`
- `dk-os-staging`

Add Doppler token secret to each namespace (one-time manual step or dk-cli automated).

### 2.3 ArgoCD Sync Verification

- [ ] ArgoCD discovers DK-OS Applications
- [ ] Sync status: `Healthy` + `Synced` for all services
- [ ] Image Updater annotations configured for staging auto-tag

---

## Phase 3: Data Store Migration

### 3.1 PostgreSQL

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **A: CloudNativePG (shared)** | Managed backups, HA, standard pattern | pgvector extension needed, 82-model schema is large, shared resource contention |
| **B: Dedicated CloudNativePG instance** | Isolation, pgvector guaranteed | More cluster resources, separate backup config |
| **C: Keep Megatron PostgreSQL (transitional)** | Zero data migration risk | VM dependency remains, cross-network latency |

**Recommended:** Option C initially (keep Megatron DB), migrate to Option B (dedicated CNPG) in Phase 5 after K8s services are stable.

**PgBouncer strategy:** Deploy as K8s sidecar in api deployment (same pattern as current Docker Compose PgBouncer).

### 3.2 Redis

**Recommended:** Use dk-alchemy shared Redis initially. DK-OS uses Redis for BullMQ queues, caching, and Socket.io presence — standard usage patterns.

If contention is observed, deploy dedicated Redis via Bitnami Helm chart.

### 3.3 SeaweedFS / Object Storage

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **A: ~~Switch to MinIO~~** | ~~Standard platform pattern~~ | ~~Migration of existing objects~~ — **Rejected: MinIO entered maintenance mode Dec 2025** |
| **B: Switch to dk-alchemy SeaweedFS** | Same storage engine, S3-compatible, shared management | Endpoint + credential change |
| **C: Keep Megatron SeaweedFS (transitional)** | Zero migration risk | VM dependency remains |

> **Updated 2026-03-24:** MinIO deprecated, SeaweedFS is platform standard. dk-alchemy is migrating from MinIO to SeaweedFS.

**Recommended:** Option C initially (keep Megatron SeaweedFS), migrate to Option B (dk-alchemy SeaweedFS) after K8s migration stable. Same storage engine — requires only endpoint + credential changes.

### 3.4 LiteLLM

**Action:** Point to dk-litellm HA VM at `llm.behaviorlabs.ai` instead of local LiteLLM instance. Update Doppler config with new endpoint.

---

## Phase 4: DNS & Ingress

### 4.1 Traefik IngressRoutes

Create IngressRoute for each public-facing service:

| Service | Domain | Notes |
|---------|--------|-------|
| app | `app.dk-os.datakinetic.com` (or custom) | Main UI |
| portal | `portal.dk-os.datakinetic.com` | Customer-facing |
| web | `dk-os.datakinetic.com` | Marketing site |
| api | `api.dk-os.datakinetic.com` | Backend API |

**TLS:** Use existing Traefik + cert-manager setup from dk-alchemy.

### 4.2 Internal Service Communication

- app → api: K8s service DNS (`dk-os-api.dk-os-prod.svc.cluster.local:3004`)
- portal → api: Same pattern
- api → PostgreSQL: Direct connection or via PgBouncer sidecar
- api → Redis: `redis.dk-alchemy.svc.cluster.local:6379` (shared)
- api → SeaweedFS: Megatron endpoint initially, later dk-alchemy SeaweedFS

---

## Phase 5: Cutover

### 5.1 Pre-Cutover Checklist

- [ ] All services healthy in staging on K8s for 48+ hours
- [ ] Database connectivity verified (latency < 5ms for in-cluster queries)
- [ ] All webhook endpoints reachable (Clerk, GitHub, Stripe, Linear, Jira, Slack, Intercom)
- [ ] Socket.io real-time presence working through K8s networking
- [ ] BullMQ workers processing jobs successfully
- [ ] File uploads/downloads via SeaweedFS working
- [ ] Health endpoints responding (`/health`, `/ready`)
- [ ] Grafana dashboards showing DK-OS metrics
- [ ] DNS records prepared (low TTL during migration)

### 5.2 Migration Steps

1. **Set DNS TTL to 60s** (48 hours before cutover)
2. **Enable maintenance mode** on Megatron DK-OS
3. **Final database sync** (if using Option C — pg_dump/restore or logical replication)
4. **Switch DNS** to K8s ingress VIP
5. **Verify all services** responding correctly
6. **Monitor 24 hours** — compare error rates, latency, throughput
7. **Disable Megatron services** (keep VM for 7 days as rollback)
8. **Update DNS TTL** back to standard

### 5.3 Rollback Plan

If issues detected during cutover:
1. Switch DNS back to Megatron IP (192.168.10.88)
2. Re-enable Megatron services
3. Investigate and fix K8s issues
4. Retry cutover

---

## Phase 6: Post-Migration Cleanup

- [ ] Remove Megatron self-hosted runner (move to ARC v2)
- [ ] Remove Docker Compose deployment files (or archive)
- [ ] Remove staging readiness gate workflow (replaced by ArgoCD sync)
- [ ] Update DK-OS CLAUDE.md with K8s deployment patterns
- [ ] Decommission Megatron VM (after 30-day observation period)
- [ ] Update dk-planning docs to reflect DK-OS on K8s

---

## Files to Create/Modify

### In DK-OS repo:
```
.gitops/
  dk-os-root-app-prod.yaml
  dk-os-root-app-staging.yaml
  prod/apps/
    00-project.yaml
    app.yaml, portal.yaml, web.yaml, api.yaml
    doppler-secrets.yaml
  staging/apps/
    (same structure)
  local/apps/
    docker-compose.yaml (keep for local dev)
k8s/
  apps/app/base/ + overlays/
  apps/portal/base/ + overlays/
  apps/web/base/ + overlays/
  apps/api/base/ + overlays/
  apps/doppler-secrets/base/ + overlays/
monitoring/
  dashboards/app-overview.json, portal-overview.json, web-overview.json, api-overview.json
  alerts/app.yaml, portal.yaml, web.yaml, api.yaml
```

### In dk-alchemy repo:
```
.gitops/external/dk-os-prod.yaml
.gitops/external/dk-os-staging.yaml
.gitops/repositories/dk-os-bootstrap.yaml
grafana/provisioning/alerting/contact-points.yaml (add entry)
grafana/provisioning/alerting/notification-policies.yaml (add route)
```

---

## Verification

- [ ] `kubectl get pods -n dk-os-prod` shows all services Running
- [ ] ArgoCD dashboard shows DK-OS Applications as Synced + Healthy
- [ ] Health endpoints respond: `curl https://app.dk-os.datakinetic.com/health`
- [ ] BullMQ workers processing jobs (check Redis queue depth)
- [ ] WebSocket connections working (Socket.io presence)
- [ ] File uploads via SeaweedFS working
- [ ] Grafana dashboards populated with DK-OS metrics
- [ ] Alert rules configured and testable
- [ ] Staging deploy triggered by push to staging branch

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| PostgreSQL migration data loss | Service outage, data corruption | Keep Megatron DB initially (Option C), migrate later with full backup |
| Socket.io through K8s networking | Real-time features broken | Test WebSocket through Traefik IngressRoute early |
| Webhook endpoints unreachable | Integrations broken (GitHub, Stripe, Clerk) | Verify each webhook individually pre-cutover |
| Resource underprovisioning | Pod OOMKills, CPU throttle | Base resource requests on Megatron usage data |
| Agent-mesh Python service incompatible | AI features down | Defer agent-mesh to Plan 04, migrate Node.js services first |
| DNS propagation delay | Split traffic during cutover | Low TTL 48h before, maintenance mode during switch |
