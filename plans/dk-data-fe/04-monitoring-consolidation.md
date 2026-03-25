# Plan 04: Monitoring Consolidation

## Goal

Consolidate monitoring artifacts into the `monitoring/` directory pattern expected by dk-template, add Grafana dashboards as code, and standardize alert rule labels.

## Current State

| Area | Current | Target |
|------|---------|--------|
| Alert rules | `k8s/base/alert-rules.yaml` — 12 rules, 5 groups | `monitoring/alerts/dk-data.yaml` with `product`/`service` labels |
| Grafana dashboards | No dashboards as code (may exist manually in Grafana) | `monitoring/dashboards/*.json` provisioned via Kustomize |
| ServiceMonitor | `k8s/base/service-monitor.yaml` — Probe, ServiceMonitor, 2x PodMonitor | Stays in k8s/base (monitoring CRDs belong with manifests) |
| Alert labels | `severity` + `team` present | Add `product: dk-data`, `service: dk-data` |

### Existing Alert Groups

| Group | Rules | Description |
|-------|-------|-------------|
| `dk-data.data-freshness` | DataSourceStale, DataSourceCriticallyStale | Data source refresh monitoring (48h warning, 7d critical) |
| `dk-data.api-health` | APIHighErrorRate, APIUnavailable | PostgREST 5xx rate + blackbox probe |
| `dk-data.batch-jobs` | BatchJobFailed, CronJobMissedSchedule | CronJob failure + schedule drift |
| `molecule-pipeline` | MoleculeFetchFailed, MoleculeTransformStale, BronzeToSilverBacklog, EntityResolutionQueueHigh, MoleculeQuarantineHigh | Bronze→Silver→Gold pipeline health |
| `dk-data.resources` | PodHighMemory, JobTriggerNotReady | Resource utilization + readiness |

## Dependencies

| Dependency | Plan | Status | Blocking |
|-----------|------|--------|----------|
| Plan 01 audit complete | [01-platform-alignment-audit.md](01-platform-alignment-audit.md) | Not started | Gap verification |
| Grafana provisioning via dk-alchemy | dk-alchemy Grafana stack | Complete | Dashboard deployment method |
| dk-alchemy Slack contact point | dk-alchemy alerting config | Verify | Alert routing |

---

## Workstream 1: Directory Structure

### Step 1: Create `monitoring/` Directory

```
monitoring/
├── dashboards/
│   ├── dk-data-overview.json
│   └── dk-data-cronjobs.json
└── alerts/
    └── dk-data.yaml
```

---

## Workstream 2: Grafana Dashboards

### Step 2: dk-data-overview.json

A comprehensive operational dashboard for the dk-data platform.

**Dashboard spec:**
- **UID:** `dk-data-overview`
- **Title:** dk-data Platform Overview
- **Tags:** `["dk-data", "data-platform", "auto-provisioned"]`
- **Refresh:** 30s
- **Time range:** Last 6 hours

**Panel rows:**

| Row | Panels | Metrics |
|-----|--------|---------|
| **API Health** | Request rate, Error rate (5xx), P95 latency | `http_requests_total{namespace=~"dk-data-.*"}`, `probe_success{job="dk-data-postgrest"}` |
| **Job Trigger** | Request rate, Active connections, Queue depth | `http_requests_total{app="job-trigger"}`, FastAPI metrics |
| **Data Freshness** | Stale source count, Per-source last refresh | `dk_data_source_last_refresh_timestamp` |
| **Molecule Pipeline** | Bronze unprocessed, Transform success/fail, Resolution queue, Quarantine count | `dk_bronze_unprocessed_total`, `dk_resolution_queue_size`, `dk_quarantine_count` |
| **Resources** | CPU/Memory per deployment, Pod restart count | `container_cpu_usage_seconds_total`, `container_memory_usage_bytes`, `kube_pod_container_status_restarts_total` |

**Datasource:** Use variable `$datasource` defaulting to Mimir/Prometheus.

### Step 3: dk-data-cronjobs.json

A dedicated CronJob monitoring dashboard for the 20+ batch jobs.

**Dashboard spec:**
- **UID:** `dk-data-cronjobs`
- **Title:** dk-data CronJob Monitor
- **Tags:** `["dk-data", "cronjobs", "auto-provisioned"]`
- **Refresh:** 1m

**Panel rows:**

| Row | Panels | Metrics |
|-----|--------|---------|
| **CronJob Status Table** | Table: name, last success, last failure, duration, next schedule | `kube_cronjob_status_last_schedule_time`, `kube_cronjob_next_schedule_time`, `kube_job_status_succeeded`, `kube_job_status_failed` |
| **Failure Timeline** | Time series: failures per CronJob | `increase(kube_job_status_failed{namespace=~"dk-data-.*"}[1h])` |
| **Duration Trends** | Time series: job duration per CronJob | `kube_job_status_completion_time - kube_job_status_start_time` |
| **Molecule Pipeline** | Dedicated row: mol-fetch-daily/weekly/monthly, mol-transform | Same metrics filtered to `job_name=~"mol-.*"` |
| **Backup Jobs** | pg-backup-daily/weekly/verify status | `kube_job_status_*` filtered to backup jobs |

