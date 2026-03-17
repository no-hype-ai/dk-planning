# Infrastructure

## Overview

All shared infrastructure is managed in [dk-alchemy](https://github.com/data-kinetic/dk-alchemy) under `k8s/infrastructure/`, deployed via ArgoCD ApplicationSets. Each component follows the Kustomize base + overlay pattern.

## Data Stores

| Component | Technology | Details |
|-----------|-----------|---------|
| **PostgreSQL** | CloudNativePG (PG 16.4) | pgvector extension, 50Gi on `local-path-fast` (NVMe) |
| **Redis** | Redis with HA sentinel | Sentinel mode in prod for failover |
| **MinIO** | MinIO (distributed mode) | Object storage for assets, backups |
| **OpenSearch** | OpenSearch | Full-text search, log analytics |

## Networking & Edge

### In-Cluster Ingress

- **Traefik** — K3s default ingress controller via HelmChartConfig
- **cert-manager** — TLS with ClusterIssuers and wildcard certificates
- **Reflector** — Mirrors secrets/configmaps across namespaces (TLS certs)

### Edge Load Balancing

Two dedicated VMs running Traefik + Keepalived for external ingress:

| Node | IP | Components |
|------|-----|-----------|
| **phantom** | 10.0.0.2 | Traefik, Keepalived, IngressRoutes |
| **venom** | 10.0.0.3 | Traefik, Keepalived, IngressRoutes |

Keepalived provides VIP failover:
- `172.16.100.100` (DMZ primary)
- `172.16.100.101` (DMZ secondary)
- `192.168.1.100` (Core LAN hairpin)

Managed via the `dk-edge-infrastructure` ApplicationSet (matrix generator: 2 clusters x 3 components).

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
| `local-path-bulk` | Bulk storage | Observability backends (Loki, Mimir, Tempo), backups |

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
| argocd-image-updater | argocd | Auto-updates image tags |
| alloy | infra | Grafana agent / OTLP collector (DaemonSet) |
| cert-manager | cert-manager | TLS certificate lifecycle |
| cnpg-operator | cnpg-system | CloudNativePG operator |
| doppler-operator | doppler-operator-system | Doppler secret sync |
| doppler-secrets | infra | DopplerSecret CRDs |
| grafana | infra | Dashboards and alerting |
| kube-state-metrics | infra | K8s object metrics |
| loki | infra | Log aggregation (500Gi) |
| mimir | infra | Metrics storage (200Gi) |
| minio | infra | Object storage |
| namespaces | — | Tenant namespace definitions |
| opensearch | infra | Search engine |
| postgres | infra | CloudNativePG cluster |
| priority-classes | — | Scheduling priorities |
| prometheus-operator-crds | monitoring | CRDs only (no operator) |
| redis | infra | Cache / message broker |
| reflector | infra | Secret/configmap mirroring |
| staging-isolation | infra-staging | Quotas, limits, network policies |
| storage-classes | — | Storage class definitions |
| tempo | infra | Distributed tracing (200Gi) |
| traefik | kube-system | In-cluster ingress (HelmChartConfig) |
| arc-controller | arc-system | Actions Runner Controller v2 (Helm) |
| arc-runners | arc-system | AutoscalingRunnerSets: standard, large, gpu |
| webhook-service | infra | FastAPI webhook handler for cross-repo events |
| kyverno | kyverno | Policy engine for admission control (planned) |

## Gaps

- **Edge LB scaling is manual** — adding a third node requires new Keepalived overlays and matrix generator updates
- **Single-replica observability backends** — Loki, Mimir, Tempo each run as a single replica; acceptable for current scale but a risk for availability
- **No automated capacity planning** — storage usage alerts exist but no proactive scaling

## Related Documentation

- [Platform Overview](platform-overview.md) — physical hosts, network topology
- [Observability](observability.md) — LGTM stack details
- [Secrets Management](secrets-management.md) — Doppler operator
- [Self-Hosted Runners & Webhook Service](self-hosted-runners-and-webhooks.md) — ARC runners and webhook service details
- [PR Review Service](pr-review-service.md) — PR critic service running on lithium-5 (krang GPUs)
- [Disaster Recovery](disaster-recovery.md) — backup and restore for data stores
