# DK-OS Implementation Plans

## Overview

[`DK-OS`](https://github.com/data-kinetic/DK-OS) is a **self-hosted business operating system** — a product management platform integrating with 10+ external services (GitHub, Linear, Jira, Slack, Intercom, Stripe, HubSpot, Zapier, Email, Clerk). It provides feedback collection, feature planning, roadmaps, changelogs, and customer portals.

DK-OS is the **first Docker Compose → K8s migration** in the Data Kinetic platform. Patterns established here will inform onboarding for carbon-5 and future product repos. DK-OS also includes the agent execution fabric, consolidated under the agent-mesh component.

**Critical context:** DK-OS currently runs on Megatron VM (192.168.10.88) via Docker Compose. It is **not yet on K3s/ArgoCD**. The K8s migration (Plan 01) is the highest priority and critical path for all other plans.

## Repository Summary

| Component | Details |
|-----------|---------|
| **Apps** | 7: `app` (Next.js, 3000), `portal` (Next.js, 3001), `web` (Next.js, 3002), `email` (React Email, 3003), `api` (NestJS, 3004), `adf-validator` (Next.js, 3006), `agent-mesh` (Python FastAPI, 8765/8766) |
| **Packages** | 23 shared packages under `@repo/*` |
| **Stack** | Next.js 16, React 19.2, NestJS 11, Prisma 7.1, BullMQ, Clerk, Vercel AI SDK, TailwindCSS 4.2, Radix UI |
| **Database** | PostgreSQL 16 (pgvector) via PgBouncer, 82 Prisma models (1949 lines) |
| **Storage** | SeaweedFS 3.93 (S3-compatible via AWS SDK v3) |
| **Auth** | Clerk (DKOSRole enum: Admin, Editor, Member), multi-org with filtered Prisma extension |
| **Deployment** | Docker Compose on Megatron VM (192.168.10.88), GHCR images, self-hosted runner |
| **Observability** | OTel + Sentry + Pino + PostHog (dual-write, same as behavior-labs-ai) |
| **Secrets** | Doppler project `dk-os`, configs: dev_main, stg_main, prd_main |
| **Agent Mesh** | Python FastAPI — AI agent coordination, 40+ MCP tools, Docker orchestrator |
| **CI/CD** | GitHub Actions: build-deploy with matrix builds, staging readiness gates, manual promotion |

## Multi-App Architecture

DK-OS uses an app-switcher pattern supporting multiple business apps within one UI:

| App | Route Prefix | Status | Scope |
|-----|-------------|--------|-------|
| Home | `/` | Active | Dashboard, activity, insights, tasks, notifications |
| Product & Engineering | `/product` | Active | Feedback, features, initiatives, roadmap, releases, changelog, repos, deployments |
| Marketing | `/marketing` | Active | Blog, content pages, analytics, HubSpot, email campaigns |
| Agents | `/agents` | Scaffolded | AI agent registry, executions, work reports |
| 5-13 | — | Planned | Future business apps |

## Priority Matrix

> **Baseline: 2026-03-24**

| # | Plan | Priority | Status | Remaining Work | Dependencies |
|---|------|----------|--------|---------------|-------------|
| 01 | [K8s Migration](01-k8s-migration.md) | **P0** | **Phase 1 Done** | K8s manifests scaffolded, .dk-standards.yaml created, docker-compose.preview.yaml ready. Remaining: ArgoCD bootstrap, DNS, cutover | dk-alchemy bootstrap PR |
| 02 | [Platform Integration](02-platform-integration.md) | P1 | Not Started | Sentry removal, observability pkg, shared CI, standards | dk-alchemy/04, /05, /06 |
| 03 | [Infrastructure Services](03-infrastructure-services.md) | P1 | Not Started | Data store decisions (PostgreSQL, Redis, SeaweedFS, LiteLLM) | Plan 01 (informs migration) |
| 04 | [Agent Mesh](04-agent-mesh.md) | P2 | **Scaffolded** | K8s manifests generated (port 8765), Python Dockerfile template ready. Remaining: Docker orchestrator migration | Plan 01 (K8s first) |
| 05 | [Testing & Quality](05-testing-and-quality.md) | P2 | Not Started | Coverage targets, E2E, API tests, multi-tenant isolation tests | None (independent) |
| 06 | [Feature Roadmap](06-feature-roadmap.md) | — | In Progress | App-switcher expansion, stage tracking | Product-driven |
| 07 | [Security & Compliance](07-security-and-compliance.md) | P1 | Not Started | Org isolation audit, webhook security, agent-mesh sandboxing | dk-alchemy/03, dk-compliance-v2 |

## Dependency Graph

```
CRITICAL PATH:
  dk-template scaffold ──► dk-os/01 K8s Migration ──► dk-os/03 Infrastructure Services
  dk-alchemy bootstrap ──► dk-os/01                 ──► dk-os/04 Agent Mesh
                                                     ──► dk-os/02 Platform Integration

dk-alchemy prerequisites (same as behavior-labs-ai):
  dk-alchemy/04 CI/CD ──────► dk-os/02 (shared CI workflows)
  dk-alchemy/05 Sentry ─────► dk-os/02 (Sentry SDK removal)
  dk-alchemy/06 Observability ► dk-os/02 (package adoption)
  dk-alchemy/03 Security ───► dk-os/07 (Kyverno alignment)

Independent (can start now):
  05-Testing & Quality
  06-Feature Roadmap
```

## Key Decisions Pending

| Decision | Options | Impact | Plan |
|----------|---------|--------|------|
| Database location | CloudNativePG shared vs dedicated VM (pgvector) | Data migration complexity, pgvector support | 01, 03 |
| Storage backend | SeaweedFS (dk-alchemy standard, replacing MinIO) | Endpoint + credential migration | 01, 03 |
| PgBouncer strategy | K8s sidecar vs shared PgBouncer pool | Connection management, overhead | 01, 03 |
| Migration approach | Incremental (api first) vs big-bang | Risk, downtime, testing complexity | 01 |
| Agent-mesh database | Shared PostgreSQL vs isolated instance | Schema isolation, migration complexity | 04 |

## Alignment with Existing Plans

| dk-alchemy/dk-template Plan | DK-OS Plan | Relationship |
|----------------------------|-----------|-------------|
| [dk-alchemy/05 Sentry Migration](../dk-alchemy/05-sentry-migration.md) | [02 Platform Integration](02-platform-integration.md) | dk-alchemy builds dashboards; DK-OS removes Sentry SDK |
| [dk-alchemy/06 Shared Observability](../dk-alchemy/06-shared-observability-package.md) | [02 Platform Integration](02-platform-integration.md) | dk-alchemy publishes package; DK-OS adopts |
| [dk-alchemy/04 CI/CD](../dk-alchemy/04-cicd-modernization.md) | [02 Platform Integration](02-platform-integration.md) | dk-alchemy creates shared workflows; DK-OS migrates |
| [dk-alchemy/03 Security](../dk-alchemy/03-security-hardening.md) | [07 Security](07-security-and-compliance.md) | Kyverno policies, NetworkPolicy patterns |
| [dk-alchemy/10 Migrations](../dk-alchemy/10-migrations.md) | [01 K8s Migration](01-k8s-migration.md) | DK-OS absorbs dk-mercury + dk-phantom per migration plan |
| [dk-alchemy/11 ArgoCD Scaffolds](../dk-alchemy/11-argocd-onboarding-scaffolds.md) | [01 K8s Migration](01-k8s-migration.md) | Bootstrap manifests for DK-OS in dk-alchemy |
| [dk-template/01-06](../dk-template/) | [01 K8s Migration](01-k8s-migration.md) | Template generates initial scaffold |
| [dk-template/07 Enforcement Gaps](../dk-template/07-enforcement-gaps.md) | [01 K8s Migration](01-k8s-migration.md) | Template improvements benefit DK-OS scaffold |

## Recommended Execution Sequence

### Phase 1: Independent Work (Start Now)
- **05 Testing & Quality** — no external dependencies
- **06 Feature Roadmap** — product-driven, already in progress
- **03 Infrastructure Services** — decisions can begin (PostgreSQL, SeaweedFS, PgBouncer)

### Phase 2: K8s Migration (After dk-template + dk-alchemy ready)
- **01 K8s Migration** — critical path, depends on dk-template scaffold + dk-alchemy bootstrap
- **02 Platform Integration** — Sentry, observability, CI (requires dk-alchemy/04, /05, /06)

### Phase 3: Hardening (After K8s migration)
- **04 Agent Mesh** — Python service deployment after Node.js services proven on K8s
- **07 Security & Compliance** — Kyverno alignment, data classification, agent-mesh sandboxing

## Specs Cross-Reference

| Spec | Status | Plan |
|------|--------|------|
| 001 Eververse Self-Hosted Migration | Complete | Foundational — enabled DK-OS |
| 002 Baseline Remediation | Complete | Quality baseline |
| 003 Local Dev Stabilization | Complete | Dev environment |
| 004 Megatron CI/CD Deploy | Complete | Current Docker Compose deploy |
| 005 GitHub Integration Elevate | Complete | 06 Feature Roadmap |
| 006 GitHub Workflow Enhancements | Complete | 06 Feature Roadmap |
| 007 Website CMS Migration | Complete | 06 Feature Roadmap (Marketing app) |

## Related Plans

- [dk-alchemy plans](../dk-alchemy/) — platform-level implementation
- [dk-clusters plans](../dk-clusters/) — Proxmox cluster management
- [dk-template plans](../dk-template/) — repo scaffolding patterns
- [behavior-labs-ai plans](../behavior-labs-ai/) — reference product repo (patterns to follow)
