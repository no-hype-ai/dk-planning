# dk-data API Integration & Usage Metering

## Context

dk-data-fe exposes data via PostgREST (port 3000) and a FastAPI job-trigger (port 8000), but has no consumer authentication, usage metering, or rate limiting. As the data foundation for all DK applications, dk-data needs secure, metered API access integrated with the Platform API (`dk.datakinetic.com`).

This plan adds a metering proxy sidecar in front of PostgREST that validates consumer API keys, records per-request metrics, and enforces rate limits. The Platform API gets new `/dk/v1/data/*` endpoints for key lifecycle management and usage queries.

## Dependencies

- [Plan 01](01-platform-alignment-audit.md) — platform alignment audit (entry point)
- [dk-alchemy/01 Platform API](../dk-alchemy/01-platform-api.md) — Platform API must be deployed
- [dk-alchemy/14 Data Metering Endpoints](../dk-alchemy/14-data-metering-endpoints.md) — new Platform API router

## Architecture

```
Consumer apps (behavior-labs-ai, carbon-5, DK-OS)
  │
  │  Authorization: Bearer dk_data_...
  ▼
dk-data-metering-proxy (FastAPI sidecar, dk-data namespace, port 3001)
  │  ── validates API keys (issued by Platform API)
  │  ── records metrics to Prometheus (consumer, schema, volume, latency)
  │  ── enforces per-consumer rate limits (Redis token bucket)
  │  ── enforces schema-level access control
  │
  ▼
PostgREST (port 3000, ClusterIP — no longer externally exposed)
```

This follows the same proxy pattern as LiteLLM: the Platform API manages keys/budgets, and the sidecar enforces and meters at the data plane.

## Workstream 1: Metering Proxy Sidecar

### 1.1 Service Design

| Property | Value |
|----------|-------|
| **Name** | `dk-data-metering-proxy` |
| **Stack** | Python 3.11, FastAPI, httpx (async proxy), redis-py |
| **Port** | 3001 (external-facing), proxies to PostgREST at localhost:3000 |
| **Deployment** | Sidecar container in the PostgREST Deployment (shared pod) |
| **Config** | ConfigMap with allowed keys + schema ACLs (synced from Platform API) |
| **State** | Rate limit counters in Redis (`redis.infra.svc.cluster.local`) |

### 1.2 Request Flow

1. Consumer sends request: `GET https://data.behaviorlabs.ai/api/mart/drugs` with `Authorization: Bearer dk_data_blai_...`
2. Metering proxy extracts token, validates against key store (ConfigMap or in-memory cache from Platform API)
3. Proxy checks schema ACL — is this consumer authorized for the `mart` schema?
4. Proxy checks rate limit — is this consumer under their RPM limit? (Redis INCR with TTL)
5. If authorized: proxy to PostgREST at `localhost:3000`, record metrics, return response
6. If unauthorized: return 401/403 with structured error

### 1.3 Key Validation

Keys follow the `dk_data_` prefix convention (matching `dk_` for Platform API tokens):
- Format: `dk_data_{app_alias}_{random_suffix}`
- Storage: Key metadata stored in Platform API's PostgreSQL, cached in proxy's ConfigMap
- Rotation: Platform API `/dk/v1/data/keys/{alias}/rotate` generates new key, old key valid for 24h grace period

### 1.4 Schema-Level Access Control

Each consumer key has an `allowed_schemas` list. The proxy inspects the PostgREST URL path to determine the target schema and enforces access:

| Consumer | Allowed Schemas | Use Case |
|----------|----------------|----------|
| behavior-labs-ai | `mart`, `api`, `mol_api`, `scoring` | Pharma intelligence queries |
| carbon-5 | `mart`, `api`, `bronze`, `silver`, `gold` | Data pipeline reads |
| DK-OS | `api`, `meta` | Agent data access |
| internal (no key) | All schemas | CronJobs, job-trigger (pod-local traffic) |

Internal pod traffic (CronJobs, job-trigger) bypasses the proxy via localhost:3000 directly.

### 1.5 Rate Limiting

Per-consumer rate limits using Redis token bucket:

