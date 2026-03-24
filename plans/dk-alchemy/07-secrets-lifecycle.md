# Secrets Lifecycle Management

## Context
Secrets are rotated ad-hoc with no schedule, no expiry alerting, and no audit trail integration. The compliance program (SOC 2, NIST 800-171) requires demonstrable secret rotation and access review processes.

## Scope
- Define rotation schedules by secret type
- Implement expiry alerting via Grafana
- Integrate Doppler audit logs with Loki
- Automate Doppler project creation for new repos
- Document rotation procedures in runbook

## Dependencies
- **Plan 02** (SLO & Incident) — Grafana alert routing (contact points) should be in place for expiry alerts
- **Plan 01** (Platform API) — Phase 4 requires `dk secrets setup` command via Platform API endpoints

## Current State (audited 2026-03-23)

> **Phase 1 (rotation schedules + runbook) and alert rules are COMPLETE.**
> Alerts are in noData state — Alloy Doppler pipeline not yet deployed.

**Implemented (on main as of `74225b6`):**
- `grafana/alerts/secrets.yaml` — Rotation alerts at 80%/100% thresholds for 90-day and 180-day secrets + TLS cert expiry
- `docs/runbooks/secret-rotation.md` — Comprehensive runbook (237 lines) covering all 6 secret types + ArgoCD

**Validation findings:**
- VALIDATED: Alert thresholds correct — 72d warning / 90d critical (90-day secrets), 144d / 180d (180-day secrets)
- VALIDATED: TLS cert alerts at 30d warning / 7d critical via cert-manager metrics
- VALIDATED: All 6 planned secret types covered in alert patterns + ArgoCD (undocumented extra)
- VALIDATED: Runbook has step-by-step procedures for all secret types with compliance references
- GAP: Alerts in `noDataState: OK` — Doppler metrics pipeline not deployed (Phase 2 step 4)
- GAP: `grafana/dashboards/infrastructure/secrets-lifecycle.json` NOT created (plan Phase 2 step 8)
- GAP: `grafana/dashboards/infrastructure/doppler-audit.json` NOT created (plan Phase 3 step 10)
- NOTE: Existing `doppler.json` dashboard covers operator health but NOT secret age/rotation status
- MISMATCH: Implementation includes ArgoCD credentials as a 7th secret type (not listed in plan's 6 types)

## Existing Work
- dk-alchemy: Doppler Operator deployed, DopplerSecret CRDs in use
- dk-alchemy specs: 004-doppler-consolidation (project restructuring)
- dk-planning docs: secrets-management.md (rotation design, Doppler architecture)
- dk-compliance-v2: policies/encryption-policy.md (compliance requirements)

## Implementation Steps

### Phase 1: Rotation Schedule Definition
1. Document rotation cadences:
   - Database credentials (PostgreSQL, Redis): 90 days
   - API keys (external services): 90 days
   - Service tokens (Doppler, GitHub): 180 days
   - TLS certificates: Automatic (cert-manager)
   - LiteLLM master key: 90 days
   - Webhook signing secrets: 180 days
2. Create rotation runbook in dk-alchemy/docs/runbooks/secret-rotation.md
3. Configure Doppler scheduled rotation where supported

### Phase 2: Expiry Alerting
4. Create Alloy scrape job for Doppler audit API (poll every 5m)
5. Parse secret last-changed timestamps from Doppler API
6. Push metrics to Mimir:
   - doppler_secret_age_days{project, config, secret_name}
   - doppler_secret_rotation_overdue{project, config, secret_name}
7. Create Grafana alert rules:
   - Warning: secret age > 80% of rotation period
   - Critical: secret age > rotation period (overdue)
8. Create secrets lifecycle dashboard: grafana/dashboards/infrastructure/secrets-lifecycle.json

### Phase 3: Audit Log Integration
9. Create Alloy pipeline to poll Doppler audit log API:
   - GET https://api.doppler.com/v3/logs (with service token)
   - Forward structured events to Loki
10. Create Grafana dashboard: grafana/dashboards/infrastructure/doppler-audit.json
    - Secret access patterns, config changes, user activity
11. Set up alerts for suspicious patterns:
    - Secret accessed from unknown IP
    - Bulk secret reads
    - Config deletions

### Phase 4: Automation
12. Add `dk secrets setup` to dk-cli (via Platform API)
13. Automate Doppler project creation following naming convention:
    - `<product>-applications` (dev, stg, prd)
    - `dk-alchemy-<service>` (prd)
14. Add secret rotation reminders to weekly governance reports

## dk-alchemy Changes
- MODIFY: k8s/infrastructure/alloy/base/values.yaml (add Doppler audit scrape — BLOCKING for alerts to fire)
- CREATE: grafana/dashboards/infrastructure/secrets-lifecycle.json (NOT yet created)
- CREATE: grafana/dashboards/infrastructure/doppler-audit.json (NOT yet created)
- ~~DONE~~: grafana/alerts/secrets.yaml ✅ (deployed, in noData state pending Alloy pipeline)
- ~~DONE~~: docs/runbooks/secret-rotation.md ✅ (237 lines, comprehensive)

## Verification
- Grafana dashboard shows all secrets with age and rotation status
- Alert fires when test secret exceeds rotation period
- Doppler audit events appear in Loki within 5 minutes
- dk secrets setup creates properly structured Doppler project
- Rotation runbook covers all secret types with step-by-step procedures

## Options/Recommendations
**Audit Log Integration:**
- **Option A (Recommended): Alloy polling** — Poll Doppler API every 5m, push to Loki. Simple, no webhook infrastructure needed.
- **Option B: Doppler webhooks** — Doppler can send webhook events. Requires Platform API webhook endpoint. Lower latency but more complex.

**Recommendation:** Option A for simplicity. Upgrade to Option B when Platform API is deployed.