---

## Workstream 3: Alert Label Standardization

### Step 4: Add Missing Labels

Current alert rules in `k8s/base/alert-rules.yaml` have `severity` and `team` labels but are missing `product` and `service` labels required by the platform alerting framework.

Add to every rule's `labels:` block:

```yaml
labels:
  severity: warning|critical  # existing
  team: data-platform         # existing
  product: dk-data            # NEW
  service: dk-data            # NEW
```

This enables:
- Grafana notification policies to route by `product` label
- Cross-product alert dashboards to filter by product
- On-call routing by service

### Step 5: Copy to monitoring/alerts/

Copy the updated `k8s/base/alert-rules.yaml` content to `monitoring/alerts/dk-data.yaml`. This provides the canonical location per dk-template pattern while keeping the k8s/base reference for Kustomize to consume.

Options:
- **Option A:** Symlink `k8s/base/alert-rules.yaml` → `../../monitoring/alerts/dk-data.yaml`
- **Option B:** Keep both files (monitoring/ as canonical, k8s/base/ as deploy reference)
- **Option C:** Update `k8s/base/kustomization.yaml` to reference `../../monitoring/alerts/dk-data.yaml`

**Recommendation:** Option C — single source of truth in `monitoring/alerts/`, Kustomize references it via relative path.

Update in `k8s/base/kustomization.yaml`:
```yaml
resources:
  # ...existing...
  # Observability (requires Prometheus Operator CRDs)
  - service-monitor.yaml
  - ../../monitoring/alerts/dk-data.yaml   # was: alert-rules.yaml
```

Then delete `k8s/base/alert-rules.yaml`.

---

## Workstream 4: Verify Alert Routing

### Step 6: Confirm dk-alchemy Contact Point

Verify that dk-alchemy's Grafana alerting configuration has a contact point for dk-data alerts:

```bash
# In dk-alchemy repo
grep -r "dk-data" grafana/provisioning/alerting/ || echo "No contact point — needs dk-alchemy PR"
```

If missing, create a PR to dk-alchemy adding:
- Contact point: `dk-data-slack` → `#dk-data-alerts` Slack channel (or `#dk-infrastructure` if no dedicated channel)
- Notification policy route: match `product=dk-data`, route to `dk-data-slack`

---

## Workstream 5: Metering Observability

When the metering proxy sidecar is deployed (Plan 05), add consumer usage dashboards and metering alerts.

### Dependencies

- [Plan 05](05-api-integration-and-metering.md) — metering proxy must be deployed and exposing metrics

### Dashboards

Add `monitoring/dashboards/dk-data-metering.json` — consumer usage dashboard with:
- Consumer overview: total requests, unique consumers, active API keys
- Request volume by consumer and schema (stacked time series)
- Data transfer by consumer
- Rate limit utilization and rejections
- Latency P50/P95/P99 per consumer

### Alerts

Add `monitoring/alerts/dk-data-metering.yaml` with:
- `DataConsumerRateLimitHigh` — consumer using >80% of rate limit sustained 15m (warning)
- `DataConsumerUnauthorized` — >10 unauthorized requests in 5m (warning)
- `DataSchemaAccessDenied` — unauthorized schema access attempt (warning)
- `DataAPIKeyExpiringSoon` — key expires within 7 days (info)
- `DataUsageAnomaly` — consumer volume >3x 7-day rolling average (warning)

---

## Files to Create/Modify

```
dk-data-fe/
├── monitoring/
│   ├── dashboards/
│   │   ├── dk-data-overview.json          (new)
│   │   ├── dk-data-cronjobs.json          (new)
│   │   └── dk-data-metering.json          (new — after Plan 05)
│   └── alerts/
│       ├── dk-data.yaml                   (new — moved from k8s/base/alert-rules.yaml)
│       └── dk-data-metering.yaml          (new — after Plan 05)
├── k8s/base/
│   ├── kustomization.yaml                 (modify: alert-rules path)
│   └── alert-rules.yaml                   (delete — moved to monitoring/)
```

## Verification

- [ ] `monitoring/dashboards/dk-data-overview.json` is valid JSON and imports into Grafana without errors
- [ ] `monitoring/dashboards/dk-data-cronjobs.json` is valid JSON and imports into Grafana
- [ ] `kubectl kustomize k8s/overlays/prod` still renders PrometheusRule with all 12 alert rules
- [ ] All alert rules have `product: dk-data` and `service: dk-data` labels
- [ ] `monitoring/alerts/dk-data.yaml` is the only source for alert rules (no duplication)
- [ ] dk-alchemy has a contact point routing dk-data alerts to Slack

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Moving alert-rules.yaml breaks Kustomize build | Test `kubectl kustomize` after updating path; revert if broken |
| Dashboard JSON doesn't match actual metrics | Build dashboards from verified PromQL queries; test against staging Mimir |
| Missing contact point means alerts don't route | Verify in dk-alchemy before deploying alert label changes |
