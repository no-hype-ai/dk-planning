# Disaster Recovery

## Overview

This document covers backup strategy, recovery procedures, and multi-cluster readiness. Today, DR is partially addressed (sentinel-probe, some scripts in dk-alchemy), but there is no formalized runbook.

## Current State

### What Exists

| Component | DR Capability | Details |
|-----------|--------------|---------|
| **ArgoCD state** | Fully recoverable | All Application/ApplicationSet definitions are in dk-alchemy's `.gitops/` — `kubectl apply -k .gitops/repositories/` rebuilds everything |
| **Infrastructure manifests** | Fully recoverable | All in Git (dk-alchemy `k8s/infrastructure/`) |
| **Application manifests** | Fully recoverable | All in Git (per product repo `.gitops/` and `k8s/`) |
| **Secrets** | Recoverable via Doppler | Doppler Operator re-syncs from SaaS on pod restart |
| **sentinel-probe** | External monitoring | AWS EC2 + WireGuard; detects outages from outside |
| **DR scripts** | Partial | `scripts/sentinel/` has provisioning and WireGuard setup |
| **PostgreSQL** | CloudNativePG | Has backup capabilities but backup schedule/target not documented here |
| **MinIO** | Distributed mode | Data replication within cluster |
| **Observability data** | Not backed up | Loki/Mimir/Tempo on local-path-bulk; loss = loss of 30 days of metrics/logs/traces |

### What's Missing

- No documented recovery runbook with step-by-step ordering
- No automated backup verification (restore tests)
- No RTO/RPO targets defined
- No multi-cluster failover capability
- Observability data is not replicated or backed up

## Recovery Runbook (Target)

### Bootstrap Order

If the cluster is rebuilt from scratch:

```
1. Proxmox hosts operational (penguin, krang)
2. K3s cluster bootstrapped
3. kubectl apply -k .gitops/repositories/    ← single manual step
4. ArgoCD comes up, begins syncing:
   a. Doppler Operator → secrets available
   b. Storage classes, PriorityClasses, Namespaces
   c. cert-manager → TLS certificates
   d. PostgreSQL (CloudNativePG) → restore from backup
   e. Redis, MinIO, OpenSearch
   f. LGTM stack (Loki, Mimir, Tempo, Alloy, Grafana)
   g. Traefik (in-cluster)
   h. Edge LBs (phantom, venom) → Keepalived VIPs
   i. kube-state-metrics, prometheus-operator-crds
   j. ArgoCD Image Updater
5. External app bootstraps auto-sync:
   a. Product namespaces created
   b. DopplerSecrets synced
   c. Applications deployed
6. DNS (ddns-service updates Route53)
7. Sentinel-probe detects recovery
```

### Data Restoration

<!-- TODO: Document specific backup/restore procedures for each data store -->

| Data Store | Backup Method | Restore Procedure | RPO Target |
|------------|---------------|-------------------|------------|
| PostgreSQL | CloudNativePG scheduled backups | `cnpg restore` from backup location | <!-- TODO --> |
| MinIO | <!-- TODO --> | <!-- TODO --> | <!-- TODO --> |
| Redis | <!-- TODO: RDB/AOF? --> | <!-- TODO --> | <!-- TODO --> |
| OpenSearch | <!-- TODO --> | <!-- TODO --> | <!-- TODO --> |
| Observability (Loki/Mimir/Tempo) | None | Accept data loss; rebuild from apps re-emitting | N/A (ephemeral) |

### RTO/RPO Targets

<!-- TODO: Define targets per service tier -->

| Tier | Services | RTO Target | RPO Target |
|------|----------|------------|------------|
| **Critical** | behavior-labs-ai (prod), PostgreSQL | <!-- TODO --> | <!-- TODO --> |
| **Important** | LiteLLM, edge LBs, DNS | <!-- TODO --> | <!-- TODO --> |
| **Standard** | Staging environments, observability | <!-- TODO --> | <!-- TODO --> |

## Backup Strategy (Recommendations)

### 1. PostgreSQL (CloudNativePG)

- Schedule automated backups (daily full + continuous WAL archiving)
- Backup target: MinIO bucket or external S3
- Test restores weekly (automated job)
- Document point-in-time recovery (PITR) procedure

### 2. MinIO

- Enable cross-site replication if a second cluster exists
- Or: scheduled `mc mirror` to external S3 bucket
- Backup bucket policies and IAM configuration

### 3. Observability Data

Accept that observability data is ephemeral (30-day retention, local storage). If longer retention is needed:
- Configure Mimir to write blocks to S3/MinIO for long-term storage
- Configure Loki with S3/MinIO backend for chunk storage
- Tempo already uses local filesystem; S3 backend available

### 4. Secrets

Doppler SaaS is the source of truth — no local backup needed. Ensure:
- Doppler account has MFA enabled
- Service tokens can be regenerated
- Document which Doppler projects/configs exist per product

### 5. Git State

All GitOps state is in GitHub. Ensure:
- dk-alchemy and critical repos have branch protection
- No force-push to main allowed
- Consider GitHub-to-secondary-git mirror for catastrophic GitHub outage

## Multi-Cluster Readiness

### Current Foundation

The `dk-edge-infrastructure` ApplicationSet's **matrix generator** (2 clusters x 3 components) is a natural template for multi-cluster. The pattern already handles:
- Per-cluster server addresses
- Per-cluster overlays
- Federated deployment from a single control plane

### Path to Multi-Cluster

<!-- TODO: Expand when multi-cluster becomes a priority -->

1. **Active-passive:** Second K3s cluster on standby, ArgoCD syncs manifests but apps scaled to 0. On failover: scale up, update DNS.
2. **Active-active:** Both clusters serve traffic, Keepalived or DNS-based failover. Requires shared database (CNPG standby replica) and shared object storage.
3. **Edge expansion:** Add more edge LB nodes using the existing matrix generator pattern — extend from 2 to N nodes.

## Testing

### Recommended DR Tests

| Test | Frequency | Method |
|------|-----------|--------|
| PostgreSQL restore | Weekly | Automated job: backup → restore to test namespace → validate |
| ArgoCD rebuild | Quarterly | Delete ArgoCD, re-bootstrap from `.gitops/repositories/` |
| Sentinel failover | Monthly | Simulate network partition, verify sentinel-probe alerts |
| Edge LB failover | Monthly | Stop one Traefik+Keepalived node, verify VIP migration |
| Full cluster rebuild | Annually | Rebuild K3s from scratch, follow runbook |

## Gaps

- **No documented runbook** — recovery steps are tribal knowledge
- **No RTO/RPO targets** — no agreed-upon recovery time objectives
- **No automated backup verification** — backups may exist but are never tested
- **No multi-cluster capability** — single cluster, single point of failure
- **Observability data not backed up** — acceptable but should be a conscious decision

## Related Documentation

- [Infrastructure](infrastructure.md) — data stores and storage classes
- [Secrets Management](secrets-management.md) — Doppler recovery
- [Platform Overview](platform-overview.md) — physical infrastructure
- [Observability](observability.md) — sentinel-probe external monitoring
