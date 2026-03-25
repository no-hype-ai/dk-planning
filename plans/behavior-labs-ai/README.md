# behavior-labs-ai Implementation Plans

## Overview

[`behavior-labs-ai`](https://github.com/data-kinetic/behavior-labs-ai) is the **Drug Development Intelligence Platform** — a production pharma SaaS application and the **reference implementation** for all Data Kinetic platform patterns. Patterns proven here get extracted to [dk-template](../dk-template/) for use by other product repos.

These plans cover two categories:
1. **Platform integration** — aligning with dk-alchemy platform standards (Sentry removal, shared observability, CI workflows, infrastructure modernization, security)
2. **Product development** — feature roadmap, AI infrastructure, and testing improvements specific to behavior-labs-ai

## Repository Summary

| Component | Details |
|-----------|---------|
| **Apps** | `apps/app` (Next.js 16, port 3000), `apps/admin` (Next.js 16, port 3001), `apps/api` (NestJS 11, port 3002) |
| **Packages** | 30 shared packages under `packages/` (`@repo/*` namespace) |
| **Stack** | TypeScript 5.9+, React 19, Prisma, BullMQ, Clerk, Vercel AI SDK, Tailwind v4 + Radix UI |
| **Infrastructure** | K3d local / K3s production, ArgoCD GitOps, Doppler secrets, Kustomize overlays |
| **External** | dk-alchemy (PostgreSQL, Redis, SeaweedFS, OpenSearch), dk-litellm (LLM gateway at llm.behaviorlabs.ai), dk-data-fe (data intelligence API at data.behaviorlabs.ai) |
| **CI/CD** | GitHub Actions: build-deploy.yaml, test.yaml, 13 issue governance workflows |
| **Observability** | Sentry + OTel (dual-write), PostHog analytics, `@repo/observability` package |
| **Auth** | Clerk (@clerk/nextjs 7.x, @clerk/backend 3.x), multi-org RBAC |

## Priority Matrix

> **Baseline: 2026-03-24**

| # | Plan | Status | Remaining Work | Dependencies |
|---|------|--------|---------------|-------------|
| 01 | [Platform Integration](01-platform-integration.md) | Not Started | Sentry removal, observability pkg adoption, shared CI migration | dk-alchemy/04, /05, /06 |
| 02 | [Infrastructure Modernization](02-infrastructure-modernization.md) | Not Started | Kustomize alignment, NetworkPolicy, resource right-sizing | dk-alchemy/02, /03, /13 |
| 03 | [Testing & Quality](03-testing-and-quality.md) | Not Started | Coverage targets, E2E, API tests, CI quality gates | None (independent) |
| 04 | [Feature Roadmap](04-feature-roadmap.md) | In Progress | Stage-based development tracking, active workstreams | Product-driven |
| 05 | [AI & LLM Infrastructure](05-lightrag-and-ai-infrastructure.md) | Not Started | LiteLLM integration, LightRAG, model deployments, queue patterns | dk-litellm, dk-alchemy infra |
| 06 | [Security & Compliance](06-security-and-compliance.md) | Not Started | Clerk hardening, data classification, API security, compliance | dk-alchemy/03, dk-compliance-v2 |

## Dependency Graph

```
dk-alchemy prerequisites:
  dk-alchemy/04 CI/CD Modernization ──► behavior-labs-ai/01 (shared CI workflows)
  dk-alchemy/05 Sentry Migration ─────► behavior-labs-ai/01 (Sentry SDK removal)
  dk-alchemy/06 Observability Pkg ────► behavior-labs-ai/01 (package adoption)
  dk-alchemy/02 SLO & Incident ──────► behavior-labs-ai/02 (HPA tuning targets)
  dk-alchemy/03 Security Hardening ──► behavior-labs-ai/02 (NetworkPolicy), /06 (Kyverno alignment)
  dk-alchemy/13 Cost & Utilization ──► behavior-labs-ai/02 (resource right-sizing data)

Independent (can start now):
  03-Testing & Quality
  04-Feature Roadmap
  05-AI & LLM Infrastructure (partially — LiteLLM integration independent)

Cross-repo outputs (behavior-labs-ai → dk-template):
  behavior-labs-ai/01 ──► dk-template CI patterns (reference implementation)
  behavior-labs-ai/03 ──► dk-template testing patterns
  behavior-labs-ai/06 ──► dk-template security patterns
```

## Alignment with Existing Plans

| dk-alchemy Plan | behavior-labs-ai Plan | Relationship |
|----------------|----------------------|-------------|
| [05 Sentry Migration](../dk-alchemy/05-sentry-migration.md) | [01 Platform Integration](01-platform-integration.md) | dk-alchemy builds dashboards/alerts; behavior-labs-ai removes Sentry SDK |
| [06 Shared Observability](../dk-alchemy/06-shared-observability-package.md) | [01 Platform Integration](01-platform-integration.md) | dk-alchemy publishes package; behavior-labs-ai adopts it |
| [04 CI/CD Modernization](../dk-alchemy/04-cicd-modernization.md) | [01 Platform Integration](01-platform-integration.md) | dk-alchemy creates shared workflows; behavior-labs-ai migrates first |
| [02 SLO & Incident](../dk-alchemy/02-slo-and-incident-management.md) | [02 Infrastructure](02-infrastructure-modernization.md) | SLO targets inform HPA tuning |
| [03 Security Hardening](../dk-alchemy/03-security-hardening.md) | [02 Infrastructure](02-infrastructure-modernization.md), [06 Security](06-security-and-compliance.md) | Kyverno policies, NetworkPolicy patterns |
| [13 Cost & Utilization](../dk-alchemy/13-cost-and-utilization.md) | [02 Infrastructure](02-infrastructure-modernization.md) | Efficiency dashboard informs resource tuning |
| [09 Governance Extraction](../dk-alchemy/09-governance-extraction.md) | [01 Platform Integration](01-platform-integration.md) | behavior-labs-ai governance scripts → org-level workflows |
| [dk-data-fe/05 API Integration](../dk-data-fe/05-api-integration-and-metering.md) | [05 AI & LLM Infrastructure](05-lightrag-and-ai-infrastructure.md) | behavior-labs-ai consumes dk-data for pharma intelligence (mart, api, mol_api, scoring schemas) |

## Recommended Execution Sequence

### Phase 1: Independent Work (Can Start Now)
- **03 Testing & Quality** — no external dependencies
- **04 Feature Roadmap** — product-driven, already in progress
- **05 AI & LLM Infrastructure** — LiteLLM integration, model tracking

### Phase 2: Platform Integration (After dk-alchemy Phase 1)
- **01 Platform Integration** — Sentry removal, observability, CI (requires dk-alchemy/04, /05, /06)
- **02 Infrastructure Modernization** — resource tuning, NetworkPolicy (requires dk-alchemy/02, /03, /13)

### Phase 3: Security & Compliance (After dk-alchemy Phase 2)
- **06 Security & Compliance** — Kyverno alignment, data classification, compliance controls

## Specs Cross-Reference

behavior-labs-ai has 40+ specs in its `specs/` directory organized by feature number. Key specs relevant to these plans:

| Spec | Plan |
|------|------|
| 011-stage0-foundation | 04 Feature Roadmap |
| 012-019 (Stages 1-8) | 04 Feature Roadmap |
| 038-knowledge-rag-chat | 05 AI Infrastructure |
| 595-intelligence-core-phase3 | 04 Feature Roadmap, 05 AI Infrastructure |
| 900-telemetry-updates | 01 Platform Integration |
| litellm-model-setup | 05 AI Infrastructure |

## Related Plans

- [dk-alchemy plans](../dk-alchemy/) — platform-level implementation
- [dk-clusters plans](../dk-clusters/) — Proxmox cluster management
- [dk-data-fe plans](../dk-data-fe/) — data intelligence platform (consumed by behavior-labs-ai)
- [dk-template plans](../dk-template/) — repo scaffolding patterns
