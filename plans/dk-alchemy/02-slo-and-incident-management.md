# SLO & Incident Management

## Context

No SLOs are defined, no on-call rotation exists, and there is no incident lifecycle process. Alerts fire to Slack but do not create trackable issues, there is no escalation path, and no postmortem process. This is the most critical operational gap — without SLOs, there is no objective measure of service health, no error budgets to guide deployment velocity, and no data-driven way to prioritize reliability work.

See `../../docs/incident-management.md` for the full incident management design and `../../docs/observability.md` for the SLO framework specification.

## Scope

- Define SLOs for all production services with error budgets
- Deploy Mimir recording rules for SLI computation
- Create SLO dashboards (`slo-overview.json`, `slo-detail.json`)
- Deploy Grafana OnCall for on-call rotation and escalation
- Implement alert-to-issue bridge (Grafana alerts to GitHub Issues)
- Deploy ArgoCD Notification Controller for sync event routing
- Document incident lifecycle and postmortem process
- Finalize DR runbooks and establish test schedules

## Dependencies

- None (this is foundational infrastructure)

## Existing Work

- **dk-alchemy:** `grafana/dashboards/slo/` folder exists (empty, has README only)
- **dk-alchemy:** `grafana/alerts/` has 26 rules but no SLO-specific burn-rate alerts
- **dk-alchemy specs:** `002-k3s-infra-hardening` mentions observability requirements
- **dk-planning docs:** `../../docs/incident-management.md` (full design), `../../docs/observability.md` (SLO section), `../../docs/disaster-recovery.md`

## Implementation Steps

### Phase 1: SLO Definitions & Recording Rules (Week 1-2)

1. Define SLO targets for all production services:

   | Service | SLI | Target | Window |
   |---------|-----|--------|--------|
   | behavior-labs-api | Availability (non-5xx / total) | 99.5% | 30 days |
   | behavior-labs-app | Availability (non-5xx / total) | 99.9% | 30 days |
   | behavior-labs-api | Latency (P95 < 1s) | 99.0% | 30 days |
   | LiteLLM proxy | Availability (non-5xx / total) | 99.0% | 30 days |
   | Edge LBs (Traefik) | Availability (non-5xx / total) | 99.99% | 30 days |
   | Platform API | Availability (non-5xx / total) | 99.5% | 30 days |

2. Create Mimir recording rules in `dk-alchemy/k8s/infrastructure/mimir/base/recording-rules.yaml`:
   - `slo:error_ratio:rate5m` — 5-minute error ratio per service
   - `slo:error_ratio:rate30m` — 30-minute error ratio per service
   - `slo:error_ratio:rate1h` — 1-hour error ratio per service
   - `slo:error_ratio:rate6h` — 6-hour error ratio per service
   - `slo:error_ratio:rate3d` — 3-day error ratio per service
   - `slo:error_budget_remaining:ratio` — remaining error budget per SLO
   - `slo:latency_percentile:p95` — pre-computed P95 latency per service

3. Create SLO overview dashboard: `dk-alchemy/grafana/dashboards/slo/slo-overview.json`
   - All SLOs at a glance: current availability vs target
   - Error budget burn rate (current consumption rate)
   - Error budget remaining (absolute and percentage)
   - 30-day trend sparklines per SLO
   - Color coding: green (> 50% budget), yellow (10-50%), red (< 10%)

4. Create SLO detail dashboard: `dk-alchemy/grafana/dashboards/slo/slo-detail.json`
   - Template variable: service selector
   - Burn-rate chart (multi-window: 1h, 6h, 3d)
   - Request rate and error rate time series
   - Latency heatmap and percentile lines
   - Recent incidents and alerts timeline
   - Error budget forecast (at current burn rate, when will budget exhaust?)

