# dk-data-fe Implementation Plans

## Overview

[`dk-data-fe`](https://github.com/data-kinetic/dk-data-fe) is a **Python data intelligence platform** powering molecular and TAVR hospital analytics. It integrates 24+ external data sources (CMS, HRSA, ACC, USPTO, EPO, EMA, DrugBank, PDB, PubMed, SEC Edgar) via scheduled CronJobs, transforms data through a Bronze/Silver/Gold pipeline using SQLMesh, and exposes results via PostgREST (auto-generated REST API) and a FastAPI job-trigger service.

**Critical context:** dk-data-fe is **already production-deployed on K3s/ArgoCD** with Kustomize manifests, DopplerSecrets, CI/CD pipelines, and OTel instrumentation. It pre-dates the dk-template standardization effort, so these plans focus on **closing operational gaps** rather than migration. The repo was added to platform management (`dk-managed` topic) on 2026-03-24.

## Repository Summary

| Component | Details |
|-----------|---------|
| **Services** | PostgREST v12.2.3 (port 3000), FastAPI job-trigger (port 8000) |
| **Stack** | Python 3.11, FastAPI, PostgreSQL 16.4 (CloudNativePG), PostgREST, SQLMesh, pandas |
| **Data Sources** | 24+ fetchers: CMS, HRSA, ACC, USPTO, EPO, EMA, DrugBank, PDB, PubMed, Cochrane, SEC Edgar, OpenAlex, RSS |
| **CronJobs** | 20+ scheduled batch jobs for data ingestion + backup |
| **Database** | 16 schemas: raw, staging, mart, scoring, meta, api, mol_raw through mol_api, bronze, silver, gold, xenon |
| **Deployment** | Kustomize base + overlays (staging/prod), ArgoCD auto-sync with prune + self-heal |
| **Observability** | OTel tracing, Prometheus metrics (ServiceMonitor, PodMonitor, Probe), structlog, 12 alert rules in 5 groups |
| **Secrets** | Doppler (`dk-data-secrets`, `ghcr-credentials`, `minio-backup-credentials` — pending rename to `s3-backup-credentials` after SeaweedFS migration) |
| **CI/CD** | 4 workflows: ci.yaml, build-push.yaml, post-deploy-verify.yaml, promote-to-prod.yaml |

## Priority Matrix

> **Baseline: 2026-03-24**

| # | Plan | Priority | Status | Remaining Work | Dependencies |
|---|------|----------|--------|---------------|-------------|
| 01 | [Platform Alignment Audit](01-platform-alignment-audit.md) | **P0** | Not Started | Add dk-managed topic, verify ArgoCD/dk-alchemy bootstrap, gap inventory, create issues | None |
| 02 | [Standards & Governance](02-standards-and-governance.md) | P1 | Not Started | `.dk-standards.yaml`, standards workflow, issue labels, Kustomize component alignment | Plan 01 |
| 03 | [Production Hardening](03-production-hardening.md) | **P0** | Not Started | Rolling updates, PDBs, anti-affinity, security contexts, CronJob resource limits | Plan 01 |
| 04 | [Monitoring Consolidation](04-monitoring-consolidation.md) | P1 | Not Started | `monitoring/` directory, Grafana dashboards as code, alert label standardization | Plan 01 |
| 05 | [API Integration & Metering](05-api-integration-and-metering.md) | **P0** | Not Started | Metering proxy sidecar, Platform API data endpoints, consumer onboarding, security | Plan 01, dk-alchemy/01 |

## Dependency Graph

```
01-platform-alignment-audit (entry point, no deps)
  │
  ├──► 02-standards-and-governance (P1, after audit)
  │       Requires: dk-alchemy/04 shared workflows, dk-alchemy/09 governance extraction
  │
  ├──► 03-production-hardening (P0, highest impact)
  │       Independent implementation, SeaweedFS migration for backup CronJobs
  │
  ├──► 04-monitoring-consolidation (P1, after audit)
  │       Independent implementation, dk-alchemy contact point for Grafana alerting
  │
  └──► 05-api-integration-and-metering (P0, after audit + Platform API)
          Requires: dk-alchemy/01 Platform API, dk-alchemy/14 data metering endpoints

Plans 02, 03, 04, 05 can run in parallel after Plan 01.
Plan 03 should be prioritized — directly affects production reliability.
Plan 05 should follow close behind — enables secure metered access for consumers.
```

## Alignment with Existing Plans

| dk-alchemy/dk-template Plan | dk-data-fe Plan | Relationship |
|----------------------------|----------------|-------------|
| [dk-alchemy/04 CI/CD](../dk-alchemy/04-cicd-modernization.md) | [02 Standards & Governance](02-standards-and-governance.md) | dk-alchemy provides shared workflows; dk-data-fe adopts standards.yaml |
| [dk-alchemy/05 Sentry Migration](../dk-alchemy/05-sentry-migration.md) | N/A | dk-data-fe does not use Sentry (already OTel-native) |
| [dk-alchemy/06 Shared Observability](../dk-alchemy/06-shared-observability-package.md) | N/A | dk-data-fe is Python (package is TypeScript `@datakinetic/observability`) |
| [dk-alchemy/09 Governance Extraction](../dk-alchemy/09-governance-extraction.md) | [02 Standards & Governance](02-standards-and-governance.md) | Org-level label sync, shared governance workflows |
| [dk-alchemy/10 Migrations](../dk-alchemy/10-migrations.md) | [03 Production Hardening](03-production-hardening.md) | SeaweedFS migration affects backup CronJobs |
| [dk-alchemy/01 Platform API](../dk-alchemy/01-platform-api.md) | [05 API Integration & Metering](05-api-integration-and-metering.md) | Platform API provides key management; dk-data-fe adds metering proxy |
| [dk-alchemy/14 Data Metering](../dk-alchemy/14-data-metering-endpoints.md) | [05 API Integration & Metering](05-api-integration-and-metering.md) | New Platform API `/dk/v1/data/*` endpoints for dk-data consumer keys |
| [dk-template/01-06](../dk-template/) | [01 Audit](01-platform-alignment-audit.md) | Template patterns define the target state for alignment |

## What's Already Done

dk-data-fe has **strong existing platform integration** — these areas require no further work:

- ArgoCD Applications (prod + staging) with auto-sync, prune, self-heal
- Kustomize base + overlays with namespace separation
- DopplerSecret manifests for all secrets
- GitHub Actions CI/CD (lint, test, build, deploy, verify, promote)
- OpenTelemetry tracing + Prometheus metrics via ServiceMonitor/PodMonitor/Probe
- Health endpoints (`/health`, `/ready`) with proper K8s probes (startup, liveness, readiness)
- NetworkPolicy restricting egress
- Ingress with Traefik middleware (rate limiting)
- CLAUDE.md with development guidelines

## Related Plans

- [dk-alchemy plans](../dk-alchemy/) — platform-level implementation
- [dk-template plans](../dk-template/) — repo scaffolding patterns (target state)
- [behavior-labs-ai plans](../behavior-labs-ai/) — reference product repo (patterns to follow)
- [dk-os plans](../dk-os/) — another product onboarding (parallel effort)
