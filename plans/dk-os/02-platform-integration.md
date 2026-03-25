# Plan 02: Platform Integration

## Goal

Align DK-OS with Data Kinetic platform standards by completing Sentry removal, shared observability package adoption, shared CI workflow migration, and standards compliance. Follows the same pattern as [behavior-labs-ai/01](../behavior-labs-ai/01-platform-integration.md).

## Current State

| Area | Current | Target |
|------|---------|--------|
| Error tracking | OTel + Sentry + Pino (triple-write) | OTel → Grafana only |
| Observability | Local `@repo/observability` (Pino + OTel + Sentry) | Published `@datakinetic/observability` |
| CI/CD | Repo-specific `build-deploy.yaml` with matrix builds | Shared org-level workflows |
| Dependency updates | Manual / Dependabot | Renovate |
| CI runners | Self-hosted on Megatron VM | ARC v2 self-hosted on K3s |
| Standards | None | `.dk-standards.yaml` Tier 1-3 compliance |
| Issue governance | None | Org-level shared workflows |

## Dependencies

| Dependency | Plan | Status | Blocking |
|-----------|------|--------|----------|
| K8s migration complete | [dk-os/01](01-k8s-migration.md) | Not started | Everything (must be on K8s first) |
| Grafana error tracking dashboard | [dk-alchemy/05](../dk-alchemy/05-sentry-migration.md) | Phase 1 complete | Sentry removal |
| `@datakinetic/observability` published | [dk-alchemy/06](../dk-alchemy/06-shared-observability-package.md) | Substantial | Observability adoption |
| Shared build-deploy.yaml | [dk-alchemy/04](../dk-alchemy/04-cicd-modernization.md) | Not started | CI migration |
| ARC v2 runners | [dk-alchemy/04](../dk-alchemy/04-cicd-modernization.md) | Complete | CI migration |

---

## Workstream 1: Sentry SDK Removal

**Requires:** dk-os/01 (K8s migration) + dk-alchemy/05 Phase 1

### Steps

1. **Verify OTel parity** — Confirm Grafana error tracking dashboard receives DK-OS errors via OTel
2. **Remove from API** — `@sentry/nestjs`, `@sentry/node`, profiling from `apps/api`
3. **Remove from Next.js apps** — `@sentry/nextjs` from app, portal, web
4. **Remove from `@repo/observability`** — Sentry integration, dual-write logic
5. **Clean up Doppler** — Remove `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
6. **Clean up Dockerfiles** — Remove Sentry build args (Issue #45)
7. **Validate 48h staging** — Confirm no error tracking gaps

### Files to Modify
```
apps/api/package.json, apps/api/src/ (Sentry init)
apps/app/package.json, sentry.*.config.ts (delete)
apps/portal/package.json, sentry.*.config.ts (delete)
apps/web/package.json, sentry.*.config.ts (delete)
packages/observability/
Dockerfiles (all apps)
```

---

## Workstream 2: Shared Observability Package

**Requires:** dk-alchemy/06 published

### Steps

1. Replace `@repo/observability` with `@datakinetic/observability` in all apps
2. Update all import references
3. Verify Pino → OTel log forwarding still works
4. Validate Grafana dashboards receive data

---

## Workstream 3: Shared CI Workflow Migration

**Requires:** dk-alchemy/04 shared workflows + dk-os/01 (K8s migration)

### Steps

1. **Replace build-deploy.yaml** with shared workflow call
   - DK-OS has 7 apps — matrix build must be preserved
   - `dorny/paths-filter` for smart change detection per service
2. **Replace runners** — `runs-on: ubuntu-latest` → `arc-runner-set`
3. **Remove staging readiness workflow** — Replaced by ArgoCD sync + health checks
4. **Add standards.yaml** check
5. **Configure Renovate** (add `renovate.json`)

### Current CI Complexity

DK-OS CI is more complex than behavior-labs-ai due to:
- 4+ service matrix builds (app, api, portal, web)
- Staging readiness gate (4h soak, health check, error rate < 10%)
- Manual promotion to production (release publish)

The staging readiness gate should be replaced by ArgoCD health checks + Grafana alert rules.

---

## Workstream 4: Standards Compliance

### Steps

1. **Add `.dk-standards.yaml`:**
   ```yaml
   product: dk-os
   team: megatron
   tiers: [1, 2]
   grace_period_until: "2026-06-01"
   services:
     - name: app
       port: 3000
     - name: portal
       port: 3001
     - name: web
       port: 3002
     - name: api
       port: 3004
   ```

2. **Tier 1 validation:** Verify K8s manifests have required labels, probes, resource limits
3. **Tier 2 validation:** Verify monitoring dashboards and alert rules exist per service
4. **Tier 3 (future):** Shared CI workflows, SBOM, provenance

---

## Workstream 5: Issue Governance

### Steps

1. Add platform label taxonomy (status/, priority/, team/, risk/, area/)
2. Add governance workflows (shared org-level when available, or repo-specific)
3. Configure issue templates

---

## Verification

- [ ] Zero Sentry imports in codebase
- [ ] `@datakinetic/observability` in package.json
- [ ] CI running on shared workflow + ARC v2 runners
- [ ] `.dk-standards.yaml` present, Tier 1-2 checks passing
- [ ] Grafana error tracking showing DK-OS errors
- [ ] Renovate creating dependency PRs