5. Create multi-window burn-rate alert rules in `dk-alchemy/grafana/alerts/slo.yaml`:
   - **Fast burn** (1h window, 14.4x burn rate): severity=critical, pages on-call immediately
   - **Slow burn** (6h window, 6x burn rate): severity=warning, alerts on-call with 15m auto-resolve
   - **Steady burn** (3d window, 1x burn rate): severity=info, creates GitHub issue for investigation
   - Each alert includes: dashboard link, runbook link, current error budget remaining

### Phase 2: Grafana OnCall (Week 3-4)

6. Deploy Grafana OnCall in `dk-alchemy/k8s/infrastructure/grafana-oncall/`:
   - `base/deployment.yaml` — OnCall engine + Celery workers
   - `base/service.yaml` — ClusterIP
   - `base/configmap.yaml` — Grafana integration URL, Slack bot token reference
   - `overlays/prod/kustomization.yaml` — production config
   - `overlays/prod/doppler-secret.yaml` — Slack bot token, Twilio credentials (for phone pages)

7. Configure escalation chains:

   | Severity | Step 1 | Step 2 | Step 3 |
   |----------|--------|--------|--------|
   | Info | Slack #dk-alerts | — | — |
   | Warning | Slack #dk-alerts + DM on-call | Auto-resolve if recovered in 15m | Escalate to admin after 30m |
   | Critical | Page on-call (push + phone) | Escalate to backup after 5m | Escalate to admin after 10m |

8. Configure team routing by alert `team` label:
   - `team=platform` → Platform on-call schedule
   - `team=product` → Product on-call schedule
   - Default → Platform on-call

9. Set up on-call schedules:
   - Platform team: weekly rotation, 24/7 coverage
   - Product team: business hours only (escalate to platform off-hours)
   - Override mechanism for vacations and swaps

### Phase 3: Alert-to-Issue Bridge (Week 5)

10. Create alert-to-issue integration:
    - Grafana webhook contact point → GitHub Actions workflow in `data-kinetic/.github`
    - Workflow receives alert payload, creates GitHub issue with:
      - Title: `[Alert] {alertname} - {service} in {namespace}`
      - Labels: `type/incident`, `status/triage`, `team/{team}`, `severity/{severity}`
      - Body: alert description, dashboard link, trace link, current values, runbook link
    - Deduplication: hash of (alert name + service + namespace), check for existing open issue
    - Auto-close issue when alert resolves (add comment with resolution time)
    - Issues enter the governance pipeline per `../../docs/issue-governance.md`

11. Configure Grafana webhook contact point:
    - Modify `dk-alchemy/grafana/provisioning/alerting/contact-points.yaml`
    - Add GitHub webhook endpoint alongside existing Slack contact point

### Phase 4: ArgoCD Notifications (Week 5-6)

12. Deploy ArgoCD Notification Controller in `dk-alchemy/k8s/infrastructure/argocd-notifications/`:
    - `base/configmap.yaml` — notification templates and triggers
    - `base/kustomization.yaml`
    - `overlays/prod/doppler-secret.yaml` — Slack webhook URL

13. Configure notification templates:
    - `sync-succeeded` — green checkmark, app name, commit SHA, duration
    - `sync-failed` — red alert, app name, error message, diff link
    - `health-degraded` — yellow warning, app name, degraded resources
    - `drift-detected` — orange warning, app name, drifted resources

14. Configure routing by ArgoCD Application labels:
    - `team=platform` → `#dk-platform-deploys`
    - `team=product` → `#dk-product-deploys`
    - Failures always also go to `#dk-alerts`

### Phase 5: Incident Lifecycle & DR (Week 6-7)

15. Document incident lifecycle in `dk-alchemy/docs/incident-response-runbook.md`:
    - Severity definitions (SEV1-SEV4) with examples
    - Roles: Incident Commander, Technical Lead, Communications Lead
    - Timeline: Detection → Triage (5m) → Mitigation → Resolution → Postmortem
    - Communication templates for each phase
    - Postmortem template (timeline, root cause, action items, lessons learned)
    - Blameless postmortem culture guidelines