| Tier | RPM | Burst | Use Case |
|------|-----|-------|----------|
| Standard | 100 | 20 | Default for new consumers |
| High | 500 | 50 | High-traffic apps (behavior-labs-ai) |
| Unlimited | — | — | Internal/platform services |

Rate limit headers returned on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

### 1.6 Prometheus Metrics

The sidecar exposes `/metrics` on port 9090:

```
dk_data_requests_total{consumer, schema, method, status}
dk_data_response_bytes_total{consumer, schema}
dk_data_request_duration_seconds_bucket{consumer, schema, le}
dk_data_rate_limit_rejections_total{consumer}
dk_data_active_consumers gauge
```

### 1.7 K8s Manifests

| Action | Path | Description |
|--------|------|-------------|
| CREATE | `k8s/base/metering-proxy/deployment-patch.yaml` | Sidecar container added to PostgREST deployment |
| CREATE | `k8s/base/metering-proxy/configmap.yaml` | Key store + schema ACLs |
| CREATE | `k8s/base/metering-proxy/service.yaml` | ClusterIP on port 3001 |
| MODIFY | `k8s/base/postgrest/service.yaml` | Change from LoadBalancer/NodePort to ClusterIP (no longer externally exposed) |
| MODIFY | `k8s/base/ingress.yaml` | Route `data.behaviorlabs.ai` to metering-proxy:3001 instead of postgrest:3000 |
| CREATE | `k8s/base/metering-proxy/servicemonitor.yaml` | Prometheus scrape config for /metrics |

## Workstream 2: Platform API Data Endpoints

See [dk-alchemy/14 Data Metering Endpoints](../dk-alchemy/14-data-metering-endpoints.md) for the full Platform API implementation plan.

### New Endpoints Summary

**API Key Management:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/dk/v1/data/keys` | Create consumer API key (app, rate limit, allowed schemas) |
| `GET` | `/dk/v1/data/keys` | List keys with usage stats |
| `PUT` | `/dk/v1/data/keys/{alias}` | Update key config (rate limits, schema access) |
| `DELETE` | `/dk/v1/data/keys/{alias}` | Revoke key |
| `POST` | `/dk/v1/data/keys/{alias}/rotate` | Rotate key (24h grace period for old key) |

**Usage Metering:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/dk/v1/data/usage` | Aggregate usage across all consumers (time range, grouping) |
| `GET` | `/dk/v1/data/usage/{alias}` | Per-consumer: requests, data volume, query count |
| `GET` | `/dk/v1/data/schemas` | List available schemas and access tiers |

**Rate Limiting:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/dk/v1/data/limits` | View rate limits per consumer |
| `PUT` | `/dk/v1/data/limits/{alias}` | Update consumer rate limits |

### dk-cli Integration

| Command | API Call | Purpose |
|---------|----------|---------|
| `dk data keys create --app blai --schemas mart,api --rpm 100` | `POST /dk/v1/data/keys` | Create consumer key |
| `dk data keys list` | `GET /dk/v1/data/keys` | List keys with usage |
| `dk data keys rotate blai` | `POST /dk/v1/data/keys/blai/rotate` | Rotate key |
| `dk data usage` | `GET /dk/v1/data/usage` | View aggregate usage |
| `dk data usage blai` | `GET /dk/v1/data/usage/blai` | View per-consumer usage |

## Workstream 3: Consumer Onboarding Flow

### Step-by-step

1. Platform admin creates key: `dk data keys create --app behavior-labs-ai --schemas mart,api,mol_api --rpm 500`
2. Platform API generates `dk_data_blai_a1b2c3...` key, stores metadata in PostgreSQL
3. Platform API syncs key to dk-data metering proxy ConfigMap (via K8s API or CronJob)
4. Admin adds key to consumer app's Doppler project: `DK_DATA_API_KEY=dk_data_blai_a1b2c3...`
5. Consumer app configures HTTP client with `Authorization: Bearer dk_data_blai_a1b2c3...` header
6. Requests flow through metering proxy, metrics recorded, rate limits enforced

### Consumer SDK Pattern (optional, future)

For TypeScript consumers (behavior-labs-ai, carbon-5):

```typescript
import { DKDataClient } from '@datakinetic/data-client';

