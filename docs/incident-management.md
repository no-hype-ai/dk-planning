# Incident Management

## Overview

Incident management covers on-call escalation, SLOs/error budgets, and the bridge between observability alerts and human response. Today this is **Slack-only** with no formal on-call rotation or SLO framework. This document defines the current state and target model.

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

1. **Mimir recording rules** — precompute SLI metrics (error ratios, latency percentiles)
2. **Grafana SLO dashboards** — populate the empty `slo/` folder with:
   - Error budget remaining (%)
   - Burn rate over time
   - SLO compliance history
3. **Burn-rate alerting** (multi-window):
   - 1h/6h windows → page on-call (fast burn)
   - 3d window → create ticket (slow burn)

## On-Call Escalation (Target)

### Recommended: Grafana OnCall

Deploy **Grafana OnCall** (open-source, self-hosted) in dk-alchemy's infrastructure. Alternative: PagerDuty or OpsGenie if managed service preferred.

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

<!-- TODO: Create postmortem template -->

For P0/P1 incidents:
- Timeline of events
- Root cause analysis
- Impact assessment (users affected, duration, data loss)
- Action items with owners and deadlines
- SLO budget impact

## ArgoCD Deployment Notifications

### Current State

No deployment notifications — ArgoCD sync successes, failures, and drift are not surfaced.

### Recommendation

Deploy **ArgoCD Notification Controller** in dk-alchemy, integrated with Slack:

- Sync success → `#dk-deploys` (info)
- Sync failure → team-specific alert channel (warning)
- Drift detected → team-specific alert channel (warning)
- Health degraded → team-specific alert channel + on-call (critical)

Route by ArgoCD Application labels (`team`, `product`) using the same routing taxonomy as Grafana alerts.

## Gaps

- **No on-call rotation** — Slack-only, no paging
- **No SLOs** — `slo/` dashboard folder is empty
- **No incident lifecycle** — no formal declare/respond/resolve/postmortem flow
- **No automated issue creation** from alerts
- **No postmortem process**
- **No deployment notifications** — ArgoCD sync status not surfaced to teams

## Related Documentation

- [Observability](observability.md) — alert rules and contact points
- [Issue Governance](issue-governance.md) — automated issue lifecycle management
- [Application Instrumentation](application-instrumentation.md) — what generates the telemetry
