# Observability: Dashboard & Alert Templates

**Status:** Complete

## Context

Every product service should ship with a baseline Grafana dashboard and alert rules. dk-template generates these scaffolds with product/service-specific UIDs and labels, deployed via Kustomize components that sync to Grafana.

See [observability architecture](../../docs/observability-architecture.md) and [dk-alchemy grafana components](../dk-alchemy/02-observability-components.md) for the platform-side implementation.

## Scope

- Grafana dashboard JSON template
- Alert rule YAML template
- OTLP Kustomize component reference in overlays
- Instrumentation bootstrap placeholder

## Dependencies

- [Plan 01 (Core Scaffold)](./01-core-scaffold.md) -- overlays reference Kustomize components
- dk-alchemy `grafana-dashboards` and `grafana-alerts` components must exist (see [dk-alchemy plans](../dk-alchemy/))
- `init.sh` from Plan 01 handles copying and placeholder replacement for monitoring files

## Implementation Steps

### Step 1: Create `monitoring/dashboards/{{service}}-overview.json`

Grafana dashboard JSON with:
- **UID:** `{{product}}-{{service}}-overview`
- **Title:** `{{product}} / {{service}} Overview`
- **Tags:** `["{{product}}", "{{service}}", "auto-deployed"]`
- **Folder:** `Applications`
- **Panels:**
  1. Request Rate (rate of HTTP requests, PromQL against Mimir)
  2. Error Rate (4xx/5xx percentage)
  3. P95 Latency (histogram quantile)
  4. Pod CPU Usage
  5. Pod Memory Usage
  6. Pod Restart Count
- **Variables:** `$namespace` (default: `{{namespace-prod}}`), `$service` (default: `{{service}}`)
- **Templating:** All queries filter by `{namespace="$namespace", service="$service"}`

```json
{
  "uid": "{{product}}-{{service}}-overview",
  "title": "{{product}} / {{service}} Overview",
  "tags": ["{{product}}", "{{service}}", "auto-deployed"],
  "timezone": "utc",
  "editable": false,
  "refresh": "30s",
  "time": {
    "from": "now-1h",
    "to": "now"
  },
  "templating": {
    "list": [
      {
        "name": "namespace",
        "type": "constant",
        "current": { "value": "{{namespace-prod}}" },
        "hide": 0
      },
      {
        "name": "service",
        "type": "constant",
        "current": { "value": "{{service}}" },
        "hide": 0
      }
    ]
  },
  "panels": [
    {
      "id": 1,
      "title": "Request Rate",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 8, "x": 0, "y": 0 },
      "targets": [
        {
          "datasource": { "type": "prometheus", "uid": "mimir" },
          "expr": "sum(rate(http_server_request_duration_seconds_count{namespace=\"$namespace\", service=\"$service\"}[5m]))",
          "legendFormat": "req/s"
        }
      ]
    },
    {
      "id": 2,
      "title": "Error Rate",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 8, "x": 8, "y": 0 },
      "targets": [
        {
          "datasource": { "type": "prometheus", "uid": "mimir" },
          "expr": "sum(rate(http_server_request_duration_seconds_count{namespace=\"$namespace\", service=\"$service\", http_response_status_code=~\"[45]..\"}[5m])) / sum(rate(http_server_request_duration_seconds_count{namespace=\"$namespace\", service=\"$service\"}[5m])) * 100",
          "legendFormat": "error %"
        }
      ],
      "fieldConfig": {
        "defaults": {
          "unit": "percent",
          "thresholds": {
            "steps": [
              { "color": "green", "value": null },
              { "color": "yellow", "value": 1 },
              { "color": "red", "value": 5 }
            ]
          }
        }
      }
    },
    {
      "id": 3,
      "title": "P95 Latency",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 8, "x": 16, "y": 0 },
      "targets": [
        {
          "datasource": { "type": "prometheus", "uid": "mimir" },
          "expr": "histogram_quantile(0.95, sum(rate(http_server_request_duration_seconds_bucket{namespace=\"$namespace\", service=\"$service\"}[5m])) by (le))",
          "legendFormat": "p95"
        }
      ],
      "fieldConfig": {
        "defaults": { "unit": "s" }
      }
    },
    {
      "id": 4,
      "title": "Pod CPU Usage",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 8, "x": 0, "y": 8 },
      "targets": [
        {
          "datasource": { "type": "prometheus", "uid": "mimir" },
          "expr": "sum(rate(container_cpu_usage_seconds_total{namespace=\"$namespace\", container=\"$service\"}[5m])) by (pod)",
          "legendFormat": "{{ pod }}"
        }
      ],
      "fieldConfig": {
        "defaults": { "unit": "cores" }
      }
    },
    {
      "id": 5,
      "title": "Pod Memory Usage",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 8, "x": 8, "y": 8 },
      "targets": [
        {
          "datasource": { "type": "prometheus", "uid": "mimir" },
          "expr": "sum(container_memory_working_set_bytes{namespace=\"$namespace\", container=\"$service\"}) by (pod)",
          "legendFormat": "{{ pod }}"
        }
      ],
      "fieldConfig": {
        "defaults": { "unit": "bytes" }
      }
    },
    {
      "id": 6,
      "title": "Pod Restart Count",
      "type": "stat",
      "gridPos": { "h": 8, "w": 8, "x": 16, "y": 8 },
      "targets": [
        {
          "datasource": { "type": "prometheus", "uid": "mimir" },
          "expr": "sum(increase(kube_pod_container_status_restarts_total{namespace=\"$namespace\", container=\"$service\"}[1h]))",
          "legendFormat": "restarts/hr"
        }
      ],
      "fieldConfig": {
        "defaults": {
          "thresholds": {
            "steps": [
              { "color": "green", "value": null },
              { "color": "yellow", "value": 1 },
              { "color": "red", "value": 3 }
            ]
          }
        }
      }
    }
  ]
}
```

