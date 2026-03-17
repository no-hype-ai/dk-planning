# Platform Overview

## Architecture

Data Kinetic runs a self-hosted Kubernetes platform on bare-metal Proxmox hosts, using a GitOps-driven app-of-apps model. The platform is split into two layers:

- **Platform layer** ([dk-alchemy](https://github.com/data-kinetic/dk-alchemy)) — owns all shared infrastructure, the ArgoCD control plane, observability stack, edge networking, and secrets management.
- **Product layer** — individual repos that own their application code, deployment manifests, and monitoring contributions. Each product repo integrates with dk-alchemy's app-of-apps pattern to receive automated CD.

```
┌──────────────────────────────────────────────────────────┐
│  dk-alchemy (platform layer)                              │
│  ├── ArgoCD control plane (app-of-apps)                   │
│  ├── LGTM observability stack                             │
│  ├── Shared data stores (PostgreSQL, Redis, MinIO, etc.)  │
│  ├── Edge networking (Traefik, Keepalived VIPs)           │
│  ├── Secrets management (Doppler Operator)                │
│  └── Bootstraps for all product repos                     │
├──────────────────────────────────────────────────────────┤
│  Product repos (app layer)                                │
│  ├── behavior-labs-ai   (reference implementation)        │
│  ├── dk-compliance-v2                                     │
│  ├── DK-OS                                                │
│  ├── carbon-5                                             │
│  └── lithium-5                                            │
└──────────────────────────────────────────────────────────┘
```

## Physical Infrastructure

### Proxmox Hosts

| Host | CPU | RAM | GPU | Role |
|------|-----|-----|-----|------|
| **penguin** | AMD EPYC 7773X | ~1TB | — | Primary K3s cluster, general workloads |
| **krang** | AMD EPYC 7763 | 1TiB | 8x A100 80GB | GPU workloads, ML/AI inference |

### Network Architecture

| Network | CIDR | Purpose |
|---------|------|---------|
| Core | 192.168.1.0/24 | Management, primary LAN |
| Corpnet VLAN 10 | 192.168.10.0/24 | Corporate network |
| Cluster isolated | 10.0.0.0/24 | K3s inter-node communication |
| DMZ VLAN 100 | 172.16.100.0/24 | Public-facing edge LBs |

### K3s Clusters

- **Main cluster** — runs on penguin/krang, hosts all workloads
- **Edge LB nodes** — 2 dedicated VMs (phantom at 10.0.0.2, venom at 10.0.0.3) running Traefik + Keepalived for VIP failover

### VIPs (Keepalived)

| VIP | Network | Purpose |
|-----|---------|---------|
| 172.16.100.100 | DMZ | Primary external ingress |
| 172.16.100.101 | DMZ | Secondary external ingress |
| 192.168.1.100 | Core LAN | Hairpin / internal access |

## Product Portfolio

### Post-Consolidation (Target State)

| Product | Repository | Deployment | Stack | Notes |
|---------|------------|------------|-------|-------|
| **BehaviorLabs AI** | [behavior-labs-ai](https://github.com/data-kinetic/behavior-labs-ai) | K8s / ArgoCD | NestJS, Next.js, PostgreSQL (pgvector), Redis, MinIO | Production reference implementation |
| **BehaviorLabs Web** | [behavior-labs-web](https://github.com/data-kinetic/behavior-labs-web) | K8s / ArgoCD | — | Production |
| **Carbon-5** | [carbon-5](https://github.com/data-kinetic/carbon-5) | K8s / ArgoCD (target) | NestJS, Next.js, Drizzle, Prefect 3, PostgreSQL, Redis, SeaweedFS | Data pipeline + AI workflow platform. Absorbing agent-mesh + dk-data-fe |
| **DK-OS** | [DK-OS](https://github.com/data-kinetic-projects/DK-OS) | K8s / ArgoCD (target) | NestJS, Next.js, Prisma, PostgreSQL, Redis, SeaweedFS | Business operating system. Absorbing dk-mercury + dk-phantom |
| **Lithium-5** | [lithium-5](https://github.com/data-kinetic/lithium-5) | K8s / ArgoCD (target) | Python (FastMCP), PostgreSQL, Redis, Docker-in-Docker | Agentic support fabric — dynamic orchestration for DK-OS + other DK functions |
| **DK Compliance v2** | [dk-compliance-v2](https://github.com/data-kinetic/dk-compliance-v2) | K8s / ArgoCD (target) | — | Compliance management, pending onboarding |

### Being Deprecated (services migrating out)

| Product | Repository | Destination | Migration Doc |
|---------|------------|-------------|---------------|
| **Agent Mesh** | [agent-mesh](https://github.com/data-kinetic/agent-mesh) | carbon-5 | [Plan](migrations/agent-mesh-to-carbon-5.md) |
| **DK Data** | [dk-data-fe](https://github.com/data-kinetic/dk-data-fe) | carbon-5 | [Plan](migrations/dk-data-to-carbon-5.md) |
| **DK Mercury** | [dk-mercury](https://github.com/data-kinetic/dk-mercury) | DK-OS | [Plan](migrations/dk-mercury-to-dk-os.md) |
| **DK Phantom** | [dk-phantom](https://github.com/data-kinetic/dk-phantom) | DK-OS | [Plan](migrations/dk-phantom-to-dk-os.md) |

### Lithium-5 — Agentic Support Fabric

Lithium-5 is not a product — it is an **orchestration fabric** that coordinates AI coding agents across DK-OS and other DK projects. It provides:

- **Agent mail** — structured messaging between AI agents (Claude Code, Codex, Cursor)
- **Ephemeral orchestration** — spawns Docker containers running Claude Code to execute tasks autonomously
- **OpenClaw** — human-in-the-loop MCP interface for oversight and approval
- **Governance** — delivers constitution and runbook to agents, enforces boundaries
- **Spec-kit integration** — tracks specification lifecycle across projects
- **Reporting** — parses structured work reports, generates daily digests

Currently on Docker Compose (Megatron) — target state is K8s/ArgoCD following the standard app-of-apps pattern. The Docker-in-Docker orchestrator (ephemeral worker containers) requires special K8s configuration (privileged pods or sidecar Docker daemon).

## GitHub Organization Structure

| Org | Purpose | Repos |
|-----|---------|-------|
| `data-kinetic` | Primary org | dk-alchemy, behavior-labs-ai, carbon-5, lithium-5, dk-compliance-v2, + deprecated repos |
| `data-kinetic-projects` | Secondary org | DK-OS |

### Recommendation: Consolidate Orgs

DK-OS should move to the `data-kinetic` org to simplify ArgoCD repo credentials, GHCR image pull secrets, and shared CI workflows. This is especially important now that DK-OS is a core platform absorbing mercury and phantom services.

## Key Domains & Ingress

| Domain | Product | Notes |
|--------|---------|-------|
| `behaviorlabs.ai` | BehaviorLabs AI | Production |
| `*.staging.behaviorlabs.ai` | BehaviorLabs AI | Staging |
| `*.preview.behaviorlabs.ai` | BehaviorLabs AI | Preview |
| `grafana.behaviorlabs.ai` | dk-alchemy | Grafana |
| `agents.behaviorlabs.ai` | agent-mesh → carbon-5 | Remap post-migration |
| `data.behaviorlabs.ai` | dk-data-fe → carbon-5 | Remap post-migration |
| `mercury.datakinetic.com` | dk-mercury → DK-OS | Remap post-migration |
| `phantom.behaviorlabs.ai` | dk-phantom → DK-OS | Remap post-migration |
| `*.dev.datakinetic.com` | DK-OS (staging) | Current staging |
| `enercore.ai` | Enercore | Production |

## Related Documentation

- [GitOps & CD](gitops-and-cd.md) — how deployments flow through ArgoCD
- [Infrastructure](infrastructure.md) — detailed infra component inventory
- [Observability](observability.md) — monitoring stack architecture
- [Onboarding](onboarding.md) — how to add a new product repo to the platform
- [Migrations](migrations/README.md) — repo consolidation strategy
