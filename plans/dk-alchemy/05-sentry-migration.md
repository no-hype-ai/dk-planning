# Sentry → Grafana Migration

## Context
behavior-labs-ai runs dual Sentry + OTel, creating redundant cost and complexity. Sentry provides error tracking, traces, profiling, session replay, and frontend RUM. All of these have Grafana-native replacements. The migration has a documented 3-phase plan.

## Scope
- Phase 1 (Parallel): Add OTel resource attributes, mirror Sentry alert rules in Grafana, validate parity
- Phase 2 (Remove Sentry): Remove SDK dependencies, env vars, Sentry calls
- Phase 3 (Replace features): Profiling → Pyroscope, Session replay → PostHog Recordings, Frontend RUM → Grafana Faro, Issue grouping → LogQL, Source maps → MinIO, Release tracking → OTel attributes
- Out of scope: Non-behavior-labs-ai repos (they don't have Sentry)

## Dependencies
- Plan 06 (Shared Observability Package) — the package should be the target for all OTel code, so migration should align with extraction
- Grafana Faro requires Alloy configuration changes (dk-alchemy)
- Pyroscope requires new infrastructure component (dk-alchemy)

## Existing Work
- dk-alchemy: No Sentry-related infra (Sentry is SaaS)
- dk-planning docs: application-instrumentation.md (3-phase plan, overlap analysis)
- behavior-labs-ai: packages/observability/ (current OTel + Sentry dual implementation)

## Implementation Steps

### Phase 1: Parallel Run (2-4 weeks)
1. Add OTel resource attributes to behavior-labs-ai:
   - service.version (from package.json or git SHA)
   - deployment.environment (from OTEL env var)
   - user.id, user.email (from auth context, PII-safe)
2. Mirror every Sentry alert rule as a Grafana alert:
   - Map Sentry issue alerts → LogQL pattern-match alerts
   - Map Sentry performance alerts → Mimir metric alerts
   - Ensure Slack routing matches current Sentry notifications
3. Run parallel for 2-4 weeks, comparing alert coverage
4. Document gaps: anything Sentry catches that Grafana misses
5. Create Grafana error tracking dashboard:
   - Error rate by service, endpoint, error type
   - Error log drill-down with stack traces from Loki
   - Trace correlation links to Tempo

### Phase 2: Remove Sentry (1 week)
6. Remove @sentry/node, @sentry/nextjs from package.json
7. Remove Sentry.init() calls from instrumentation.ts
8. Remove SENTRY_DSN, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT from Doppler
9. Remove Sentry webpack plugin from next.config.js
10. Remove sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts
11. Update parseError() to log only to OTel (remove Sentry.captureException)
12. Verify: Loki receives all errors, Grafana alerts fire, no Sentry references remain

### Phase 3: Replace Advanced Features (4-8 weeks)
13. Deploy Pyroscope in dk-alchemy/k8s/infrastructure/pyroscope/ (replaces Sentry Profiling)
14. Add Pyroscope SDK to behavior-labs-ai observability package
15. Configure PostHog Session Recordings (replaces Sentry Replay)
16. Deploy Grafana Faro collector endpoint in Alloy (replaces Sentry Web Vitals/RUM):
    - Add faro receiver to Alloy config
    - Add @grafana/faro-web-sdk to behavior-labs-ai frontend
17. Configure source map upload to MinIO (replaces Sentry source maps):
    - CI uploads source maps to MinIO bucket
    - Grafana/Loki references for stack trace deobfuscation
18. Add OTel release tracking attributes (replaces Sentry Releases)

## dk-alchemy Changes
- CREATE: k8s/infrastructure/pyroscope/ (base + prod overlay)
- MODIFY: k8s/infrastructure/alloy/base/values.yaml (add Faro receiver)
- CREATE: grafana/dashboards/applications/error-tracking.json
- CREATE: grafana/alerts/error-tracking.yaml
- MODIFY: grafana/provisioning/alerting/ (mirror Sentry rules)

## Verification
- All Sentry alert equivalents fire correctly in Grafana
- Zero Sentry SDK references in behavior-labs-ai codebase
- Sentry SaaS subscription can be cancelled
- Pyroscope shows profiling data in Grafana
- Faro shows Web Vitals in Grafana
- Source maps resolve in Loki error logs

## Options/Recommendations
**Phase 3 Feature Priority:**
- **Pyroscope:** Medium priority — profiling is valuable for performance work but not critical for operations
- **Faro (Frontend RUM):** Low priority — Web Vitals are nice-to-have, not blocking
- **PostHog Recordings:** Low priority — already available in PostHog, just needs enabling
- **Source maps in MinIO:** Medium priority — needed for readable stack traces in Loki

**Recommendation:** Do Phase 1-2 as a focused sprint. Phase 3 items can be tackled independently over time. Pyroscope and source maps first, Faro and recordings later.
