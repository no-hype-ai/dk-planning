# Cost & Utilization Dashboards

## Context
The platform runs significant infrastructure — 8x A100 GPUs on krang, LiteLLM with per-app budgets, and a K3s cluster with dozens of pods — but there is no unified view of cost or resource efficiency. LiteLLM tracks per-app spend with budget alerts, but the data is only in the LiteLLM admin UI. GPU utilization is invisible (addressed by [dk-clusters/07](../dk-clusters/07-proxmox-monitoring.md)). K8s resource requests vs actual usage is uncorrelated. This plan creates dashboards and alerts to enable capacity planning, right-sizing, and cost accountability.

## Scope
- LLM cost dashboard (LiteLLM spend, model usage, cache efficiency)
- K8s resource efficiency dashboard (requests vs actual, overprovisioned pods)
- Unified cost & utilization overview (combines LLM + K8s + GPU + VM data)
- Cost optimization alerts
- Weekly cost summary to Slack

## Dependencies
- **Phases 1-2 have no dependencies** — LiteLLM and K8s metrics already flow through Alloy to Mimir
- **Phase 3 depends on [dk-clusters/07](../dk-clusters/07-proxmox-monitoring.md)** — GPU and VM-level metrics from pve-exporter and DCGM exporter

## Existing Work
- dk-alchemy: LiteLLM metrics scraped via Alloy static target (192.168.10.50:4000/metrics)
- dk-alchemy: Existing `litellm.json` dashboard (basic operational metrics)
- dk-alchemy: cAdvisor/KSM metrics in Mimir (pod resource usage)
- dk-alchemy: `grafana/alerts/litellm.yaml` — includes `LiteLLMBudgetExceeded` alert
- dk-planning docs: [litellm.md](../../docs/litellm.md) (virtual keys, budgets), [observability.md](../../docs/observability.md) (Alloy collection)

## Implementation Steps

### Phase 1: LLM Cost Dashboard
1. Identify available LiteLLM Prometheus metrics:
   - `litellm_spend_metric` — per-key/per-model spend
   - `litellm_total_tokens` — token consumption per model
   - `litellm_requests_metric` — request count per model/status
   - `litellm_cache_hit_metric` / `litellm_cache_miss_metric` — cache efficiency
   - Verify exact metric names against LiteLLM docs and `/metrics` endpoint
2. Create Grafana dashboard: `grafana/dashboards/platform/llm-cost.json`
   - **Spend Overview row:** Total spend (30d rolling), spend by app (stacked bar), spend by model (pie chart), daily spend trend line
   - **Budget row:** Per-app spend vs budget (gauge per virtual key), budget burn rate (will exceed budget in X days)
   - **Model Usage row:** Requests by model (stacked time series), tokens by model (input vs output), average tokens per request
   - **Efficiency row:** Cache hit rate (%), cost savings from cache, error rate by model, average latency by model
   - Variables: time range, app/key filter, model filter
3. Create alert rules in `grafana/alerts/llm-cost.yaml`:
   - `LLMBudgetApproaching`: app spend > 80% of monthly budget — warning
   - `LLMCacheHitRateLow`: cache hit rate < 30% sustained 24h — info (optimization opportunity)
   - `LLMSpendAnomaly`: daily spend > 3x 7-day rolling average — warning

### Phase 2: K8s Resource Efficiency Dashboard
4. Create Grafana dashboard: `grafana/dashboards/platform/k8s-efficiency.json`
   - **Cluster Overview row:** Total CPU requested vs actual (gauge), total memory requested vs actual (gauge), cluster utilization % (CPU and memory)
   - **Namespace row:** Per-namespace resource utilization table (requested, limit, actual, efficiency %), sorted by waste
   - **Pod Right-Sizing row:** Top 10 overprovisioned pods (request/actual ratio > 2x), top 10 underprovisioned pods (actual > 80% of request), recommendations table
   - **Trends row:** Cluster utilization over time (30d), namespace growth trend
   - Variables: namespace filter, time range
   - Queries use existing metrics: `container_cpu_usage_seconds_total`, `container_memory_working_set_bytes`, `kube_pod_container_resource_requests`, `kube_pod_container_resource_limits`
5. Create alert rules in `grafana/alerts/k8s-efficiency.yaml`:
   - `K8sOverprovisioned`: pod requesting > 3x actual CPU or memory sustained 7d — info
   - `K8sUnderprovisioned`: pod actual usage > 90% of request sustained 1h — warning (risk of OOM/throttling)
   - `K8sClusterCapacityHigh`: cluster CPU or memory utilization > 80% — warning

### Phase 3: Unified Cost & Utilization Overview
6. Create Grafana dashboard: `grafana/dashboards/platform/cost-overview.json`
   - **Summary row:** LLM monthly spend (stat), GPU fleet utilization % (stat), K8s cluster efficiency % (stat), VM resource utilization % (stat)
   - **LLM section:** Spend trend + top consumers (from Phase 1 data)
   - **GPU section:** Fleet utilization heatmap, idle GPU hours this month, power consumption trend (from dk-clusters/07 DCGM metrics)
   - **K8s section:** Cluster efficiency trend, top overprovisioned namespaces (from Phase 2 data)
   - **VM section:** Per-VM resource allocation vs usage (from dk-clusters/07 pve-exporter metrics)
   - **Optimization Recommendations panel:** Text panel with PromQL-driven recommendations (e.g., "3 pods are using <20% of requested CPU")
7. Create cost optimization alerts in `grafana/alerts/cost-optimization.yaml`:
   - `GPUFleetIdle`: all 8 GPUs < 5% utilization for 24h — info (significant idle cost)
   - `VMOverprovisioned`: VM using < 30% of allocated resources for 7d — info
8. Set up weekly cost summary:
   - Grafana scheduled report (PDF/image) sent to Slack #dk-infrastructure every Monday
   - Content: LLM spend summary, GPU utilization average, K8s efficiency score, top 3 optimization recommendations

## dk-alchemy Changes
- CREATE: `grafana/dashboards/platform/llm-cost.json`
- CREATE: `grafana/dashboards/platform/k8s-efficiency.json`
- CREATE: `grafana/dashboards/platform/cost-overview.json`
- CREATE: `grafana/alerts/llm-cost.yaml`
- CREATE: `grafana/alerts/k8s-efficiency.yaml`
- CREATE: `grafana/alerts/cost-optimization.yaml`
- Note: May need to create `grafana/dashboards/platform/` folder if it doesn't exist (existing dashboards are in `infrastructure/` and `applications/` folders)

## Verification
- LLM cost dashboard shows per-app spend matching LiteLLM admin UI values
- Cache hit rate panel shows non-zero data
- K8s efficiency dashboard identifies at least 1 overprovisioned pod (there will be some)
- Budget approaching alert fires when test key is set to low budget temporarily
- Unified overview dashboard loads all sections (Phase 3 GPU/VM panels show "no data" until dk-clusters/07 ships)
- Weekly Slack report delivers on Monday

## Options/Recommendations
**Dashboard Organization:**
- **Option A (Recommended): New `platform/` folder** — Create a new Grafana folder for cross-cutting platform dashboards (cost, efficiency). Keeps `infrastructure/` for component-level dashboards and `applications/` for product repo dashboards.
- **Option B: Add to `infrastructure/`** — Simpler, no new folder. But mixes operational dashboards with cost/efficiency views.

**Recommendation:** Option A. The cost dashboards serve a different audience (capacity planning, budget review) than the infrastructure dashboards (on-call, debugging).
