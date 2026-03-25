# Platform Overview

## Architecture

Data Kinetic runs a self-hosted [Kubernetes](https://kubernetes.io/docs/) platform on bare-metal [Proxmox](https://pve.proxmox.com/pve-docs/) hosts, using a GitOps-driven app-of-apps model. The platform is split into two layers:

- **Platform layer** ([dk-alchemy](https://github.com/data-kinetic/dk-alchemy)) — owns all shared infrastructure, the [ArgoCD](https://argo-cd.readthedocs.io/) control plane, observability stack, edge networking, and secrets management.
- **Product layer** — individual repos that own their application code, deployment manifests, and monitoring contributions. Each product repo integrates with dk-alchemy's app-of-apps pattern to receive automated CD.

```
┌──────────────────────────────────────────────────────────┐
│  dk-alchemy (platform layer)                              │
│  ├── ArgoCD control plane (app-of-apps)                   │
│  ├── LGTM observability stack                             │
│  ├── Shared data stores (PostgreSQL, Redis, SeaweedFS, etc.) │
│  ├── Edge networking (Traefik, Keepalived VIPs)           │
│  ├── Secrets management (Doppler Operator)                │
│  └── Bootstraps for all product repos                     │
├──────────────────────────────────────────────────────────┤
│  Product repos (app layer)                                │
│  ├── behavior-labs-ai   (reference implementation)        │
│  ├── dk-compliance-v2                                     │
│  ├── DK-OS              (includes agent-mesh fabric)       │
│  └── carbon-5                                             │
└──────────────────────────────────────────────────────────┘
```

## Physical Infrastructure

### Proxmox Hosts

| Host | CPU | RAM | GPU | Role |
|------|-----|-----|-----|------|
| **penguin** | AMD EPYC 7773X | ~1TB | — | Primary [K3s](https://docs.k3s.io/) cluster, general workloads |
| **krang** | AMD EPYC 7763 | 1TiB | 8x A100 80GB | GPU workloads, ML/AI inference |

### Network Architecture

| Network | CIDR | Purpose |
|---------|------|---------|
| Core | 192.168.1.0/24 | Management, primary LAN |
| Corpnet VLAN 10 | 192.168.10.0/24 | Corporate network |
| Cluster isolated | 10.0.0.0/24 | K3s inter-node communication |
| DMZ VLAN 100 | 172.16.100.0/24 | Public-facing edge LBs |

### K3s Clusters

- **Main cluster** — 2-node cluster: k3s-master-1 (penguin, control-plane) + k3s-slave-1 (krang, agent). Zone labels applied (`topology.kubernetes.io/zone=penguin` / `=krang`) for topology-aware scheduling. K3s v1.33.6+k3s1.
- **Edge LB nodes** — 2 dedicated VMs (phantom at 10.0.0.2, venom at 10.0.0.3) running [Traefik](https://doc.traefik.io/traefik/) + [Keepalived](https://www.keepalived.org/manpage.html) for VIP failover. VRRP failover verified operational (Mar 2026), all 8 TLS certificates Ready, 28 ingress routes active.

### Standalone VMs (penguin-hosted)

| VM | IP | Resources | Role |
|----|-----|-----------|------|
| vm100-litellm | 192.168.10.50 | 16 vCPU, 64GB RAM | [LiteLLM](litellm.md) proxy — LLM gateway for all products |
| vm101-preview-stack | 10.0.0.51 | 16 vCPU, 64 GiB RAM (balloon 32 GiB), 485 GB disk | [Preview environments](preview-environments.md) — docker-compose previews via NPM |
| vm220-vllm | 192.168.10.101 | GPU passthrough | vLLM model serving (not HA) |

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
| **BehaviorLabs AI** | [behavior-labs-ai](https://github.com/data-kinetic/behavior-labs-ai) | K8s / ArgoCD | [NestJS](https://docs.nestjs.com/), [Next.js](https://nextjs.org/docs), [PostgreSQL](https://www.postgresql.org/docs/) (pgvector), [Redis](https://redis.io/docs/), [SeaweedFS](https://github.com/seaweedfs/seaweedfs) | Production reference implementation |
| **BehaviorLabs Web** | [behavior-labs-web](https://github.com/data-kinetic/behavior-labs-web) | K8s / ArgoCD | — | Production |
| **Carbon-5** | [carbon-5](https://github.com/data-kinetic/carbon-5) | K8s / ArgoCD (target) | NestJS, Next.js, Drizzle, Prefect 3, PostgreSQL, Redis, SeaweedFS | Data pipeline + AI workflow platform. Absorbing dk-data-fe into Prefect dataflows. Agent workflow UI dispatches execution to DK-OS agent-mesh API. |
| **DK-OS** | [DK-OS](https://github.com/data-kinetic-projects/DK-OS) | K8s / ArgoCD (target) | NestJS, Next.js, [Prisma](https://www.prisma.io/docs), Python (FastAPI), PostgreSQL, Redis, SeaweedFS | Business operating system + agent execution fabric. Absorbing dk-mercury + dk-phantom. Includes `agent-mesh` (Python FastAPI) providing agent CRUD, MCP gateway, inter-agent messaging, and [PR Review Service](pr-review-service.md) on krang GPUs. |
| **DK Compliance v2** | [dk-compliance-v2](https://github.com/data-kinetic/dk-compliance-v2) | K8s / ArgoCD (target) | — | Compliance management, pending onboarding |

### Being Deprecated (services migrating out)

| Product | Repository | Destination | Migration Doc |
|---------|------------|-------------|---------------|
| **Agent Mesh** | [agent-mesh](https://github.com/data-kinetic/agent-mesh) | DK-OS (`apps/agent-mesh/`) | Already integrated — standalone repo deprecated |
| **DK Data** | [dk-data-fe](https://github.com/data-kinetic/dk-data-fe) | carbon-5 | [Plan](migrations/dk-data-to-carbon-5.md) |
| **DK Mercury** | [dk-mercury](https://github.com/data-kinetic/dk-mercury) | DK-OS | [Plan](migrations/dk-mercury-to-dk-os.md) |
| **DK Phantom** | [dk-phantom](https://github.com/data-kinetic/dk-phantom) | DK-OS | [Plan](migrations/dk-phantom-to-dk-os.md) |

### DK-OS Agent Mesh — Agent Execution Fabric

DK-OS includes an **agent execution fabric** (`apps/agent-mesh/`) — a Python FastAPI service that provides centralized agent capabilities to all products via API. This supersedes the previously planned standalone lithium-5 repo.

**Agent execution capabilities:**
- 40+ MCP tools for agent operations
- Inter-agent messaging and coordination
- Agent CRUD with execution tracking and work reports
- OpenClaw — human-in-the-loop MCP interface for oversight
- Docker orchestrator for ephemeral agent execution (migrating to K8s Jobs)
- Clerk-authenticated API for cross-product consumption
- [PR Review Service](pr-review-service.md) — automated code review on krang GPUs

**How products consume DK-OS agent-mesh:**
- **carbon-5** — dispatches visual workflow execution, agent CRUD for partners/customers
- **behavior-labs-ai** — dispatches evaluation pipelines, domain agent tasks
- **DK-OS internal** — org intelligence agents, synthetic testing agents

Target state: `agent-mesh` deploys as a Python FastAPI service within DK-OS's K8s namespace, exposing Agent MCP (port 8765) and OpenClaw MCP (port 8766) endpoints.

## GitHub Organization Structure

| Org | Purpose | Repos |
|-----|---------|-------|
| `data-kinetic` | Primary org | dk-alchemy, behavior-labs-ai, carbon-5, dk-compliance-v2, + deprecated repos |
| `data-kinetic-projects` | Secondary org | DK-OS |

### Recommendation: Consolidate Orgs

DK-OS should move to the `data-kinetic` org to simplify ArgoCD repo credentials, [GHCR](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) image pull secrets, and shared CI workflows. This is especially important now that DK-OS is a core platform absorbing mercury and phantom services.

## Key Domains & Ingress

| Domain | Product | Notes |
|--------|---------|-------|
| `behaviorlabs.ai` | BehaviorLabs AI | Production |
| `*.staging.behaviorlabs.ai` | BehaviorLabs AI | Staging |
| `*.preview.behaviorlabs.ai` | BehaviorLabs AI | Preview |
| `grafana.behaviorlabs.ai` | dk-alchemy | [Grafana](https://grafana.com/docs/grafana/latest/) |
| `agents.behaviorlabs.ai` | agent-mesh → carbon-5 | Remap post-migration |
| `data.behaviorlabs.ai` | dk-data-fe → carbon-5 | Remap post-migration |
| `mercury.datakinetic.com` | dk-mercury → DK-OS | Remap post-migration |
| `phantom.behaviorlabs.ai` | dk-phantom → DK-OS | Remap post-migration |
| `*.dev.datakinetic.com` | DK-OS (staging) | Current staging |
| `webhooks.datakinetic.com` | dk-alchemy | Webhook service for cross-repo event handling |
| `enercore.ai` | Enercore | Production |

## Related Documentation

- [GitOps & CD](gitops-and-cd.md) — how deployments flow through ArgoCD
- [Infrastructure](infrastructure.md) — detailed infra component inventory
- [Observability](observability.md) — monitoring stack architecture
- [Standards Compliance](standards-compliance.md) — CI/CD standards enforcement
- [PR Review Service](pr-review-service.md) — automated PR review on DK-OS agent-mesh (krang GPUs)
- [Onboarding](onboarding.md) — how to add a new product repo to the platform
- [Migrations](migrations/README.md) — repo consolidation strategy