const data = new DKDataClient({
  apiKey: process.env.DK_DATA_API_KEY,
  baseUrl: 'https://data.behaviorlabs.ai',
});

const drugs = await data.query('mart', 'drugs', { limit: 100 });
```

## Workstream 4: Security

### 4.1 PostgREST JWT Integration

The metering proxy can issue short-lived JWTs for PostgREST, scoped to the consumer's allowed schemas:
- Proxy generates JWT with `role` claim matching PostgREST's `PGRST_DB_ANON_ROLE` or consumer-specific role
- JWT signed with the key in Doppler `dk-data-secrets` → `PGRST_JWT_SECRET`
- PostgREST enforces row-level security (RLS) based on JWT claims
- JWT TTL: 60 seconds (short-lived, proxy generates per-request)

### 4.2 NetworkPolicy Updates

| Rule | Source | Destination | Port | Action |
|------|--------|-------------|------|--------|
| Consumer → Proxy | Any namespace with `dk-data-consumer: "true"` label | dk-data metering-proxy | 3001 | Allow |
| Proxy → PostgREST | Same pod (localhost) | 3000 | Allow (implicit) |
| Platform API → Proxy | `infra` namespace | dk-data metering-proxy | 3001 | Allow (health checks) |
| External → PostgREST | Any | PostgREST directly | 3000 | **Deny** (must go through proxy) |

### 4.3 Audit Logging

All key lifecycle events logged to structlog with OTel trace context:
- Key creation, rotation, revocation
- Schema access denied events
- Rate limit enforcement events
- Consumer authentication failures

## Workstream 5: Monitoring

### 5.1 Metering Dashboard

New Grafana dashboard: `monitoring/dashboards/dk-data-metering.json`

| Row | Panels |
|-----|--------|
| Consumer Overview | Total requests (stat), Unique consumers (stat), Active API keys (stat) |
| Request Volume | Requests per consumer (stacked time series), Requests per schema (stacked) |
| Data Transfer | Response bytes per consumer (stacked), Response bytes per schema |
| Rate Limiting | Rejection rate per consumer, Current utilization vs limit (gauge) |
| Latency | P50/P95/P99 per consumer, P95 per schema |

### 5.2 Metering Alert Rules

New alert rules: `monitoring/alerts/dk-data-metering.yaml`

| Alert | Condition | Severity | Labels |
|-------|-----------|----------|--------|
| `DataConsumerRateLimitHigh` | Consumer using >80% of rate limit sustained 15m | warning | `product: dk-data`, `service: metering-proxy` |
| `DataConsumerUnauthorized` | >10 unauthorized requests in 5m from any source | warning | `product: dk-data`, `service: metering-proxy` |
| `DataSchemaAccessDenied` | Consumer attempting access to unauthorized schema | warning | `product: dk-data`, `service: metering-proxy` |
| `DataAPIKeyExpiringSoon` | API key expires within 7 days | info | `product: dk-data`, `service: metering-proxy` |
| `DataUsageAnomaly` | Consumer request volume >3x 7-day rolling average | warning | `product: dk-data`, `service: metering-proxy` |

## Implementation Order

1. **Metering proxy sidecar** (Workstream 1) — core capability, enables all other workstreams
2. **Platform API data endpoints** (Workstream 2) — key management and usage queries
3. **Consumer onboarding** (Workstream 3) — onboard behavior-labs-ai as first consumer
4. **Security hardening** (Workstream 4) — JWT integration, NetworkPolicy, audit logging
5. **Monitoring** (Workstream 5) — dashboards and alerts

## Verification

- `dk data keys create --app test --schemas api --rpm 10` creates key successfully
- `dk data keys list` shows the test key with 0 usage
- `curl -H "Authorization: Bearer dk_data_test_..." https://data.behaviorlabs.ai/api/drugs` returns data
- `curl https://data.behaviorlabs.ai/api/drugs` (no auth) returns 401
- `curl -H "Authorization: Bearer dk_data_test_..." https://data.behaviorlabs.ai/mart/drugs` returns 403 (schema not in ACL)
- Rate limit: 11th request within 1 minute returns 429
- Grafana metering dashboard shows request metrics per consumer
- `dk data usage test` shows request count and data volume