### Step 2: Create `monitoring/alerts/{{service}}.yaml`

```yaml
apiVersion: 1
groups:
  - orgId: 1
    name: {{product}}-{{service}}
    folder: Alerts
    interval: 1m
    rules:
      - uid: {{product}}-{{service}}-high-error-rate
        title: "{{service}} High Error Rate"
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 300
              to: 0
            datasourceUid: mimir
            model:
              expr: |
                sum(rate(http_server_request_duration_seconds_count{namespace="{{namespace-prod}}", service="{{service}}", http_response_status_code=~"5.."}[5m]))
                /
                sum(rate(http_server_request_duration_seconds_count{namespace="{{namespace-prod}}", service="{{service}}"}[5m]))
              instant: true
          - refId: C
            datasourceUid: __expr__
            model:
              type: threshold
              conditions:
                - evaluator:
                    type: gt
                    params: [0.05]
        for: 5m
        labels:
          severity: warning
          team: {{team}}
          service: {{service}}
          product: {{product}}
        annotations:
          summary: "{{service}} error rate is above 5%"
          dashboard_url: "https://grafana.behaviorlabs.ai/d/{{product}}-{{service}}-overview"

      - uid: {{product}}-{{service}}-high-latency
        title: "{{service}} High Latency"
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 300
              to: 0
            datasourceUid: mimir
            model:
              expr: |
                histogram_quantile(0.95, sum(rate(http_server_request_duration_seconds_bucket{namespace="{{namespace-prod}}", service="{{service}}"}[5m])) by (le))
              instant: true
          - refId: C
            datasourceUid: __expr__
            model:
              type: threshold
              conditions:
                - evaluator:
                    type: gt
                    params: [2]
        for: 5m
        labels:
          severity: warning
          team: {{team}}
          service: {{service}}
          product: {{product}}
        annotations:
          summary: "{{service}} P95 latency is above 2s"

      - uid: {{product}}-{{service}}-pod-restarts
        title: "{{service}} Pod Restarts"
        condition: C
        data:
          - refId: A
            datasourceUid: mimir
            model:
              expr: |
                increase(kube_pod_container_status_restarts_total{namespace="{{namespace-prod}}", container="{{service}}"}[1h])
              instant: true
          - refId: C
            datasourceUid: __expr__
            model:
              type: threshold
              conditions:
                - evaluator:
                    type: gt
                    params: [3]
        for: 5m
        labels:
          severity: critical
          team: {{team}}
          service: {{service}}
          product: {{product}}
        annotations:
          summary: "{{service}} has restarted more than 3 times in the last hour"
```

### Step 3: Create `src/instrumentation.ts` placeholder

```typescript
// OpenTelemetry instrumentation bootstrap
// Replace with @datakinetic/observability when available
//
// import { initInstrumentation } from '@datakinetic/observability/instrumentation';
// initInstrumentation();
//
// See: https://github.com/data-kinetic/dk-planning/blob/main/docs/application-instrumentation.md

console.log('[instrumentation] OTel not yet configured — add @datakinetic/observability');
```

This file serves as a starting point. When the `@datakinetic/observability` package is available (see [dk-alchemy observability plan](../dk-alchemy/02-observability-components.md)), teams should replace this placeholder with the real instrumentation setup.

### Integration with Kustomize Components

The prod overlay from [Plan 01](./01-core-scaffold.md) references these dk-alchemy components:

- `grafana-dashboards` -- mounts dashboard JSON files as ConfigMaps with the `grafana_dashboard: "1"` label so Grafana's sidecar picks them up
- `grafana-alerts` -- deploys alert rule YAML as ConfigMaps with the `grafana_alert: "1"` label
- `otlp-collector` -- injects an OpenTelemetry collector sidecar for trace/metric export

The monitoring files in this plan are consumed by those components. The directory structure must match:

```
monitoring/
  dashboards/
    <service>-overview.json    # Picked up by grafana-dashboards component
  alerts/
    <service>.yaml             # Picked up by grafana-alerts component
```

## dk-template Files Created

- `monitoring/dashboards/{{service}}-overview.json`
- `monitoring/alerts/{{service}}.yaml`
- `src/instrumentation.ts`

## Verification

- Dashboard JSON is valid: `jq . monitoring/dashboards/{{service}}-overview.json`
- Dashboard UID matches pattern `{{product}}-{{service}}-overview`
- Alert rules have all required labels: `team`, `service`, `product`, `severity`
- Alert rules reference correct namespace (`{{namespace-prod}}`) and service (`{{service}}`)
- After `init.sh` runs, all `{{placeholders}}` are replaced with actual values
- After `init.sh` with `--service api --service worker`:
  - `monitoring/dashboards/api-overview.json` exists with UID `<product>-api-overview`
  - `monitoring/dashboards/worker-overview.json` exists with UID `<product>-worker-overview`
  - `monitoring/alerts/api.yaml` exists with group name `<product>-api`
  - `monitoring/alerts/worker.yaml` exists with group name `<product>-worker`
  - No files with `{{service}}` in the filename remain
