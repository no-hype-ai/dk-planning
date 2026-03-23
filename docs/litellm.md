# LiteLLM

## Overview

[LiteLLM](https://docs.litellm.ai/) is the platform's unified LLM proxy — a single gateway through which all product repos access language models. It provides virtual API keys with per-app budgets, rate limits, and model restrictions.

LiteLLM runs on a dedicated VM (not K8s) and is accessed by applications via an in-cluster ExternalName service.

## Deployment

| Property | Value |
|----------|-------|
| **VM** | vm100-litellm (penguin, VMID 100) |
| **IP** | 192.168.10.50 (Corpnet) |
| **Resources** | 16 vCPU, 64 GiB RAM, 500 GB disk |
| **Service port** | 4000 (HTTP) |
| **External domain** | `llm.behaviorlabs.ai` |
| **Staging domain** | `llm.staging.behaviorlabs.ai` |
| **In-cluster DNS** | `litellm.infra.svc.cluster.local:8000` |
| **Secrets** | [Doppler](https://docs.doppler.com/) project `00-dk-tools/prd` (master key) |

## Network Path

```
External client → DNS (llm.behaviorlabs.ai → 66.68.93.103)
  → UDM WAN DNAT → 172.16.100.100:443 (Keepalived VIP)
  → phantom/venom edge LB (Traefik TLS termination)
  → 192.168.10.50:4000 (LiteLLM VM)

K8s pod → litellm.infra.svc.cluster.local:8000
  → ExternalName → 192.168.10.50:4000
```

## Virtual Keys

Each product repo gets a dedicated virtual key with budget and rate limit controls:

| App | Monthly Budget | RPM | TPM | Allowed Models |
|-----|---------------|-----|-----|----------------|
| behavior-labs-ai | $100 | 500 | 100k | gpt-4o, gpt-4o-mini, claude-sonnet |
| agent-mesh | $200 | 1000 | 200k | gpt-4o, claude-sonnet, claude-opus |
| dk-data-fe | $50 | 100 | 50k | gpt-4o-mini |

### Key Management

Virtual keys are managed via the [Platform API](platform-api.md) or [dk-cli](dk-cli.md):

| Operation | dk-cli | Platform API |
|-----------|--------|-------------|
| List keys | `dk llm keys list` | `GET /dk/v1/llm/keys` |
| Create key | `dk llm keys create` | `POST /dk/v1/llm/keys` |
| Rotate key | `dk llm keys rotate <alias>` | `POST /dk/v1/llm/keys/{alias}/rotate` |
| Update config | `dk llm keys update <alias>` | `PUT /dk/v1/llm/keys/{alias}` |
| Check budget | `dk llm budget` | `GET /dk/v1/llm/budget` |
| List models | `dk llm models` | `GET /dk/v1/llm/models` |

### App Integration

To use LiteLLM from a product repo:

1. Request a virtual key via `dk llm keys create` or the Platform API
2. Store the key in [Doppler](https://docs.doppler.com/) as `LITELLM_API_KEY`
3. Configure the SDK to point to the LiteLLM endpoint:
   ```typescript
   const client = new OpenAI({
     apiKey: process.env.LITELLM_API_KEY,
     baseURL: 'http://litellm.infra.svc.cluster.local:8000/v1',
   });
   ```

## Monitoring

### Dashboard

Dedicated [Grafana](https://grafana.com/docs/grafana/latest/) dashboard (`litellm` UID) with panels:
- Request rate, error %, P95 latency
- Token usage, budget tracking, cache performance
- Per-app breakdown: requests, tokens, spend, model usage (grouped by `api_key_alias`)

### Alert Rules (6)

| Alert | Severity | Condition |
|-------|----------|-----------|
| litellm-down | Critical | `up{job="litellm"}` < 1 for 2m |
| litellm-high-error-rate | Warning | 5xx error rate > 10% for 5m |
| litellm-provider-rate-limited | Warning | 429 responses > 5/min for 5m |
| litellm-high-latency | Warning | P95 latency > 10s for 5m |
| litellm-budget-exceeded | Info | Remaining budget < 10% for 15m |
| litellm-app-high-token-rate | Warning | Token rate > 50k/min for 10m |

### Metrics Collection

[Grafana Alloy](https://grafana.com/docs/alloy/latest/) scrapes LiteLLM metrics via the edge LB:
- Target: `10.0.0.2:443` (phantom edge LB with SNI `llm.behaviorlabs.ai`)
- Path: `/metrics/` (trailing slash required — `/metrics` returns 307)
- Auth: Bearer token from Doppler (`LITELLM_METRICS_KEY`)
- Interval: 30s

> **Note:** Alloy uses a `hostAliases` patch to resolve `llm.behaviorlabs.ai` to `10.0.0.2` (phantom) because DNS resolves to `192.168.1.100` (Keepalived Core LAN VIP), which is unreachable from K3s pods.

## Related Documentation

- [Platform API](platform-api.md) — API endpoints for key management
- [dk-cli](dk-cli.md) — CLI commands for LLM operations
- [Observability](observability.md) — LGTM stack and alert configuration
- [Infrastructure](infrastructure.md) — Alloy scraping targets
- dk-alchemy: `docs/litellm-integration-guide.md` — detailed integration guide
- dk-alchemy: `docs/runbooks/litellm-virtual-keys.md` — key management runbook
