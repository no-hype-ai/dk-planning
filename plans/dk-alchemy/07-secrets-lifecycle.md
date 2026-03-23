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
- Grafana alert routing (Plan 02 contact points) should be in place for expiry alerts

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
- MODIFY: k8s/infrastructure/alloy/base/values.yaml (add Doppler audit scrape)
- CREATE: grafana/dashboards/infrastructure/secrets-lifecycle.json
- CREATE: grafana/dashboards/infrastructure/doppler-audit.json
- CREATE: grafana/alerts/secrets.yaml (expiry alerts)
- CREATE: docs/runbooks/secret-rotation.md

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
