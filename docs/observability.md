# Observability

## Overview

Data Kinetic runs a self-hosted **LGTM stack** ([Loki](https://grafana.com/docs/loki/latest/), [Grafana](https://grafana.com/docs/grafana/latest/), [Tempo](https://grafana.com/docs/tempo/latest/), [Mimir](https://grafana.com/docs/mimir/latest/)) managed centrally in dk-alchemy. [Grafana Alloy](https://grafana.com/docs/alloy/latest/) collects all signals (metrics, logs, traces) and routes them to the appropriate backend. Product repos connect via an [OpenTelemetry](https://opentelemetry.io/docs/) (OTLP) [Kustomize](https://kubectl.docs.kubernetes.io/references/kustomize/) component.

For application-level instrumentation (OTel SDK, Sentry migration, health checks), see [Application Instrumentation](application-instrumentation.md).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  dk-alchemy  (k8s/infrastructure/)                              │
│                                                                 │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐    │
│  │  Grafana  │   │   Loki   │   │  Mimir   │   │  Tempo   │    │
│  │  11.3.0   │   │  3.2.1   │   │  2.14.1  │   │  2.6.1   │    │
│  │ dashboards│   │ 30d ret. │   │ 30d ret. │   │ 30d ret. │    │
│  │ alerts    │   │ 500Gi    │   │ 200Gi    │   │ 200Gi    │    │
│  └────┬──────┘   └────▲─────┘   └────▲─────┘   └────▲─────┘    │
│       │               │              │              │           │
│       │          ┌────┴──────────────┴──────────────┴───┐       │
│       │          │          Grafana Alloy (DaemonSet)    │       │
│       │          │  OTLP gRPC :4317 / HTTP :4318        │       │
│       │          │  + kubelet, cAdvisor, KSM scraping    │       │
│       │          │  + pod log collection                 │       │
│       │          │  + annotated pod/service scraping     │       │
│       │          └──────────▲────────────────────────────┘       │
│       │                     │                                   │
│  ┌────┴──────┐    ┌────────┴─────────┐    ┌──────────────┐     │
│  │ Dashboards│    │ OTLP Component   │    │ probe-service│     │
│  │ 26 JSON   │    │ ExternalName svc │    │ sentinel-    │     │
│  │ 4 folders │    │ → alloy.infra    │    │ probe (AWS)  │     │
│  └───────────┘    └──────────────────┘    └──────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Collection — Grafana Alloy

Alloy runs as a **DaemonSet** with `hostNetwork: true`, tolerating all taints.

### What It Collects

| Signal | Source | Method |
|--------|--------|--------|
| **Metrics** | kubelet, cAdvisor, kube-state-metrics | [Prometheus](https://prometheus.io/docs/) scrape (30s) |
| **Metrics** | Pods with `prometheus.io/scrape: "true"` | Prometheus scrape (30s) |
| **Metrics** | Services with `prometheus.io/scrape: "true"` | Prometheus scrape (30s) |
| **Metrics** | LiteLLM, vLLM GPU | Static scrape targets |
| **Metrics** | Application OTLP | OTLP receiver → Mimir remote_write |
| **Traces** | Application OTLP | OTLP receiver → Tempo |
| **Logs** | All pod stdout/stderr | `loki.source.kubernetes` (per-node) |
| **Logs** | Application OTLP | OTLP receiver → Loki |

### OTLP Endpoints

- gRPC: `:4317` (ClusterIP service)
- HTTP: `:4318` (ClusterIP service)

### How Product Repos Connect

Include the **OTLP collector Kustomize component** (`k8s/components/otlp-collector/`) in your app's kustomization. This creates an ExternalName service (`otlp-collector`) in your namespace resolving to `alloy.infra.svc.cluster.local`. Apps send telemetry to `otlp-collector:4317` (gRPC) or `otlp-collector:4318` (HTTP).

## Storage Backends

All run as single-replica StatefulSets on `local-path-bulk`:

| Backend | Version | Storage | Retention | Config |
|---------|---------|---------|-----------|--------|
| **Loki** | 3.2.1 | 500Gi | 30 days | TSDB store, v13 schema, 10 MB/s ingestion rate, 5000 max query series |
| **Mimir** | 2.14.1 | 200Gi | 30 days | Monolithic mode (`target=all`), unlimited series per user, 100k ingestion rate |
| **Tempo** | 2.6.1 | 200Gi | 30 days | OTLP gRPC + HTTP receivers, no sampling configured (all traces stored) |

### Datasources (provisioned in Grafana)

| Name | Type | Endpoint | Notes |
|------|------|----------|-------|
| Mimir | prometheus | `http://mimir:8080/prometheus` | Default datasource, `manageAlerts: true` |
| Loki | loki | `http://loki:3100` | maxLines: 1000 |
| Tempo | tempo | `http://tempo:3200` | tracesToLogsV2 linking to Loki by job/namespace |

## Dashboards

26 JSON dashboards stored in `grafana/dashboards/`, synced via CI on push to main. PR previews validate JSON and post diffs.

| Folder | Dashboards |
|--------|------------|
| **cluster/** | cluster-overview |
| **infrastructure/** | alloy, arc-runners, argocd, cert-manager, doppler, minio, postgres-cnpg, probe-service, redis, traefik, webhook-service |
| **observability/** | loki, mimir, tempo (self-monitoring) |
| **applications/** | api-performance, behavior-labs-admin, behavior-labs-api, behavior-labs-apps, dk-data-api, dk-data-pipeline, dk-data-platform-status, dk-data-postgrest-slo, feature-usage, litellm, lithium-overview, org-analytics, product-analytics |
| **slo/** | *(empty — placeholder)* |

### Dashboard GitOps

- `grafana/scripts/sync-all.sh` — syncs folders, dashboards, alerts (supports `--dry-run`, `--force`)
- `grafana/scripts/export-all.sh` — exports all dashboards from Grafana to repo
- `grafana/scripts/diff-dashboards.sh` — diffs repo vs. live Grafana state
- `grafana/scripts/validate.sh` — validates JSON and alert YAML
- `.github/workflows/grafana-dashboards.yaml` — syncs on push to main
- `.github/workflows/grafana-pr-preview.yaml` — validates on PR, posts preview

## Alert Rules

26 rules across 4 files in `grafana/alerts/`:

Alert rules are organized across 4 files: applications (4 rules), dk-data (12), infrastructure (6), litellm (6).

### applications.yaml (4 rules)

| Rule | Condition | Severity |
|------|-----------|----------|
| `app-high-error-rate` | 5xx rate > 5% for 5m | warning |
| `app-high-latency` | P95 > 2s for 5m | warning |
| `app-pod-restarts` | >3 restarts in 30m | warning |
| `app-deployment-unavailable` | Unavailable replicas for 10m | critical |

### infrastructure.yaml (6 rules)

| Rule | Condition | Severity |
|------|-----------|----------|
| `pod-crash-looping` | >3 restarts in 15m | warning |
| `pod-not-ready` | Non-running for 10m | warning |
| `high-cpu-usage` | >90% CPU limit for 10m | warning |
| `high-memory-usage` | >90% memory limit for 10m | warning |
| `pv-near-full` | PV >85% full for 15m | warning |
| `pv-critical` | PV >95% full for 5m | critical |

### dk-data.yaml (12 rules)

Sync failures, backend down, quarantine queue depth, API latency, transform duration, error rate, stale sources, OOM kills, error log spikes (Loki-based).

### litellm.yaml (6 rules)

LLM proxy down, high error rate, rate-limiting, latency, budget exhaustion, token burn rate.

## Alerting Delivery

### Contact Points

| Contact Point | Channel | Team |
|--------------|---------|------|
| `platform-slack` | #dk-alerts | Platform (default) |
| `dk-data-slack` | #dk-data-fe | DK Data |

### Notification Policy

**Notification routing:** Alerts route by `team` label, grouped by `alertname` + `severity`. Group wait: 30s, group interval: 5m, repeat interval: 4h.

### Gap

No PagerDuty, OpsGenie, or phone escalation. See [Incident Management](incident-management.md) for recommendations.

## Synthetic Monitoring

### probe-service (In-Cluster)

- Deployed in `probe` namespace
- Routes through edge LB (10.0.0.2) to validate the full request path
- Probe types: HTTP (static + auto-discovered via [Traefik](https://doc.traefik.io/traefik/) API), DNS (Route53 via 8.8.8.8), TCP
- External validation via check-host.net API (3 vantage points)
- Metrics: `probe_target_up`, `probe_http_status_code`, `probe_target_latency_seconds`
- Slack state-change notifications (up/down transitions)
- 60s interval, 10s timeout

**Probe service targets (18 total):**
- **HTTP probes (11):** prod/staging app, API, and admin endpoints + ArgoCD, Grafana, LiteLLM, bare domain
- **External probes (5):** via check-host.net — validates WAN ingress from outside the network for app, ArgoCD, Grafana, LiteLLM, Enercore
- **DNS probes (6):** Route53 A record resolution via public DNS (8.8.8.8), all resolve to 66.68.93.103 (WAN IP)
- **TCP probes (6):** k3s-traefik (10.0.0.11:443), edge phantom/venom (10.0.0.2/3:443), edge API (10.0.0.2:8080), preview-vm (10.0.0.51:80)

### sentinel-probe (External, AWS EC2)

- Runs outside the network, connected via WireGuard VPN
- TLS certificate expiry checking
- Detailed HTTP timing: DNS, connect, TLS handshake, TTFB, total
- DNS resolution against 8.8.8.8 and 1.1.1.1
- WAN port checks (HTTPS/HTTP on 66.68.93.103)
- WireGuard tunnel health monitoring
- Mimir push endpoint reachability
- Metrics: `sentinel_target_up`, `sentinel_tls_expiry_days`, `sentinel_latency_*_seconds`
- 30s interval, 10s timeout

## Product Repo Self-Service Monitoring

### Target Model

Product repos should contribute their own dashboards and alerts, deployed automatically as part of their ArgoCD stack. See [Application Instrumentation](application-instrumentation.md#self-deployed-monitoring) for the full pattern.

```
monitoring/
  dashboards/
    <service>-overview.json     # uid: <product>-<service>-overview
    <service>-slo.json          # uid: <product>-<service>-slo
  alerts/
    <service>.yaml              # labels: team, service, product, severity
  recording-rules/              # optional
    <service>.yaml
```

### Naming Conventions

```yaml
# Dashboard JSON:
#   "tags": ["<product>", "<service>", "auto-deployed"]
#   "uid": "<product>-<service>-<name>"  (globally unique)

# Alert rules:
#   team: <product-team>
#   service: <service-name>
#   product: <product-name>
#   severity: warning|critical
```

dk-alchemy's notification policy routes by `team` label. New teams register a Slack contact point via PR to `grafana/provisioning/alerting/contact-points.yaml`.

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  dk-alchemy (platform owner)                                            │
│                                                                         │
│  Infrastructure Observability          │  Shared Services                │
│  ├── Grafana (dashboards, alerts, SLOs)│  ├── Alloy (OTLP collector)    │
│  ├── Loki (logs, 30d)                  │  ├── OTLP component (ExternalName)│
│  ├── Mimir (metrics, 30d)              │  ├── Grafana OnCall (escalation)│
│  ├── Tempo (traces, 30d)               │  ├── Pyroscope (profiling)     │
│  ├── Pyroscope (profiles)              │  └── Faro collector endpoint   │
│  ├── probe-service (internal)          │                                │
│  ├── sentinel-probe (external)         │  Shared Config                 │
│  ├── Infra dashboards & alerts         │  ├── Notification policies     │
│  └── SLO recording rules              │  ├── Contact points per team   │
│                                        │  └── Dashboard folder structure│
├────────────────────────────────────────┴────────────────────────────────┤
│  Product Repos (self-serve monitoring)                                  │
│                                                                         │
│  behavior-labs-ai/                   dk-compliance-v2/                  │
│  ├── @datakinetic/observability      ├── @datakinetic/observability     │
│  ├── @repo/analytics (PostHog)       ├── monitoring/dashboards/         │
│  ├── monitoring/dashboards/          ├── monitoring/alerts/             │
│  ├── monitoring/alerts/              └── k8s (includes otlp-collector)  │
│  ├── monitoring/recording-rules/                                        │
│  ├── k8s (includes otlp-collector)   carbon-5/ lithium-5/ DK-OS/       │
│  └── scripts/issues/ (governance)    └── (same structure)               │
│                                                                         │
│  All product repos:                                                     │
│  ├── OTel traces/metrics/logs → Alloy → Loki/Mimir/Tempo              │
│  ├── PostHog events → PostHog Cloud (product analytics)                │
│  ├── Faro RUM → Alloy → Mimir (frontend performance)                  │
│  ├── Dashboards auto-deploy via Kustomize component                    │
│  └── Alerts auto-deploy via Kustomize component                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### SLO Dashboard Content

The `slo/` folder should contain dashboards that query the SLO recording rules defined in [Incident Management](incident-management.md#slo-recording-rule-examples):

- **slo-overview.json** — all services' error budget remaining, compliance status, burn rate
- **slo-detail.json** — per-service deep dive: error ratio over time, budget consumption, SLO compliance history

Each SLO dashboard should use `slo:http_requests:error_budget_remaining` and `slo:http_requests:error_ratio_5m` recording rules as the primary data sources.

## Dashboard Contribution Quick-Start

Product repos contribute their own dashboards and alerts, deployed automatically via Kustomize components. Note: [`dk-template`](https://github.com/data-kinetic/dk-template) generates the `monitoring/` directory with placeholder dashboard and alert files following the conventions below — see [Template Repository](template-repo.md).

Here's how to add a dashboard:

### 1. Create Dashboard JSON

```bash
# Export from Grafana UI or create from scratch
# Save to: monitoring/dashboards/<service>-overview.json
```

**Required fields:**
```json
{
  "uid": "<product>-<service>-overview",
  "title": "<Product> <Service> Overview",
  "tags": ["<product>", "<service>", "auto-deployed"],
  "editable": false
}
```

### 2. Create Alert Rules

```yaml
# monitoring/alerts/<service>.yaml
apiVersion: 1
groups:
  - name: <service>-alerts
    folder: applications
    rules:
      - title: <service>-high-error-rate
        condition: C
        labels:
          team: <product-team>
          service: <service-name>
          product: <product-name>
          severity: warning
```

### 3. Include Kustomize Components

Add to your service's `overlays/prod/kustomization.yaml`:
```yaml
components:
  - ../../../../components/grafana-dashboards
  - ../../../../components/grafana-alerts
```

### 4. Validate in CI

Add dashboard JSON validation to your CI pipeline. See [Standards Compliance](standards-compliance.md) Tier 2 for automated checks.

## Gaps

- **SLO dashboards empty** — `slo/` folder exists but recording rules and dashboards are defined; implementation pending
- **No trace correlation in app dashboards** — Tempo data exists but dashboards don't deep-link to traces
- **Single-replica backends** — Loki/Mimir/Tempo are single-replica; acceptable at current scale
- **No sampling strategy** — all traces stored (Tempo); may need head/tail sampling at scale
- **Product repos don't contribute dashboards** — all dashboards live in dk-alchemy; quick-start guide above should enable adoption
- **No ArgoCD Notification Controller** — deployment status, drift alerts, and sync failures are not surfaced to Slack

## Related Documentation

- [Application Instrumentation](application-instrumentation.md) — OTel SDK, health checks
- [Incident Management](incident-management.md) — SLOs, on-call, escalation
- [Template Repository](template-repo.md) — generates monitoring directory with placeholder dashboards/alerts
- [Standards Compliance](standards-compliance.md) — observability compliance checks (Tier 2)
- [Infrastructure](infrastructure.md) — backend storage, networking
