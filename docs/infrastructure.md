# Infrastructure

## Overview

All shared infrastructure is managed in [dk-alchemy](https://github.com/data-kinetic/dk-alchemy) under `k8s/infrastructure/`, deployed via [ArgoCD](https://argo-cd.readthedocs.io/) ApplicationSets. Each component follows the [Kustomize](https://kubectl.docs.kubernetes.io/references/kustomize/) base + overlay pattern.

## Data Stores

| Component | Technology | Details |
|-----------|-----------|---------|
| **[PostgreSQL](https://www.postgresql.org/docs/)** | CloudNativePG (PG 16.4) | 3-instance cluster with pod anti-affinity (`topology.kubernetes.io/zone`). Extensions: uuid-ossp, pg_trgm, vector, age. Custom image `ghcr.io/data-kinetic/dk-alchemy/postgres-cnpg:latest`. 50Gi on `local-path-fast` (NVMe). Backups not yet configured. |
| **[Redis](https://redis.io/docs/)** | Redis 7 (Alpine) | Single StatefulSet, AOF persistence, LRU eviction (256MB max), 10Gi on `local-path-fast` |
| **[SeaweedFS](https://github.com/seaweedfs/seaweedfs)** | SeaweedFS (distributed) | S3-compatible object storage for assets and backups. Replacing MinIO (maintenance mode Dec 2025). Apache 2.0 licensed. See [dk-planning#9](https://github.com/data-kinetic/dk-planning/issues/9). |
| **[OpenSearch](https://opensearch.org/docs/latest/)** | OpenSearch | Full-text search, log analytics |

## Networking & Edge

### In-Cluster Ingress

- **[Traefik](https://doc.traefik.io/traefik/)** — [K3s](https://docs.k3s.io/) default ingress controller via HelmChartConfig
- **cert-manager** — TLS with ClusterIssuers and wildcard certificates
- **Reflector** — Mirrors secrets/configmaps across namespaces (TLS certs)

### Edge Load Balancing

Two dedicated VMs running Traefik + [Keepalived](https://www.keepalived.org/manpage.html) for external ingress:

| Node | IP | Components |
|------|-----|-----------|
| **phantom** | 10.0.0.2 | Traefik, Keepalived, IngressRoutes |
| **venom** | 10.0.0.3 | Traefik, Keepalived, IngressRoutes |

Keepalived provides VIP failover:

| VIP | Network | Purpose |
|-----|---------|---------|
| 172.16.100.100 | DMZ | WAN1 primary ingress (phantom MASTER / venom BACKUP) |
| 172.16.100.101 | DMZ | WAN2 secondary ingress (venom MASTER / phantom BACKUP) |
| 192.168.1.100 | Core LAN | Hairpin access (phantom MASTER / venom BACKUP) |

Three VRRP instances (VI_WAN1, VI_WAN2, VI_CORE) ensure failover — each instance has a different MASTER node to distribute traffic across both edge LBs.

Managed via the `dk-edge-infrastructure` ApplicationSet (matrix generator (2 edge clusters × 2 shared components: traefik, routes) + list generator (2 per-node keepalived instances) = 6 Applications).

### IngressRoutes

Edge routes defined in `k8s/edge/routes/base/`:
- Production, staging, preview apps
- LiteLLM proxy
- Enercore
- DK-OS dev
- Data Kinetic preview

### DNS

Custom `ddns-service` (source in `src/`) handles Route53 dynamic DNS updates.

## Storage

| Storage Class | Backend | Use Case |
|---------------|---------|----------|
| `local-path-fast` | NVMe SSDs | Databases, high-IOPS workloads |
| `local-path-bulk` | Bulk storage | Observability backends ([Loki](https://grafana.com/docs/loki/latest/), [Mimir](https://grafana.com/docs/mimir/latest/), [Tempo](https://grafana.com/docs/tempo/latest/)), backups |

## Cluster Primitives

| Resource | Purpose |
|----------|---------|
| **PriorityClasses** | Workload scheduling priority tiers |
| **Namespaces** | Tenant isolation (behaviorlabs-prod/staging, dk-phantom-prod/staging, infra-staging) |
| **ResourceQuotas** | Staging environment resource caps |
| **LimitRanges** | Per-pod resource defaults/limits for staging |
| **NetworkPolicies** | Staging namespace isolation |

## Staging Isolation

Staging environments have explicit resource boundaries:
- **ResourceQuotas** — cap total CPU/memory per namespace
- **LimitRanges** — default and max per-pod resource limits
- **NetworkPolicies** — restrict cross-namespace communication

## Component Inventory

Full list of infrastructure components managed via `dk-infrastructure` ApplicationSet:

| Component | Namespace | Notes |
|-----------|-----------|-------|
| argocd | argocd | CD control plane |
| argocd-image-updater | argocd | Auto-updates image tags. Watches `ghcr.io/data-kinetic/dk-alchemy/*` images using the `newest-build` strategy with SHA tag pattern matching (7-40 character hex). Applied to components like ddns-service for automatic deployments. |
| alloy | infra | Grafana agent / OTLP collector (DaemonSet). Static scrape targets: LiteLLM (10.0.0.2:443), vLLM (192.168.10.101) |
| cert-manager | cert-manager | TLS certificate lifecycle |
| cnpg-operator | cnpg-system | CloudNativePG operator |
| doppler-operator | doppler-operator-system | [Doppler](https://docs.doppler.com/) secret sync |
| doppler-secrets | infra | DopplerSecret CRDs |
| [grafana](https://grafana.com/docs/grafana/latest/) | infra | Dashboards and alerting |
| kube-state-metrics | infra | K8s object metrics |
| loki | infra | Log aggregation (500Gi) |
| mimir | infra | Metrics storage (200Gi) |
| seaweedfs | infra | S3-compatible object storage (replacing MinIO — [dk-planning#9](https://github.com/data-kinetic/dk-planning/issues/9)) |
| namespaces | — | Tenant namespace definitions |
| opensearch | infra | Search engine |
| postgres | infra | CloudNativePG cluster |
| priority-classes | — | Scheduling priorities |
| prometheus-operator-crds | monitoring | CRDs only (no operator) |
| redis | infra | Cache / message broker |
| reflector | infra | Secret/configmap mirroring |
| probe-service | probe | Synthetic monitoring (18 targets: HTTP, DNS, TCP, external) |
| ddns-service | ddns | Route53 dynamic DNS updates |
| platform-api | infra | dk-alchemy Platform API — unified control plane (planned, see [Platform API](platform-api.md)) |
| penpot | penpot / penpot-staging | Open-source design tool (v2.4.2). Internal design workflow for DK team. Staging: `penpot.staging.behaviorlabs.ai`. Production: `penpot.behaviorlabs.ai`. See [Penpot](#penpot) below. |
| staging-isolation | infra-staging | Quotas, limits, network policies |
| storage-classes | — | Storage class definitions |
| tempo | infra | Distributed tracing (200Gi) |
| traefik | kube-system | In-cluster ingress (HelmChartConfig) |

## Penpot

[Penpot](https://penpot.app/) is an open-source design and prototyping tool deployed as an infrastructure service in dk-alchemy (not managed inside application repos).

**Manifests:** `k8s/infrastructure/penpot/` in [dk-alchemy](https://github.com/data-kinetic/dk-alchemy)

### Components

| Deployment | Port | Role |
|------------|------|------|
| `penpot-backend` | 6060 | API server (Clojure). Handles auth, persistence, file management. |
| `penpot-frontend` | 80 | Web UI (ClojureScript/React). Served via nginx. |
| `penpot-exporter` | 6061 | PDF/SVG export service (headless Chromium). |

### Configuration

- **Storage:** File-system assets (`/opt/data/assets` on PVC). Backend: `assets-fs`.
- **Database:** PostgreSQL at `postgres.infra.svc.cluster.local/penpot`
- **Cache:** Redis at `redis.infra.svc.cluster.local:6379/0`
- **Flags:** `enable-registration enable-login disable-demo-users enable-smtp enable-prepl-server`
- **Telemetry:** Disabled
- **Secrets:** Managed via Doppler operator (`DopplerSecret: penpot-doppler`)

### Environments

| Environment | URL | ArgoCD App | Namespace |
|-------------|-----|------------|-----------|
| Staging | `penpot.staging.behaviorlabs.ai` | `infra-penpot-staging` | `penpot-staging` |
| Production | `penpot.behaviorlabs.ai` | `infra-penpot` | `penpot` |

### Bootstrap Requirement

Before ArgoCD can sync Penpot to a new namespace, a Doppler service token must be created manually:

```bash
kubectl create secret generic doppler-token-secret \
  --namespace penpot-staging \
  --from-literal=serviceToken=<DOPPLER_SERVICE_TOKEN>
```

Token source: Doppler dashboard → project `dk-alchemy` → config `stg` (or `prd`) → Service Tokens.

### Access

Accessible to internal team only. No public exposure — Traefik ingress with TLS (wildcard cert). Registration enabled; demo users disabled.

### Related

- Original issue: [behavior-labs-ai#763](https://github.com/behavior-labs-ai/behavior-labs-ai/issues/763)
- Migration directive: [mercury-tasks#228](https://github.com/no-hype-ai/mercury-tasks/issues/228)

## Gaps

- **Node-local storage constrains HA** — `local-path` provisioner means PVCs on k3s-master-1 cannot be accessed from k3s-slave-1. Draining k3s-master-1 causes downtime for all stateful services bound to that node. This is the primary HA constraint. Stateless workloads are distributed across both nodes (55%/45% as of Mar 2026). CNPG standby replicas on krang would mitigate for PostgreSQL.
- **Edge LB scaling is manual** — adding a third node requires new Keepalived overlays and matrix generator updates
- **Single-replica observability backends** — Loki, Mimir, Tempo each run as a single replica; acceptable for current scale but a risk for availability
- **No automated capacity planning** — storage usage alerts exist but no proactive scaling

## Related Documentation

- [Platform Overview](platform-overview.md) — physical hosts, network topology
- [Observability](observability.md) — LGTM stack details
- [Secrets Management](secrets-management.md) — Doppler operator
- [Self-Hosted Runners & Webhook Service](self-hosted-runners-and-webhooks.md) — planned ARC runners (not yet deployed)
- [LiteLLM](litellm.md) — LLM proxy service
- [Platform API](platform-api.md) — dk-alchemy unified control plane
- [PR Review Service](pr-review-service.md) — PR critic service running on DK-OS agent-mesh (krang GPUs)
- [Disaster Recovery](disaster-recovery.md) — backup and restore for data stores
