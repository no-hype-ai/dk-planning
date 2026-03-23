# dk-alchemy Implementation Plans

## Overview

These plans bridge the gap between the [dk-planning documentation](../../docs/) (target state) and the current dk-alchemy implementation. They organize 74 identified gaps into 10 actionable workstreams with clear sequencing, dependencies, and priorities.

## Priority Matrix

| # | Plan | Priority | Effort | Impact | Dependencies |
|---|------|----------|--------|--------|-------------|
| 01 | [Platform API](01-platform-api.md) | High | Large | High | None |
| 02 | [SLO & Incident Management](02-slo-and-incident-management.md) | High | Large | Critical | None |
| 03 | [Security Hardening](03-security-hardening.md) | High | Medium | High | 04 (shift-left first) |
| 04 | [CI/CD Modernization](04-cicd-modernization.md) | High | Large | High | None |
| 05 | [Sentry Migration](05-sentry-migration.md) | High | Medium | Medium | 06 (package extraction) |
| 06 | [Shared Observability Package](06-shared-observability-package.md) | High | Small | High | None |
| 07 | [Secrets Lifecycle](07-secrets-lifecycle.md) | Medium | Small | Medium | 02 (alert routing) |
| 08 | [Preview Standardization](08-preview-standardization.md) | Medium | Medium | Medium | 01 (API endpoints) |
| 09 | [Governance Extraction](09-governance-extraction.md) | Medium | Medium | Medium | 01 (label endpoints) |
| 10 | [Migrations](10-migrations.md) | High | Large | High | Target repo readiness |

## Dependency Graph

```
Independent foundations (start immediately):
  01-Platform API ──────────────► 08-Preview Standardization
                  ──────────────► 09-Governance Extraction
  02-SLO & Incident ───────────► 07-Secrets Lifecycle
  04-CI/CD Modernization ──────► 03-Security Hardening
  06-Shared Observability ─────► 05-Sentry Migration

Independent (start when target repos ready):
  10-Migrations
```

## Recommended Execution Phases

### Phase 1: Foundation (Months 1-2)
Start these in parallel — they have no dependencies:
- **01 Platform API** — foundation for previews, labels, webhooks
- **02 SLO & Incident Management** — defines service health
- **04 CI/CD Modernization** — standardizes pipelines
- **06 Shared Observability Package** — small effort, high impact

### Phase 2: Core (Months 2-4)
These depend on Phase 1 foundations:
- **03 Security Hardening** — Kyverno after CI standards are in place
- **05 Sentry Migration** — Phase 1-2 after observability package exists
- **07 Secrets Lifecycle** — after alert routing from Plan 02
- **08 Preview Standardization** — after Platform API from Plan 01

### Phase 3: Extended (Months 3-6)
- **09 Governance Extraction** — after Platform API label endpoints
- **10 Migrations** — as target repos become ready (dk-phantom first)
- **05 Sentry Migration Phase 3** — Pyroscope, Faro, source maps

### Phase 4: Future (6+ months)
Lower-priority items from individual plans:
- ARC GPU runners on krang
- Per-PR K8s preview environments
- Argo Rollouts (progressive delivery)
- Multi-cluster HA
- Grafana Faro (Frontend RUM)

## Alignment with dk-alchemy Specs

| dk-alchemy Spec | Related Plan(s) | Notes |
|----------------|----------------|-------|
| 001-argocd-lifecycle-scripts | 04 CI/CD | Operational scripts, complements CI modernization |
| 002-k3s-infra-hardening | 03 Security, 02 SLO | Cluster stability, overlaps with security and SLO work |
| 004-doppler-consolidation | 07 Secrets | Doppler restructuring aligns with lifecycle management |
| 005-grafana-dashboard-gitops | 02 SLO, 04 CI/CD | Dashboard sync workflow already implemented |
| 006-otel-product-analytics | 06 Shared Package | Analytics extraction complements observability package |
| 008-dk-data-platform-integration | 10 Migrations | dk-data-fe → carbon-5 migration |
| 009-infra-evolution | 08 Preview, 03 Security | Edge LBs, preview stack, staging isolation |
| 010-litellm-monitoring-cleanup | 01 Platform API | LiteLLM management via API |
| 011-dk-data-stabilization | 10 Migrations | Prerequisite for dk-data-fe migration |
| 013-dc-consolidation-ha | 03 Security, 02 SLO | HA cluster, supersedes spec 012 |
| 014-sentinel-probe-deployment | 02 SLO | External monitoring for SLO validation |

## Open Issue Cross-Reference

Key dk-alchemy GitHub issues addressed by these plans:
- **P0 issues** (Alloy, Grafana, reflector crashes) → Plan 02 (SLO alerting), Plan 04 (CI validation)
- **#27 CI/CD gaps** → Plan 04
- **#28 Image signing** → Plan 03
- **#29 Kyverno admission** → Plan 03
- **Backup/restore testing** → Plan 02 (DR testing)
- **Offsite replication** → Plan 07 (secrets), Plan 02 (DR)

## How to Use These Plans

1. **Pick a plan** from the current phase
2. **Check dependencies** are met
3. **Review existing work** — don't duplicate dk-alchemy specs
4. **Create a feature branch** in dk-alchemy
5. **Follow implementation steps** in order
6. **Run verification** before merging
7. **Update dk-planning docs** to reflect new reality

Each plan is designed to be executable independently within its phase. Plans reference specific dk-alchemy file paths and dk-planning doc sections for easy navigation.
