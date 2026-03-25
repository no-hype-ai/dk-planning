# Data Metering Platform API Endpoints

## Context

dk-data-fe is adding a metering proxy sidecar (see [dk-data-fe/05](../dk-data-fe/05-api-integration-and-metering.md)) that validates consumer API keys and meters usage. The Platform API needs new `/dk/v1/data/*` endpoints to manage the key lifecycle and query usage metrics.

This follows the same pattern as the existing `/dk/v1/llm/*` endpoints: Platform API manages keys, the data-plane proxy (metering sidecar) enforces.

## Dependencies

- [dk-alchemy/01 Platform API](01-platform-api.md) — Platform API must be deployed
- [dk-data-fe/05 API Integration](../dk-data-fe/05-api-integration-and-metering.md) — metering proxy must be deployed

## Scope

New router: `src/platform-api/src/platform_api/routers/data.py`

### API Key Management

| Method | Endpoint | RBAC | Purpose |
|--------|----------|------|---------|
| `POST` | `/dk/v1/data/keys` | admin | Create consumer API key |
| `GET` | `/dk/v1/data/keys` | developer | List keys with usage stats |
| `PUT` | `/dk/v1/data/keys/{alias}` | admin | Update key config |
| `DELETE` | `/dk/v1/data/keys/{alias}` | admin | Revoke key |
| `POST` | `/dk/v1/data/keys/{alias}/rotate` | admin | Rotate key (24h grace) |

**Create key request body:**
```json
{
  "alias": "behavior-labs-ai",
  "allowed_schemas": ["mart", "api", "mol_api", "scoring"],
  "rpm_limit": 500,
  "tier": "high",
  "expires_at": null
}
```

**Create key response:**
```json
{
  "alias": "behavior-labs-ai",
  "key": "dk_data_blai_a1b2c3...",
  "allowed_schemas": ["mart", "api", "mol_api", "scoring"],
  "rpm_limit": 500,
  "tier": "high",
  "created_at": "2026-03-24T00:00:00Z",
  "expires_at": null
}
```

### Usage Metering

| Method | Endpoint | RBAC | Purpose |
|--------|----------|------|---------|
| `GET` | `/dk/v1/data/usage` | developer | Aggregate usage (query params: `from`, `to`, `group_by`) |
| `GET` | `/dk/v1/data/usage/{alias}` | developer | Per-consumer usage |
| `GET` | `/dk/v1/data/schemas` | readonly | List available schemas and access tiers |

Usage data is queried from Mimir/Prometheus using the `dk_data_requests_total` and `dk_data_response_bytes_total` metrics exposed by the metering proxy sidecar.

**Usage response:**
```json
{
  "alias": "behavior-labs-ai",
  "period": {"from": "2026-03-01", "to": "2026-03-24"},
  "total_requests": 45230,
  "total_bytes": 1073741824,
  "by_schema": {
    "mart": {"requests": 30000, "bytes": 750000000},
    "api": {"requests": 10000, "bytes": 200000000},
    "mol_api": {"requests": 5230, "bytes": 123741824}
  },
  "rate_limit_rejections": 12
}
```

### Rate Limiting Management

| Method | Endpoint | RBAC | Purpose |
|--------|----------|------|---------|
| `GET` | `/dk/v1/data/limits` | developer | View rate limits per consumer |
| `PUT` | `/dk/v1/data/limits/{alias}` | admin | Update consumer rate limits |

## Implementation Steps

### Phase 1: Key Store Schema

Add table to Platform API's PostgreSQL database:

```sql
CREATE TABLE data_consumer_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alias VARCHAR(64) UNIQUE NOT NULL,
    key_hash VARCHAR(128) NOT NULL,  -- SHA-256 of the API key
    allowed_schemas TEXT[] NOT NULL,
    rpm_limit INTEGER NOT NULL DEFAULT 100,
    tier VARCHAR(16) NOT NULL DEFAULT 'standard',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    rotated_from UUID REFERENCES data_consumer_keys(id),
    grace_expires_at TIMESTAMPTZ  -- 24h after rotation, old key still valid
);
```

### Phase 2: Data Router

Create `src/platform-api/src/platform_api/routers/data.py`:
- Key CRUD endpoints with validation
- Usage query endpoints (proxy to Mimir HTTP API)
- Rate limit management endpoints
- All endpoints use existing auth middleware with RBAC

### Phase 3: Key Sync to Metering Proxy

The metering proxy in dk-data-fe needs the key store. Two options:

**Option A (Recommended): K8s ConfigMap sync**
- Platform API writes key metadata (hash, schemas, limits) to a ConfigMap in the dk-data namespace
- Metering proxy watches the ConfigMap for changes (inotify or periodic reload)
- Simple, no direct API dependency between proxy and Platform API

**Option B: Direct API call**
- Metering proxy calls Platform API to validate keys on each request
- Adds latency and creates a runtime dependency
- Not recommended for data-plane traffic

### Phase 4: Observability

- Add data endpoint metrics to Platform API dashboard (`grafana/dashboards/infrastructure/platform-api.json`)
- Add alert rules for key management operations (creation, rotation, revocation)

## dk-alchemy Changes

| Action | Path | Description |
|--------|------|-------------|
| CREATE | `src/platform-api/src/platform_api/routers/data.py` | Data metering router |
| CREATE | `src/platform-api/src/platform_api/models/data.py` | Pydantic models for data endpoints |
| CREATE | `src/platform-api/migrations/003_data_consumer_keys.sql` | Key store schema |
| MODIFY | `src/platform-api/src/platform_api/main.py` | Register data router |
| MODIFY | `grafana/dashboards/infrastructure/platform-api.json` | Add data endpoint panels |
| MODIFY | `grafana/alerts/platform-api.yaml` | Add data key lifecycle alerts |

## Verification

- `POST /dk/v1/data/keys` with admin token creates key, returns `dk_data_` prefixed key
- `GET /dk/v1/data/keys` lists all keys with usage stats
- `POST /dk/v1/data/keys/{alias}/rotate` creates new key, old key has 24h grace
- `GET /dk/v1/data/usage/test` returns usage metrics from Mimir
- `GET /dk/v1/data/schemas` returns list of available schemas
- Unauthorized requests return 401, insufficient role returns 403
