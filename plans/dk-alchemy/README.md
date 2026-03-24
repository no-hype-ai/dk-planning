# dk-alchemy Implementation Plans

## Overview

These plans bridge the gap between the [dk-planning documentation](../../docs/) (target state) and the current dk-alchemy implementation. They organize identified gaps into 13 actionable workstreams with clear sequencing, dependencies, and priorities.

## Priority Matrix

> **Last audited: 2026-03-23** against dk-alchemy main (`ed6b0ea`). Plans 01-07 have been updated to reflect implemented work.

| # | Plan | Status | Remaining Work | Dependencies |
|---|------|--------|---------------|-------------|
| 01 | [Platform API](01-platform-api.md) | **Partial** — scaffold + 4/5 routers deployed | Probes router, dashboard, alerts, rate limiting, RBAC wiring, integration guide | None |
| 02 | [SLO & Incident Management](02-slo-and-incident-management.md) | **Partial** — SLI rules + overview dashboard + burn-rate alerts | Per-service SLO targets, latency SLI rules, slo-detail dashboard, OnCall, ArgoCD notifications, alert-to-issue, DR runbooks | None |
| 03 | [Security Hardening](03-security-hardening.md) | **Partial** — Kyverno audit mode (6/7 policies) | `require-read-only-rootfs`, Kyverno dashboard, enforce mode, NetworkPolicies, cosign, audit logs | 04 (shift-left first) |
| 04 | [CI/CD Modernization](04-cicd-modernization.md) | **Partial** — ARC runners (all 3 classes) deployed | Shared workflows, standards enforcement, Renovate, runner alerts | None |
| 05 | [Sentry Migration](05-sentry-migration.md) | **Partial** — error tracking dashboard + alerts | Sentry SDK removal, Pyroscope, Faro | 06 (package extraction) |
| 06 | [Shared Observability Package](06-shared-observability-package.md) | **Substantial** — package in dk-alchemy monorepo | Verify publishing, dk-template integration, integration guide | None |
| 07 | [Secrets Lifecycle](07-secrets-lifecycle.md) | **Substantial** — alerts + runbook created | Alloy Doppler pipeline (blocking), dashboards | 02 (alert routing) |
| 08 | [Preview Standardization](08-preview-standardization.md) | Minimal | Platform API preview endpoints, templates, TTL cleanup | 01 (API endpoints) |
| 09 | [Governance Extraction](09-governance-extraction.md) | Not Started | All phases | 01 (label endpoints) |
| 10 | [Migrations](10-migrations.md) | Not Started | All phases (**has mandatory safety gates**) | Target repo readiness (11) |
| 11 | [ArgoCD Onboarding Scaffolds](11-argocd-onboarding-scaffolds.md) | Not Started | Regenerate scaffolds, submit PRs | 10 (unblocks migrations) |
| 12 | [dk-cli PRD](12-dk-cli-prd.md) | Not Started | All phases | 01 (Platform API), 08 (Preview) |
| 13 | [Cost & Utilization](13-cost-and-utilization.md) | Not Started | LLM cost dashboard, K8s efficiency, unified cost view | Phases 1-2: None. Phase 3: dk-clusters/07 |

## Dependency Graph

```
Foundation work (PARTIALLY COMPLETE — audited 2026-03-23):
  01-Platform API ────────[scaffold done]──► 08-Preview Standardization
                  ────────[scaffold done]──► 09-Governance Extraction
  02-SLO & Incident ─────[rules done, contact points pending]──► 07-Secrets Lifecycle
  04-CI/CD Modernization ─[ARC done]──────► 03-Security Hardening
  06-Shared Observability ─[extracted]────► 05-Sentry Migration

Unblocked (can start now — foundation partially in place):
  03-Security Hardening (Kyverno enforce phases, NetworkPolicies, cosign)
  07-Secrets Lifecycle (Alloy Doppler pipeline — blocking for alert activation)

Unblocked (independent):
  13-Cost & Utilization (Phases 1-2 use existing LiteLLM + K8s metrics)

Still blocked:
  08, 09 ◄── Platform API needs to be fully deployed + routed (not just scaffolded)
  10 ◄────── 11 (scaffolds for target repos) — ⚠️ has mandatory safety gates
  12 ◄────── 01 + 08 (Platform API + Preview standardization)
  13 Phase 3 ◄── dk-clusters/07 (GPU + VM metrics from Proxmox monitoring)
```

## Recommended Execution Phases (updated 2026-03-23)

### Phase 1: Foundation (Months 1-2) — PARTIALLY COMPLETE
Foundation work has been started. Remaining items:
- **01 Platform API** — ✅ Scaffold done. Remaining: probes router, dashboard, alerts, rate limiting
- **02 SLO & Incident Management** — ✅ Recording rules + alerts done. Remaining: per-service SLO targets, slo-detail dashboard, OnCall, DR
- **04 CI/CD Modernization** — ✅ ARC runners done. Remaining: shared workflows, standards enforcement, Renovate
- **06 Shared Observability Package** — ✅ Extraction done. Remaining: verify publishing, dk-template integration

### Phase 2: Core (Months 2-4) — NOW PARTIALLY UNBLOCKED
With foundation work partially in place, these can begin:
- **03 Security Hardening** — Kyverno audit deployed, can proceed to enforce mode + NetworkPolicies + missing `require-read-only-rootfs` policy
- **05 Sentry Migration** — dk-alchemy artifacts done, Sentry SDK removal in behavior-labs-ai can proceed
- **07 Secrets Lifecycle** — Alerts + runbook done, **Alloy Doppler pipeline is the critical blocker** to activate alerts
- **08 Preview Standardization** — Blocked until Platform API preview endpoints are fully deployed
- **13 Cost & Utilization** — Phases 1-2 unblocked (LLM + K8s metrics exist). Phase 3 after dk-clusters/07 ships.

### Phase 3: Extended (Months 3-6)
- **09 Governance Extraction** — after Platform API label endpoints are live
- **10 Migrations** — as target repos become ready (dk-phantom first) — **mandatory safety gates apply**
- **05 Sentry Migration Phase 3** — Pyroscope, Faro, source maps

### Phase 4: Future (6+ months)
Lower-priority items from individual plans:
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