16. Define RTO/RPO tiers in `dk-alchemy/docs/disaster-recovery-runbook.md`:

    | Tier | RTO | RPO | Services |
    |------|-----|-----|----------|
    | 1 (Critical) | 1 hour | 0 (sync replication) | Edge LBs, DNS |
    | 2 (High) | 4 hours | 1 hour | behavior-labs-api, behavior-labs-app |
    | 3 (Standard) | 24 hours | 24 hours | LiteLLM, preview environments |
    | 4 (Low) | 72 hours | 7 days | Grafana dashboards, dev tools |

17. Schedule DR tests:
    - **Weekly:** PostgreSQL backup restore to test namespace (automated)
    - **Monthly:** Single service failover and recovery
    - **Quarterly:** ArgoCD full rebuild from git (nuke ArgoCD, rebuild from manifests)
    - **Annually:** Full cluster rebuild (new K3s cluster, restore all workloads)

18. Implement automated backup verification:
    - CronJob: restore latest PostgreSQL backup to `dr-test` namespace
    - Run validation queries against restored database
    - Report results to `#dk-platform` Slack channel
    - Cleanup test namespace after validation
    - Alert if restore fails or validation queries return unexpected results

## dk-alchemy Changes

| Action | Path | Description |
|--------|------|-------------|
| CREATE | `k8s/infrastructure/mimir/base/recording-rules.yaml` | Mimir recording rules for SLI computation |
| CREATE | `grafana/dashboards/slo/slo-overview.json` | All-SLOs-at-a-glance dashboard |
| CREATE | `grafana/dashboards/slo/slo-detail.json` | Per-service SLO deep dive dashboard |
| CREATE | `grafana/alerts/slo.yaml` | Multi-window burn-rate alert rules |
| CREATE | `k8s/infrastructure/grafana-oncall/base/` | OnCall engine deployment |
| CREATE | `k8s/infrastructure/grafana-oncall/overlays/prod/` | Production config + DopplerSecret |
| CREATE | `k8s/infrastructure/argocd-notifications/base/` | Notification controller config |
| CREATE | `k8s/infrastructure/argocd-notifications/overlays/prod/` | Production secrets |
| CREATE | `docs/incident-response-runbook.md` | Incident lifecycle, severity definitions, postmortem template |
| CREATE | `docs/disaster-recovery-runbook.md` | RTO/RPO tiers, DR test schedule, restore procedures |
| MODIFY | `grafana/provisioning/alerting/contact-points.yaml` | Add GitHub webhook contact point |

## Verification

- SLO overview dashboard in Grafana shows all SLOs with real data, error budgets populated
- SLO detail dashboard shows per-service burn-rate charts and latency heatmaps
- Simulating a 5xx spike causes fast-burn alert to fire within 5 minutes
- OnCall pages on-call engineer for critical alerts (phone + push notification)
- Alert-to-issue bridge creates properly labeled GitHub issue on alert fire
- Alert-to-issue bridge auto-closes issue when alert resolves
- ArgoCD sync success/failure events appear in appropriate Slack channels
- PostgreSQL backup restore test passes in weekly CronJob
- DR test namespace is automatically cleaned up after validation

## Options/Recommendations

### OnCall Platform

**Option A (Recommended): Grafana OnCall**
Open-source, self-hosted, integrates natively with Grafana alerts and dashboards. No additional vendor cost. Supports phone, SMS, push, Slack, and email notifications. Built-in schedule management and escalation chains.

**Option B: PagerDuty**
SaaS, battle-tested at scale, excellent mobile app. Adds $21/user/month cost and introduces an external dependency. Better choice if the team scales beyond 10 on-call engineers.

**Option C: OpsGenie**
SaaS, Atlassian ecosystem integration. Good if already using Jira/Confluence. $9/user/month.

**Recommendation:** Grafana OnCall. Keeps the entire alerting pipeline in-house (Grafana alerts -> OnCall -> escalation -> resolution), aligns with the self-hosted LGTM observability strategy, and avoids vendor lock-in. If the team grows significantly, PagerDuty can be evaluated later — the alert rules and SLOs are platform-agnostic.
