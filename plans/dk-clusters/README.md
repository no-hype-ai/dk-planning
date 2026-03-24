# dk-clusters — Proxmox Cluster Management Plans

## Overview

[`dk-clusters`](https://github.com/data-kinetic/dk-clusters) manages the Proxmox cluster infrastructure: host configuration, VM lifecycle, storage, networking, K3s cluster operations, and disaster recovery for both **penguin** and **krang**.

This directory contains prioritized plans to align the current state with dk-planning documentation and resolve critical infrastructure gaps. The `dk-clusters` repo will be the operational home for cluster configs, scripts, and runbooks.

## Cluster Inventory

### penguin (Node 1 — Primary)
- **IP:** 192.168.10.8
- **CPU:** AMD EPYC 7773X (64C/128T)
- **RAM:** 995 GiB
- **Role:** K3s master, shared services, edge LB (phantom)
- **VMs:** k3s-master-1 (200), litellm (100), preview-stack (101), dk-shared-services (102), phantom (210)
- **Storage:** nvfast NVMe (9% healthy), local-lvm (7.6%), bulk-images 24TB (0.5%)

### krang (Node 2 — GPU/Compute)
- **IP:** 192.168.10.100
- **CPU:** AMD EPYC 7763 × 2 (128C/256T)
- **RAM:** 1 TiB
- **GPUs:** 8× NVIDIA A100
- **Role:** K3s worker, edge LB (venom), GPU inference
- **VMs:** k3s-slave-1 (201, JOINED), venom (211), vllm-minimax (220, 8× A100)
- **Storage:** local-lvm, bulk-images, nvfast (NVMe), models (2TB ZFS zvol)

### Quorum
- **QDevice:** 192.168.1.5:5403 (TLS, ffsplit algorithm)
- **Votes:** penguin (1) + krang (1) + QDevice (1) = 3 total, 2 required

## Priority Matrix

| # | Plan | Priority | Impact | Status | Issues |
|---|------|----------|--------|--------|--------|
| 01 | [Critical Fixes](01-critical-fixes.md) | P0 | Critical | **COMPLETE** | #290, #292, #295, vmfast — all resolved |
| 02 | [HA & Resilience](02-ha-and-resilience.md) | P1 | Critical | In progress — pods redistributed 55/45, CNPG standby on krang pending | #292 closed, spec-013 |
| 03 | [Backup & DR](03-backup-and-dr.md) | P1 | High | Partial — CNPG hourly backups to MinIO active, off-site replication + restore testing pending | #239, #243, spec-014 |
| 04 | [Network & Edge](04-network-and-edge.md) | P2 | Medium | Partial — edge failover verified (Mar 2026), VRRP monitoring pending | #294, #251, spec-009 |
| 05 | [Storage Optimization](05-storage-optimization.md) | P1 | High | **COMPLETE** — nvfast at 9%, PVC placement correct (staging MinIO storage class TBD) | spec-007 |
| 06 | [VM Lifecycle](06-vm-lifecycle.md) | P3 | Low | Backlog | spec-013 |
| 07 | [Proxmox Monitoring](07-proxmox-monitoring.md) | P1 | High | Not Started — hypervisor metrics blind spot, SOC 2 CC7.2 gap | — |

## Dependency Graph

```
01-Critical Fixes (P0, immediate)
  ├── 02-HA & Resilience (requires reflector + metrics fixed, krang join)
  │     └── 03-Backup & DR (requires multi-node for restore testing)
  └── 05-Storage Optimization (vmfast fix enables further work)

04-Network & Edge (independent)
06-VM Lifecycle (independent, low priority)
07-Proxmox Monitoring (requires 01 complete) ──► feeds 06 right-sizing + dk-alchemy/13 cost
```

## Key Decision

**K3s cluster expansion:** krang joined (#292 closed) — 2-node HA across physical hosts operational. Zone labels applied (`topology.kubernetes.io/zone`). Workload redistribution pending rolling restarts. Scarecrow planned as third node. No new K3s nodes on same host (same-host HA provides no hardware redundancy).

## dk-clusters Repository Structure

The [`dk-clusters`](https://github.com/data-kinetic/dk-clusters) repo will contain:

```
dk-clusters/
├── README.md                           # Cluster overview, host inventory
├── penguin/
│   ├── network/                        # Bridge configs, routes, iptables rules
│   ├── storage/                        # ZFS pool configs, storage class definitions
│   └── vms/                            # VM configs, cloud-init templates
├── krang/
│   ├── network/
│   ├── storage/
│   ├── vms/
│   └── gpu/                            # GPU passthrough config, vLLM setup
├── shared/
│   ├── corosync/                       # Cluster quorum config
│   ├── keepalived/                     # VRRP templates (source of truth for edge LBs)
│   └── templates/                      # VM templates (Ubuntu 24.04 cloud-init)
├── scripts/
│   ├── backup/                         # Proxmox backup scripts
│   ├── health/                         # Cluster health checks
│   ├── provision/                      # VM provisioning automation
│   └── storage/                        # Storage management utilities
├── runbooks/
│   ├── disaster-recovery.md            # Full DR procedure
│   ├── node-maintenance.md             # Drain, update, reboot procedures
│   ├── storage-expansion.md            # Adding storage to pools
│   ├── vm-migration.md                 # Moving VMs between hosts
│   └── edge-failover.md               # VRRP failover testing
└── monitoring/
    ├── dashboards/                     # Proxmox-specific Grafana dashboards
    └── alerts/                         # Storage, node, VRRP alerts
```

## Alignment with dk-planning Docs

| dk-planning Doc | Gap | Plan | Status |
|----------------|-----|------|--------|
| infrastructure.md | Single-node cluster, no HA | 02 | **RESOLVED** — 2-node cluster, zone labels applied |
| infrastructure.md | vmfast at 92.3% | 01, 05 | **RESOLVED** — nvfast at 9% |
| observability.md | Alloy namespace gap | 01 | **RESOLVED** — scraping all namespaces |
| disaster-recovery.md | No backup testing | 03 | Open — CNPG backups not yet configured |
| disaster-recovery.md | No off-site replication | 03 | Open — mc mirror not configured |
| disaster-recovery.md | No sentinel probe | 03 | Open — SSH blocker |
| infrastructure.md | Edge LB venom status | 04 | **RESOLVED** — edge failover verified Mar 2026 |
| platform-overview.md | VM naming inconsistent | 06 | Open — backlog |
| observability.md | No hypervisor/GPU metrics | 07 | Open — node_exporter, pve-exporter, DCGM not deployed |

## Alignment with dk-alchemy Specs

| Spec | Status | Plan |
|------|--------|------|
| 007-storage-consolidation | Draft | 05 |
| 009-infra-evolution | 98% complete | 04 |
| 012-k3s-cluster-reconciliation | Superseded by 013 | 02 |
| 013-dc-consolidation-ha | In progress | 02, 06 |
| 014-sentinel-probe-deployment | SSH blocker | 03 |

## Completion Log

| Date | Action | Details |
|------|--------|---------|
| 2026-03-23 | Phase 0 complete | All 4 critical fixes resolved: reflector, Alloy, vmfast, krang join |
| 2026-03-23 | HA workload redistribution | Rolling restarts distributed pods 55%/45% across k3s-master-1/k3s-slave-1 |
| 2026-03-23 | CNPG backups verified | ScheduledBackup active, 19+ hourly backups to MinIO s3://backups/postgres |
| 2026-03-23 | Edge failover verified | VRRP operational, all 8 TLS certs Ready, 28 ingress routes |
| 2026-03-23 | Cross-host routing fixed | Added MASQUERADE rule on krang for vmbr0→vmbr1 NAT (10.0.0.x) |
| 2026-03-23 | VM 200 HA enabled | k3s-master-1 now has Proxmox HA (max_restart=3, max_relocate=2) |
| 2026-03-23 | VM 102 onboot disabled | Stopped VM won't waste 96 GiB on reboot |
| 2026-03-23 | VM 101 right-sized | Memory reduced 128→64 GiB, freeing 64 GiB on penguin |
| 2026-03-23 | Stale pods cleaned | 132 Failed pods removed across all namespaces |
| 2026-03-23 | Grafana dashboards added | Edge VRRP + Storage Capacity dashboards, 4 alert rules |
| 2026-03-23 | keepalived_exporter added | Sidecar + Alloy scrape targets for VRRP metrics |

## Related Plans

- [dk-alchemy plans](../dk-alchemy/) — platform-level implementation plans
- [dk-template plans](../dk-template/) — repo scaffolding
