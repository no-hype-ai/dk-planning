# Repository Consolidation Migrations

## Overview

Data Kinetic is consolidating from 6+ single-purpose repos into 3 focused platforms plus 1 orchestration fabric. Four repos are being deprecated, with their services absorbed into **carbon-5** (data + AI workflows) and **DK-OS** (business operating system).

## Target State

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Platform Repos (active after consolidation — all on K8s / ArgoCD)       │
│                                                                          │
│  ┌───────────────────┐  ┌────────────────────┐  ┌────────────────────┐  │
│  │  behavior-labs-ai  │  │     carbon-5       │  │      DK-OS         │  │
│  │  (unchanged)       │  │                    │  │                    │  │
│  │                    │  │  ← agent-mesh      │  │  ← dk-mercury      │  │
│  │  Pharma SaaS       │  │  ← dk-data-fe      │  │  ← dk-phantom      │  │
│  │                    │  │                    │  │                    │  │
│  │  NestJS + Next.js  │  │  NestJS + Next.js  │  │  NestJS + Next.js  │  │
│  │  K8s / ArgoCD      │  │  K8s / ArgoCD      │  │  K8s / ArgoCD      │  │
│  └───────────────────┘  └────────────────────┘  └────────────────────┘  │
│                                                                          │
│  ┌───────────────────┐  ┌────────────────────┐                          │
│  │    lithium-5       │  │   dk-alchemy       │                          │
│  │                    │  │   (unchanged)      │                          │
│  │  Agentic support   │  │                    │                          │
│  │  fabric — dynamic  │  │  Platform infra,   │                          │
│  │  orchestration for │  │  ArgoCD, LGTM,     │                          │
│  │  DK-OS + others    │  │  edge networking   │                          │
│  │                    │  │                    │                          │
│  │  K8s / ArgoCD      │  │  K8s / ArgoCD      │                          │
│  │  K3s cluster       │  │  K3s cluster       │                          │
│  └───────────────────┘  └────────────────────┘                          │
│                                                                          │
│  Deprecated Repos (services migrated out)                                │
│  ├── agent-mesh        → carbon-5                                        │
│  ├── dk-data-fe        → carbon-5                                        │
│  ├── dk-mercury        → DK-OS                                           │
│  └── dk-phantom        → DK-OS                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

## Migration Map

