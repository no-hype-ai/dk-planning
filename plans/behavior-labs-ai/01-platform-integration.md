# Plan 01: Platform Integration

## Goal

Align behavior-labs-ai with Data Kinetic platform standards by completing three migrations: Sentry SDK removal, shared observability package adoption, and shared CI workflow migration. behavior-labs-ai is the **first product repo** to adopt these patterns — success here validates the approach for carbon-5 and DK-OS.

## Current State

| Area | Current | Target |
|------|---------|--------|
| Error tracking | Sentry SDK + OTel dual-write | OTel → Grafana only |
| Observability | Local `@repo/observability` package | Published `@datakinetic/observability` from dk-alchemy |
| CI/CD | Repo-specific `build-deploy.yaml`, `test.yaml` | Shared org-level workflows from dk-alchemy |
| Dependency updates | Dependabot | Renovate |
| CI runners | GitHub-hosted | ARC v2 self-hosted on K3s |
| Issue governance | 13 repo-specific workflows | Org-level shared workflows |

## Dependencies

| Dependency | Plan | Status | Blocking |
|-----------|------|--------|----------|
| Error tracking dashboard + alerts in Grafana | [dk-alchemy/05](../dk-alchemy/05-sentry-migration.md) Phase 1 | Complete | Sentry removal |
| `@datakinetic/observability` published to GHCR | [dk-alchemy/06](../dk-alchemy/06-shared-observability-package.md) | Substantial — verify publishing | Observability adoption |
| Shared `build-deploy.yaml` workflow | [dk-alchemy/04](../dk-alchemy/04-cicd-modernization.md) | Not started — ARC runners done | CI migration |
| ARC v2 runner classes deployed | [dk-alchemy/04](../dk-alchemy/04-cicd-modernization.md) Phase 3 | Complete | CI migration |
| Org-level governance workflows | [dk-alchemy/09](../dk-alchemy/09-governance-extraction.md) | Not started | Governance extraction |

---

## Workstream 1: Sentry SDK Removal

**Requires:** dk-alchemy/05 Phase 1 complete (error tracking dashboard + LogQL alerts in Grafana)

### Phase 1: Validate OTel Parity (Pre-removal)

1. **Verify Grafana error tracking coverage**
   - Confirm `error-tracking.json` dashboard shows errors from all 3 apps (app, admin, api)
   - Confirm LogQL alert rules fire on error rate spikes
   - Compare Sentry error volume vs Grafana error volume over 7 days — target: < 5% delta
   - Document any Sentry-only features in use (breadcrumbs, session replay, profiling)

2. **Verify OTel instrumentation completeness**
   - Check `@repo/observability` covers: tracing, logging, error reporting, health checks
   - Verify NestJS interceptors/filters forward errors to OTel
   - Verify Next.js error boundaries forward to OTel
   - Check BullMQ worker error reporting path

### Phase 2: Remove Sentry SDK

3. **Remove from API (`apps/api`)**
   - Remove packages: `@sentry/nestjs`, `@sentry/node`, `@sentry/profiling-node`
   - Remove Sentry initialization from `main.ts` / `sentry.ts`
   - Remove Sentry interceptors and filters from NestJS modules
   - Update `apps/api/package.json`

