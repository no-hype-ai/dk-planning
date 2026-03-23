# Incident Management

## Overview

Incident management covers on-call escalation, SLOs/error budgets, and the bridge between observability alerts and human response. Today this is **[Slack](https://api.slack.com/)-only** with no formal on-call rotation or SLO framework. This document defines the current state and target model.

## Current State

### Alert Routing

| Contact Point | Channel | Scope |
|---------------|---------|-------|
| `platform-slack` | `#dk-alerts` | Default; `team=platform` alerts |
| `dk-data-slack` | `#dk-data-fe` | `team=data-platform` alerts |
| probe-service | Direct webhook | State-change (up/down) notifications |
| sentinel-probe | Direct webhook | `[SENTINEL]` prefixed state-change notifications |

### Notification Policy

- Group by: alertname, severity
- Group wait: 30s, group interval: 5m, repeat interval: 4h
- No escalation tiers, no phone/push notifications, no PagerDuty/OpsGenie

### What's Missing

- No on-call rotation
- No escalation (warning → critical → page)
- No SLOs or error budgets
- No incident lifecycle (declare → respond → resolve → postmortem)
- No automated issue creation from alerts

## SLOs & Error Budgets (Target)

### Proposed SLOs

| Service | SLI | Target | Window | Alert Strategy |
|---------|-----|--------|--------|----------------|
| behavior-labs-api | Success rate (non-5xx / total) | 99.5% | 30-day rolling | Multi-window burn rate |
| behavior-labs-app | Availability (`probe_target_up`) | 99.9% | 30-day rolling | Multi-window burn rate |
| behavior-labs-api | P95 latency | < 1s | 30-day rolling | Threshold alert |
| LiteLLM proxy | Success rate | 99.0% | 30-day rolling | Multi-window burn rate |
| Edge LB | VIP availability | 99.99% | 30-day rolling | Immediate page |

### Implementation

1. **[Mimir](https://grafana.com/docs/mimir/latest/) recording rules** — precompute SLI metrics (error ratios, latency percentiles)
2. **[Grafana](https://grafana.com/docs/grafana/latest/) SLO dashboards** — populate the empty `slo/` folder with:
   - Error budget remaining (%)
   - Burn rate over time
   - SLO compliance history
3. **Burn-rate alerting** (multi-window):
   - 1h/6h windows → page on-call (fast burn)
   - 3d window → create ticket (slow burn)

## On-Call Escalation (Target)

### Recommended: Grafana OnCall

Deploy **[Grafana OnCall](https://grafana.com/docs/oncall/latest/)** (open-source, self-hosted) in dk-alchemy's infrastructure. Alternative: PagerDuty or OpsGenie if managed service preferred.

### Escalation Tiers

| Tier | Trigger | Action | Response Time |
|------|---------|--------|---------------|
| **Info** | Info-severity alert | Slack notification only | Best effort |
| **Warning** | Warning-severity alert | Slack channel + auto-resolve if recovered in 15m | 30m |
| **Critical** | Critical-severity alert | Page on-call (phone/push) | 5m |
| **Unacknowledged** | Critical not ack'd in 10m | Escalate to secondary on-call | Immediate |

### Routing

Route by `team` label (same as current Slack routing):
- `team=platform` → platform on-call rotation
- `team=data-platform` → data team on-call rotation
- `team=<product>` → product team rotation (as products onboard)

## Automated Error-to-Issue Pipeline

Bridge alerts to the [Issue Governance](issue-governance.md) system:

1. **Grafana alert fires** (e.g., `app-high-error-rate`)
2. **Grafana webhook** triggers a service or GitHub Action that:
   - Creates a GitHub issue with structured template:
     - Error signature
     - Affected service and namespace
     - Dashboard link
     - LogQL query link
     - Trace ID (if available)
   - Applies labels: `priority/P1`, `status/triage`, `team/<product>`
3. **Deduplication** — hash (alert name + service + namespace), check for existing open issues
4. **Lifecycle** — existing issue governance scripts manage from there

## Incident Lifecycle (Target)

### Process

```
Alert fires → Auto-create issue (if no duplicate)
           → Page on-call (if critical)
           → Acknowledge (stops escalation)
           → Investigate (trace → logs → dashboard)
           → Resolve (close alert, update issue)
           → Postmortem (if P0/P1, within 48h)
```

### Postmortem Template

For P0/P1 incidents, create a GitHub issue with label `postmortem` within 48 hours of resolution:

```markdown
## Incident Summary
- **Incident:** [Title]
- **Severity:** P0 / P1
- **Duration:** [Start time] – [End time] ([total duration])
- **Detected by:** [Alert name / user report / sentinel-probe]
- **Resolved by:** [Name]

## Timeline
| Time (UTC) | Event |
|------------|-------|
| HH:MM | Alert fired / incident detected |
| HH:MM | On-call acknowledged |
| HH:MM | Root cause identified |
| HH:MM | Fix deployed |
| HH:MM | Monitoring confirms recovery |

## Impact
- **Users affected:** [count or percentage]
- **Services affected:** [list]
- **Data loss:** [none / describe]
- **SLO budget consumed:** [X% of 30-day budget]

## Root Cause
[Describe the underlying cause — not just the symptom]

## Detection
- How was this detected? Could it have been detected earlier?
- Were existing alerts effective?

## Resolution
- What fixed the issue?
- Were there any difficulties in the response?

## Action Items
| Action | Owner | Deadline | Issue |
|--------|-------|----------|-------|
| [Preventive action] | [Name] | [Date] | #NNN |
| [Detection improvement] | [Name] | [Date] | #NNN |
| [Process improvement] | [Name] | [Date] | #NNN |

## Lessons Learned
- What went well?
- What could be improved?
```

**Process:**
1. Incident responder creates the postmortem issue within 48 hours
2. Team reviews and fills in details collaboratively
3. Action items are tracked as separate linked issues with deadlines
4. Postmortem is reviewed in the next team sync

## ArgoCD Deployment Notifications

### Current State

No deployment notifications — [ArgoCD](https://argo-cd.readthedocs.io/) sync successes, failures, and drift are not surfaced.

### Recommendation

Deploy **ArgoCD Notification Controller** in dk-alchemy, integrated with Slack:

- Sync success → `#dk-deploys` (info)
- Sync failure → team-specific alert channel (warning)
- Drift detected → team-specific alert channel (warning)
- Health degraded → team-specific alert channel + on-call (critical)

Route by ArgoCD Application labels (`team`, `product`) using the same routing taxonomy as Grafana alerts.

### SLO Recording Rule Examples

Precompute SLI metrics via Mimir recording rules so dashboards and burn-rate alerts query efficiently:

```yaml
# grafana/recording-rules/slo.yaml
groups:
  - name: slo-recording-rules
    interval: 1m
    rules:
      # Error ratio (non-5xx / total) — 5m window
      - record: slo:http_requests:error_ratio_5m
        expr: |
          1 - (
            sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
            /
            sum(rate(http_requests_total[5m])) by (service)
          )

      # Error ratio — 30m window (for slow burn detection)
      - record: slo:http_requests:error_ratio_30m
        expr: |
          1 - (
            sum(rate(http_requests_total{status=~"5.."}[30m])) by (service)
            /
            sum(rate(http_requests_total[30m])) by (service)
          )

      # Error budget remaining (30-day window, 99.5% target)
      - record: slo:http_requests:error_budget_remaining
        expr: |
          1 - (
            (1 - slo:http_requests:error_ratio_30m)
            /
            (1 - 0.995)
          )

      # P95 latency
      - record: slo:http_request_duration:p95_5m
        expr: |
          histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))
```

Populate the `slo/` dashboard folder with dashboards that query these recording rules for error budget burn rate, compliance history, and SLO status per service.

## Gaps

- **No on-call rotation** — Slack-only, no paging
- **No SLOs** — `slo/` dashboard folder is empty; recording rule examples defined above
- **No incident lifecycle** — no formal declare/respond/resolve/postmortem flow
- **No automated issue creation** from alerts
- **No deployment notifications** — ArgoCD sync status not surfaced to teams

## Related Documentation

- [Observability](observability.md) — alert rules and contact points
- [Issue Governance](issue-governance.md) — automated issue lifecycle management
- [Application Instrumentation](application-instrumentation.md) — what generates the telemetry
- [Standards Compliance](standards-compliance.md) — observability tier requirements