| Source Repo | Target Repo | What Moves | Migration Doc |
|-------------|-------------|------------|---------------|
| [agent-mesh](https://github.com/data-kinetic/agent-mesh) | [carbon-5](https://github.com/data-kinetic/carbon-5) | Agent orchestration, MCP gateway, tool management, workflow builder, SDK | [agent-mesh-to-carbon-5.md](agent-mesh-to-carbon-5.md) |
| [dk-data-fe](https://github.com/data-kinetic/dk-data-fe) | [carbon-5](https://github.com/data-kinetic/carbon-5) | Data pipeline (25+ sources), medallion transforms, PostgREST, MCP adapters | [dk-data-to-carbon-5.md](dk-data-to-carbon-5.md) |
| [dk-mercury](https://github.com/data-kinetic/dk-mercury) | [DK-OS](https://github.com/data-kinetic-projects/DK-OS) | Organizational intelligence, transcription, knowledge graph, integrations | [dk-mercury-to-dk-os.md](dk-mercury-to-dk-os.md) |
| [dk-phantom](https://github.com/data-kinetic/dk-phantom) | [DK-OS](https://github.com/data-kinetic-projects/DK-OS) | Synthetic testing, security audit, API/UI auto-discovery | [dk-phantom-to-dk-os.md](dk-phantom-to-dk-os.md) |

## Repos NOT Moving

| Repo | Role | Notes |
|------|------|-------|
| **behavior-labs-ai** | Pharma SaaS platform | Unchanged. Continues as production product on K8s/ArgoCD. |
| **dk-alchemy** | Platform infra mono-repo | Unchanged. Bootstrap entries for deprecated repos will be removed; new entries for carbon-5 and DK-OS added when they move to K8s. |
| **lithium-5** | Agentic support fabric | Not a migration target. Provides dynamic orchestration for DK-OS and other DK functions — spawns ephemeral Claude Code containers, routes inter-agent mail, enforces governance. Deploys on Megatron alongside DK-OS. |
| **dk-compliance-v2** | Compliance platform | Separate product, not part of this consolidation. |

## lithium-5 — Agentic Support Fabric

lithium-5 is distinct from the products it orchestrates. It provides:

- **Agent mail** — structured messaging between AI coding agents (Claude Code, Codex, Cursor)
- **Ephemeral orchestration** — spins up Docker containers running Claude Code to execute tasks autonomously, manages their lifecycle
- **OpenClaw** — human-in-the-loop MCP interface for oversight, escalation, and approval
- **Governance** — delivers constitution and runbook to agents on registration, enforces boundaries
- **Spec-kit integration** — tracks specification lifecycle across projects
- **Reporting** — parses structured work reports from agents, aggregates daily digests

lithium-5 runs on Megatron (192.168.10.88) alongside DK-OS, sharing PostgreSQL (via PgBouncer) and Redis. It coordinates work across DK-OS and other DK projects via its MCP interfaces.

## Cross-Cutting Concerns

These apply to all four migrations:

### dk-alchemy Cleanup

After all migrations complete:
- Remove bootstrap entries from `.gitops/external/` for agent-mesh, dk-data-fe, dk-mercury, dk-phantom
- Remove corresponding AppProjects from `.gitops/repositories/`
- Update Grafana dashboards and alerts that reference deprecated namespaces
- Update edge IngressRoutes for domain remapping
- Update probe-service and sentinel-probe target lists

### Domain Remapping

| Current Domain | Source Repo | Target | Decision Needed |
|----------------|-------------|--------|-----------------|
| `agents.behaviorlabs.ai` | agent-mesh | carbon-5 | Keep domain? Remap to carbon-5 endpoint? |
| `data.behaviorlabs.ai` | dk-data-fe | carbon-5 | Keep domain? Remap to carbon-5 endpoint? |
| `mercury.datakinetic.com` | dk-mercury | DK-OS | Remap to DK-OS subdomain? |
| `phantom.behaviorlabs.ai` | dk-phantom | DK-OS | Remap to DK-OS subdomain? |

### Deployment Model — K8s / ArgoCD for All

All target repos (carbon-5, DK-OS, lithium-5) must be onboarded to the **K3s cluster with ArgoCD**, following the same production patterns as behavior-labs-ai:

- `.gitops/` directory with ArgoCD Application manifests per environment
- `k8s/` directory with Kustomize base + overlays (prod, staging)
- dk-alchemy bootstrap entries in `.gitops/external/`
- Doppler Operator (DopplerSecret CRDs) for secrets
- Traefik + cert-manager for ingress and TLS
- OTLP via Alloy Kustomize component for observability
- ArgoCD Image Updater or CI-driven kustomize tag updates for promotion

The deprecated repos **already have** K8s/ArgoCD configurations — their Kustomize manifests and `.gitops/` patterns can be adapted for the target repos rather than rebuilt from scratch.

**Current state (to be migrated off):** carbon-5, DK-OS, and lithium-5 currently run on Docker Compose (Megatron VM / vm101). These Docker Compose deployments serve as dev/staging until K8s onboarding is complete, after which they become local-dev-only.

### Special Considerations

**lithium-5 Docker-in-Docker:** The ephemeral orchestrator spawns Docker containers running Claude Code. On K8s, this requires either:
- Privileged pod with Docker socket mount
- Sidecar Docker daemon (DinD)
- Or pivoting to K8s Job-based orchestration (spawn K8s Jobs instead of Docker containers)

**dk-data-fe Python service:** The data pipeline is Python-native (FastAPI, SQLMesh). On K8s it runs as a separate container image alongside carbon-5's TypeScript services — same namespace, separate Deployment.

**NeMo STT (dk-mercury):** Stays on DGX Spark (krang GPU) as a separate deployment. Not moved to K8s — but API callback and S3 endpoints update to point at the K8s-hosted DK-OS services.

### Shared Infrastructure (dk-alchemy managed)

All target repos consume shared services from dk-alchemy's infrastructure:

| Service | Namespace | Usage |
|---------|-----------|-------|
| PostgreSQL (CNPG) | `infra` | Primary data stores (separate databases per product) |
| Redis (HA sentinel) | `infra` | BullMQ, caching |
| MinIO | `infra` | Object storage |
| OpenSearch | `infra` | Full-text search |
| Alloy | `infra` | OTLP collector (DaemonSet) |
| Grafana + LGTM | `infra` | Observability |
| Traefik | `kube-system` | Ingress |
| cert-manager | `cert-manager` | TLS |
| Doppler Operator | `doppler-operator-system` | Secrets |

### Database Consolidation

Each source repo has its own PostgreSQL schema/database. Consolidation options:

| Approach | Pros | Cons |
|----------|------|------|
| **Separate databases per service** | Clean isolation, independent migrations | More PgBouncer config, more backup complexity |
| **Shared database, separate schemas** | Single connection, cross-service queries | Migration ordering, schema naming conflicts |
| **Merged into target's Prisma/Drizzle schema** | Single ORM, unified types | Large migration, risk of breakage |

**Recommendation:** Start with separate databases per absorbed service, then evaluate merging schemas once the services are stable in their new home.

## Ordering

Suggested migration sequence:

1. **dk-phantom → DK-OS** — smallest surface area, least complex data model (7 tables), self-contained testing tool
2. **dk-mercury → DK-OS** — moderate complexity, NeMo STT runs separately, org intelligence fits DK-OS vision
3. **dk-data-fe → carbon-5** — large data pipeline, 25+ sources, medallion architecture, but natural fit for carbon-5's dataflow system
4. **agent-mesh → carbon-5** — most complex, 25+ tables, SDK publishing, MCP gateway, but core to carbon-5's agent workflow capabilities

## Related Documentation

- [Platform Overview](../platform-overview.md) — current architecture
- [GitOps & CD](../gitops-and-cd.md) — ArgoCD bootstraps to update
- [Infrastructure](../infrastructure.md) — dk-alchemy managed services
- [Onboarding](../onboarding.md) — checklist for new platform integration