4. **Remove from App (`apps/app`)**
   - Remove packages: `@sentry/nextjs`, `@sentry/react`
   - Remove `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
   - Remove `next.config.js` Sentry plugin wrapping
   - Remove `@repo/observability` Sentry integration imports

5. **Remove from Admin (`apps/admin`)**
   - Same as App — remove Sentry Next.js integration

6. **Remove from shared packages**
   - Update `packages/observability/` — remove any Sentry re-exports or dual-write logic
   - Update `packages/analytics/` — remove Sentry session tracking if present

7. **Clean up Doppler**
   - Remove `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` from Doppler configs (dev, stg, prd)
   - Remove Sentry-related build args from Dockerfiles

### Phase 3: Validate

8. **Deploy to staging and monitor 48 hours**
   - Confirm zero Sentry SDK errors in logs
   - Confirm Grafana error tracking dashboard continues to show errors
   - Confirm alert rules fire correctly (inject test error)
   - Confirm no performance regression (OTel overhead vs Sentry overhead)

### Files to Modify

```
apps/api/package.json
apps/api/src/main.ts
apps/api/src/sentry.ts (delete)
apps/api/src/app.module.ts
apps/app/package.json
apps/app/sentry.client.config.ts (delete)
apps/app/sentry.server.config.ts (delete)
apps/app/sentry.edge.config.ts (delete)
apps/app/next.config.ts
apps/admin/package.json
apps/admin/sentry.*.config.ts (delete)
apps/admin/next.config.ts
packages/observability/src/
Dockerfiles (all 3 apps)
doppler.yaml
```

---

## Workstream 2: Shared Observability Package Adoption

**Requires:** dk-alchemy/06 package published to GHCR npm registry

### Steps

1. **Verify package availability**
   ```bash
   npm view @datakinetic/observability --registry=https://npm.pkg.github.com
   ```

2. **Replace local package**
   - Update root `package.json` — remove `@repo/observability` workspace reference
   - Add `@datakinetic/observability` as dependency in `apps/app`, `apps/admin`, `apps/api`
   - Update all imports from `@repo/observability` → `@datakinetic/observability`
   - Verify all 8 exports used: `instrumentation`, `tracing`, `log`, `error`, `error-client`, `health`, `next-config`, `keys`

3. **Validate**
   - `pnpm build` succeeds
   - `pnpm test` passes
   - Deploy to staging — verify Grafana dashboards continue receiving data
   - Verify health check endpoints respond correctly

### Impact

~15 import references across apps and packages need updating. The API surface should be identical since dk-alchemy/06 extracted from this repo's `@repo/observability`.

---

## Workstream 3: Shared CI Workflow Migration

**Requires:** dk-alchemy/04 shared workflows created in `data-kinetic/.github`

### Steps

1. **Migrate build-deploy workflow**
   - Replace `.github/workflows/build-deploy.yaml` with shared workflow call:
     ```yaml
     jobs:
       build-deploy:
         uses: data-kinetic/.github/.github/workflows/build-deploy.yaml@main
         with:
           app-name: behavior-labs-ai
         secrets: inherit
     ```
   - Validate: staging deploy succeeds, production deploy succeeds

2. **Migrate test workflow**
   - Replace `.github/workflows/test.yaml` with shared workflow call
   - Validate: PR checks pass

3. **Add standards check**
   - Add `.github/workflows/standards.yaml` using dk-template pattern
   - Add `.dk-standards.yaml` config file (from dk-template/02)
   - Validate: standards check runs on PRs

4. **Migrate to ARC v2 runners**
   - Update workflow `runs-on` from `ubuntu-latest` to `arc-runner-set` (standard class)
   - For GPU-needed jobs (if any): use `arc-runner-set-gpu`
   - Validate: workflows execute on self-hosted runners

5. **Configure Renovate (replace Dependabot)**
   - Add `renovate.json` from dk-template/02 pattern
   - Remove `.github/dependabot.yml`
   - Validate: Renovate creates PRs for dependency updates

6. **Governance workflow extraction** (depends on dk-alchemy/09)
   - Replace 13 repo-specific governance workflows with org-level shared workflows
   - Preserve issue governance behavior (regression gates, triage evidence, risk prioritization, stub enforcement, status traceability, weekly reports)

### Files to Modify

```
.github/workflows/build-deploy.yaml (replace)
.github/workflows/test.yaml (replace)
.github/workflows/standards.yaml (new)
.github/dependabot.yml (delete)
.dk-standards.yaml (new)
renovate.json (new)
.github/workflows/issue-*.yaml (13 files — replace with shared refs)
```

---

## Verification

- [ ] `pnpm build` succeeds with no Sentry imports
- [ ] `pnpm test` passes
- [ ] Staging deploy succeeds via shared CI workflow on ARC v2 runners
- [ ] Grafana error-tracking dashboard shows errors from all 3 apps
- [ ] LogQL alert rules fire on test error injection
- [ ] `@datakinetic/observability` resolves in package.json
- [ ] Renovate creates dependency update PRs
- [ ] Issue governance workflows continue functioning via org-level refs

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Sentry removal loses error context | 7-day parallel validation before removal; Grafana dashboard parity check |
| Shared workflow breaks CI | Roll out to staging branch first; keep old workflow as fallback |
| Observability package API drift | Package was extracted from this repo — API should be identical |
| Governance workflow behavior change | Test each workflow individually; compare output to current repo-level version |
