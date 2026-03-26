# Sentry → Grafana Stack Migration — behavior-labs-ai

**Epic:** [dk-planning#17](https://github.com/data-kinetic/dk-planning/issues/17)
**Status:** Planned
**Started:** 2026-03-26
**Target:** Sentry fully removed, Grafana alerting with GitHub issue creation active

## Overview

Remove dual Sentry + OTel instrumentation from behavior-labs-ai. The OTel pipeline to the Grafana LGTM stack (Loki, Grafana, Tempo, Mimir) is production-ready and captures 100% of traces. Sentry captures only 10% and adds redundant cost/complexity. Grafana alerting will create GitHub issues from runtime errors, replacing Sentry's issue tracking.

## Wave Execution

### Wave 1 — Foundation (parallel, no dependencies)

| Issue | Repo | Title | Status |
|-------|------|-------|--------|
| [#777](https://github.com/data-kinetic/behavior-labs-ai/issues/777) | behavior-labs-ai | Remove Sentry SDK from @repo/observability | Planned |
| [#780](https://github.com/data-kinetic/behavior-labs-ai/issues/780) | behavior-labs-ai | Add service.version + deployment.environment to OTel | Planned |
| [#431](https://github.com/data-kinetic/dk-alchemy/issues/431) | dk-alchemy | Add GitHub issue creation contact point to Grafana | Planned |

### Wave 2 — Remove Sentry from apps (after Wave 1)

| Issue | Repo | Title | Status |
|-------|------|-------|--------|
| [#778](https://github.com/data-kinetic/behavior-labs-ai/issues/778) | behavior-labs-ai | Remove Sentry from Next.js apps (app + admin) | Planned |
| [#779](https://github.com/data-kinetic/behavior-labs-ai/issues/779) | behavior-labs-ai | Remove Sentry from NestJS API | Planned |
| [#432](https://github.com/data-kinetic/dk-alchemy/issues/432) | dk-alchemy | Add behavior-labs-ai error tracking alert rules | Planned |

### Wave 3 — Cleanup (after Wave 2 deployed to prod)

| Issue | Repo | Title | Status |
|-------|------|-------|--------|
| [#781](https://github.com/data-kinetic/behavior-labs-ai/issues/781) | behavior-labs-ai | Replace useSentryUser() with OTel user context | Planned |
| [#782](https://github.com/data-kinetic/behavior-labs-ai/issues/782) | behavior-labs-ai | Remove Sentry env vars from Doppler | Planned |

## Branch Strategy

| Repo | Target Branch | Merge Strategy |
|------|--------------|----------------|
| behavior-labs-ai | `staging` | PRs to staging → validate → promote to main |
| dk-alchemy | `main` | PRs to main → ArgoCD auto-syncs |
| dk-planning | `main` | Doc updates committed directly |

## Files Affected

### behavior-labs-ai (delete or modify)

**Delete:**
- `packages/observability/server.ts`
- `packages/observability/client.ts`
- `packages/observability/edge.ts`
- `packages/observability/sentry-user.ts`
- `apps/app/components/sentry-user.tsx`
- `apps/api/src/sentry.ts`

**Modify (remove Sentry, keep OTel):**
- `packages/observability/error.ts`
- `packages/observability/error-client.ts`
- `packages/observability/keys.ts`
- `packages/observability/next-config.ts`
- `packages/observability/instrumentation.ts`
- `packages/observability/package.json`
- `apps/app/instrumentation.ts`
- `apps/app/instrumentation-client.ts`
- `apps/app/app/layout.tsx`
- `apps/app/next.config.ts`
- `apps/admin/instrumentation.ts`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/package.json`
- `.github/workflows/build-deploy.yaml`

### dk-alchemy (create or modify)

- `grafana/provisioning/alerting/contact-points.yaml` — add github-issues contact point
- `grafana/provisioning/alerting/notification-policies.yaml` — add routing rule
- `grafana/alerts/behavior-labs-ai.yaml` — new alert rules file

## Verification Checklist

- [ ] `grep -r "sentry\|Sentry" --include="*.ts" --include="*.tsx"` returns nothing in behavior-labs-ai
- [ ] `pnpm build` succeeds in behavior-labs-ai
- [ ] Errors in staging appear in Loki with `service.version` and `deployment.environment`
- [ ] Traces in Tempo include user context attributes
- [ ] Grafana alert fires on synthetic error and creates GitHub issue
- [ ] Doppler `behaviorlabs-applications` has zero Sentry references
- [ ] No regression in error boundary UIs
