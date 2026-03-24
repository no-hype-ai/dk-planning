# Disaster Recovery

## Overview

This document covers backup strategy, recovery procedures, and multi-cluster readiness. Today, DR is partially addressed (sentinel-probe, some scripts in dk-alchemy), but there is no formalized runbook.

## Current State

### What Exists

| Component | DR Capability | Details |
|-----------|--------------|---------|
| **[ArgoCD](https://argo-cd.readthedocs.io/) state** | Fully recoverable | All Application/ApplicationSet definitions are in dk-alchemy's `.gitops/` — `kubectl apply -k .gitops/repositories/` rebuilds everything |
| **Infrastructure manifests** | Fully recoverable | All in Git (dk-alchemy `k8s/infrastructure/`) |
| **Application manifests** | Fully recoverable | All in Git (per product repo `.gitops/` and `k8s/`) |
| **Secrets** | Recoverable via [Doppler](https://docs.doppler.com/) | Doppler Operator re-syncs from SaaS on pod restart |
| **sentinel-probe** | External monitoring | AWS EC2 + WireGuard; detects outages from outside |
| **DR scripts** | Partial | `scripts/sentinel/` has provisioning and WireGuard setup |
| **[PostgreSQL](https://www.postgresql.org/docs/)** | CloudNativePG | 3-instance cluster operational. Backup schedule not yet configured — pending [dk-clusters Plan 03](../plans/dk-clusters/03-backup-and-dr.md) Phase 1 (CNPG scheduled backups to MinIO/S3) |
| **[MinIO](https://min.io/docs/minio/linux/index.html)** | Distributed mode | Data replication within cluster |
| **Observability data** | Not backed up | [Loki](https://grafana.com/docs/loki/latest/)/[Mimir](https://grafana.com/docs/mimir/latest/)/[Tempo](https://grafana.com/docs/tempo/latest/) on local-path-bulk; loss = loss of 30 days of metrics/logs/traces |

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
   k. ARC controller + runner AutoscalingRunnerSets
   l. Webhook service (depends on Doppler, GitHub App credentials)
5. External app bootstraps auto-sync:
   a. Product namespaces created
   b. DopplerSecrets synced
   c. Applications deployed
6. DNS (ddns-service updates Route53)
7. Sentinel-probe detects recovery
```

### Data Restoration

| Data Store | Backup Method | Restore Procedure | RPO Target |
|------------|---------------|-------------------|------------|
| PostgreSQL | CloudNativePG scheduled backups (daily full + continuous WAL archiving to MinIO/S3) | `kubectl cnpg restore <cluster> --backup <name>` or PITR with `--target-time` flag. Restore creates a new cluster from backup; update ArgoCD Application to point at recovered cluster. | 1h (continuous WAL) |
| MinIO | Distributed mode provides in-cluster redundancy. For off-cluster backup: scheduled `mc mirror` to external S3 bucket (daily). | `mc mirror` from backup S3 to restored MinIO. Verify bucket policies post-restore. | 4h (daily mirror) |
| [Redis](https://redis.io/docs/) | RDB snapshots via sentinel (default: every 15m if 1+ write). AOF disabled — acceptable for cache/ephemeral use. | Rebuild from scratch; Redis is used as cache/message broker. Persistent state lives in PostgreSQL. For queues: BullMQ jobs will be re-enqueued by producers on reconnect. | N/A (cache) |
| [OpenSearch](https://opensearch.org/docs/latest/) | Snapshot to MinIO via repository plugin (daily). | Register snapshot repo, `POST /_snapshot/<repo>/<snapshot>/_restore`. Verify index health post-restore. Needs investigation: snapshot automation not yet configured. | 4h (daily snapshot, once configured) |
| Observability (Loki/Mimir/Tempo) | None | Accept data loss; rebuild from apps re-emitting. 30-day retention means full history is never critical. | N/A (ephemeral) |

### RTO/RPO Targets

| Tier | Services | RTO Target | RPO Target | Rationale |
|------|----------|------------|------------|-----------|
| **Critical** | behavior-labs-ai (prod), PostgreSQL, edge LBs | 4h | 1h | Revenue-impacting, customer-facing. PostgreSQL WAL archiving provides continuous RPO. |
| **Important** | LiteLLM, DNS, webhook service, ARC controller | 8h | 4h | Platform services that block CI/CD and LLM access. Can tolerate brief outages. |
| **Standard** | Staging environments, observability, MinIO | 24h | 4h | Internal tooling. Staging can be rebuilt from Git. Observability data is ephemeral. |

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

1. **Active-passive:** Second [K3s](https://docs.k3s.io/) cluster on standby, ArgoCD syncs manifests but apps scaled to 0. On failover: scale up, update DNS.
2. **Active-active:** Both clusters serve traffic, [Keepalived](https://www.keepalived.org/manpage.html) or DNS-based failover. Requires shared database (CNPG standby replica) and shared object storage.
3. **Edge expansion:** Add more edge LB nodes using the existing matrix generator pattern — extend from 2 to N nodes.

## Testing

### Recommended DR Tests

| Test | Frequency | Method |
|------|-----------|--------|
| PostgreSQL restore | Weekly | Automated job: backup → restore to test namespace → validate |
| ArgoCD rebuild | Quarterly | Delete ArgoCD, re-bootstrap from `.gitops/repositories/` |
| Sentinel failover | Monthly | Simulate network partition, verify sentinel-probe alerts |
| Edge LB failover | Monthly | Stop one [Traefik](https://doc.traefik.io/traefik/)+Keepalived node, verify VIP migration |
| Full cluster rebuild | Annually | Rebuild K3s from scratch, follow runbook |

## Gaps

- **No PostgreSQL backups configured** — CNPG has backup capability but no scheduled backup or WAL archiving target is configured. Data loss risk is unbounded until this is addressed.
- **No automated backup verification** — backups may exist but are never tested
- **PVC locality constrains DR** — all PVCs are node-local (local-path provisioner). Draining k3s-master-1 causes downtime for stateful services. CNPG standby replicas on krang would mitigate for PostgreSQL.
- **No multi-cluster capability** — 2-node cluster operational (penguin + krang) but no cross-cluster failover
- **Observability data not backed up** — acceptable and documented as a conscious decision
- **OpenSearch snapshot automation** — snapshot repository plugin not yet configured
- **MinIO off-cluster mirror** — `mc mirror` schedule not yet implemented

## Related Documentation

- [Infrastructure](infrastructure.md) — data stores and storage classes
- [Secrets Management](secrets-management.md) — Doppler recovery
- [Platform Overview](platform-overview.md) — physical infrastructure
- [Observability](observability.md) — sentinel-probe external monitoring
