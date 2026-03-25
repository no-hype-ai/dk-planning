# Platform API

## Overview

The dk-alchemy Platform API is the unified control plane for Data Kinetic platform operations. It is the server-side counterpart to [dk-cli](dk-cli.md) — dk-cli is the client, the Platform API is the server.

The API consolidates scattered platform operations (LLM key management, preview deployments, webhook handling, label governance, data metering) into a single authenticated service with RBAC and audit logging.

## Architecture

| Property | Value |
|----------|-------|
| **Location** | `dk-alchemy/src/platform-api/` |
| **Stack** | Python 3.12, [FastAPI](https://fastapi.tiangolo.com/) |
| **Deployment** | [Kubernetes](https://kubernetes.io/docs/) (`infra` namespace), [ArgoCD](https://argo-cd.readthedocs.io/)-managed |
| **Image** | `ghcr.io/data-kinetic/dk-alchemy/platform-api` |
| **External domain** | `dk.datakinetic.com` |
| **In-cluster DNS** | `platform-api.infra.svc.cluster.local` |
| **Secrets** | [Doppler](https://docs.doppler.com/) project `dk-infrastructure/prd` |

### What It Supersedes

The Platform API replaces the planned webhook service described in [Self-Hosted Runners & Webhook Service](self-hosted-runners-and-webhooks.md). Instead of a single-purpose webhook handler, the Platform API provides a broader control plane that includes webhook handling as one of its capabilities.

## API Endpoints

All endpoints use the `/dk/v1/` prefix to avoid conflicts with product service APIs.

### Authentication

Device code flow (RFC 8628-inspired) for CLI login, plus API key auth for programmatic access.

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| `POST` | `/dk/v1/auth/device-code` | Generate device code for CLI login | None |
| `POST` | `/dk/v1/auth/device-code/poll` | Poll for device code completion | None |
| `POST` | `/dk/v1/auth/device-code/callback` | Clerk auth callback | None |
| `POST` | `/dk/v1/auth/refresh` | Refresh expired platform token | Token |
| `POST` | `/dk/v1/auth/revoke` | Revoke session (logout) | Token |
| `GET` | `/dk/v1/auth/me` | Get current user identity and role | Token |

### LLM Management

Proxies to [LiteLLM](litellm.md) admin API with RBAC.

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| `GET` | `/dk/v1/llm/keys` | List all keys with usage stats | Developer |
| `POST` | `/dk/v1/llm/keys` | Create virtual key (alias, budget, models) | Admin |
| `PUT` | `/dk/v1/llm/keys/{alias}` | Update key configuration | Admin |
| `POST` | `/dk/v1/llm/keys/{alias}/rotate` | Rotate a virtual key | Admin |
| `DELETE` | `/dk/v1/llm/keys/{key_id}` | Revoke an LLM API key | Admin |
| `GET` | `/dk/v1/llm/models` | List available models | Developer |
| `GET` | `/dk/v1/llm/spend` | LLM usage and spend data | Developer |

### Preview Environments

Orchestrates docker-compose deployments on VM101 (preview-stack) via SSH.

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| `POST` | `/dk/v1/previews` | Deploy preview (repo, branch, services) | Developer |
| `GET` | `/dk/v1/previews` | List active previews | Developer |
| `GET` | `/dk/v1/previews/health` | VM101 health metrics | Developer |
| `GET` | `/dk/v1/previews/{name}` | Get preview details | Developer |
| `DELETE` | `/dk/v1/previews/{name}` | Tear down preview | Developer |
| `PATCH` | `/dk/v1/previews/{name}` | Extend preview TTL | Developer |
| `GET` | `/dk/v1/previews/{name}/logs` | Stream logs (SSE) | Developer |

### Promotion Lifecycle

Manages 3-stage promotion: preview → staging → production.

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| `POST` | `/dk/v1/promote` | Initiate promotion to a stage | Developer/Admin |
| `GET` | `/dk/v1/promote/status` | Get promotion state for a repo | Developer |
| `POST` | `/dk/v1/promote/rollback` | Rollback a stage | Admin |

### Webhooks

Receives [GitHub](https://docs.github.com/en/actions) webhook events for cross-repo coordination.

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| `POST` | `/dk/v1/webhooks/github` | GitHub webhook receiver (HMAC-SHA256 validated) | Webhook signature |
| `GET` | `/dk/v1/webhooks/status` | Webhook configuration status | None |

### Label Governance

Manages GitHub label taxonomy across the `data-kinetic` org.

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| `GET` | `/dk/v1/labels/taxonomy` | Get canonical label taxonomy | Token |
| `POST` | `/dk/v1/labels/sync/{repo}` | Sync label taxonomy to a repo | Token |
| `GET` | `/dk/v1/labels/audit` | Audit label compliance across org | Token |

### Data Metering

Manages consumer API keys and usage metering for [dk-data-fe](https://github.com/data-kinetic/dk-data-fe). Keys control schema-level access and rate limits. Usage metrics are queried from the dk-data metering proxy's Prometheus metrics in Mimir.

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| `POST` | `/dk/v1/data/keys` | Create consumer API key | Admin |
| `GET` | `/dk/v1/data/keys` | List keys with usage stats | Developer |
| `PUT` | `/dk/v1/data/keys/{alias}` | Update key config (rate limits, schema access) | Admin |
| `DELETE` | `/dk/v1/data/keys/{alias}` | Revoke key | Admin |
| `POST` | `/dk/v1/data/keys/{alias}/rotate` | Rotate key (24h grace period for old key) | Admin |
| `GET` | `/dk/v1/data/usage` | Aggregate usage (time range, grouping) | Developer |
| `GET` | `/dk/v1/data/usage/{alias}` | Per-consumer: requests, data volume, query count | Developer |
| `GET` | `/dk/v1/data/schemas` | Available schemas and access tiers | Readonly |
| `GET` | `/dk/v1/data/limits` | View rate limits per consumer | Developer |
| `PUT` | `/dk/v1/data/limits/{alias}` | Update consumer rate limits | Admin |

### Installation & Releases

Serves dk-cli binaries and install scripts.

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| `GET` | `/install` | dk-cli install script | None |
| `GET` | `/releases/latest` | Latest dk-cli release metadata | None |
| `GET` | `/releases/{version}/checksums.sha256` | SHA256 checksums for release | None |
| `GET` | `/releases/{version}/{asset_name}` | Stream release binary | None |

### Health

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| `GET` | `/health` | Kubernetes liveness probe | None |
| `GET` | `/ready` | Kubernetes readiness probe (checks LiteLLM, GitHub connectivity) | None |

## Authentication

- **API tokens:** Per-user tokens with `dk_` prefix, validated via SHA-256 hash comparison
- **Clerk device code flow:** CLI login generates `dk_clerk_` tokens with 24h expiry and refresh support
- **RBAC roles:** `admin` (full access), `developer` (read + create), `readonly` (read-only endpoints)
- **GitHub webhooks:** HMAC-SHA256 signature validation with per-repo secrets from Doppler

## Secrets

| Secret | Doppler Project | Purpose |
|--------|----------------|---------|
| LiteLLM master key | `dk-infrastructure/prd` | Admin access to LiteLLM API |
| GitHub App credentials | `dk-infrastructure/prd` | Webhook verification, repo access |
| SSH key (VM101) | `dk-infrastructure/prd` | Preview stack orchestration |
| API signing key | `dk-infrastructure/prd` | Token generation and validation |
| Admin token hashes | `dk-infrastructure/prd` | Admin role identification (`DK_ADMIN_TOKENS`) |
| Database URL | `dk-infrastructure/prd` | PostgreSQL for data consumer keys (`DK_DATABASE_URL`) |
| Clerk credentials | `dk-infrastructure/prd` | OAuth device code flow |

## dk-cli Integration

dk-cli authenticates to the Platform API using credentials stored in `~/.dk/config.yaml`:

```yaml
api_url: https://dk.datakinetic.com
auth:
  token: dk_clerk_...    # From dk login
  api_key: dk_...        # Alternative: API key auth
```

All server-backed dk-cli commands (`dk llm`, `dk preview`, `dk data`, `dk labels`, `dk promote`) route through this API. Local-only commands (`dk adopt`, `dk init`, `dk onboard`) do not require the API.

## Related Documentation

- [dk-cli](dk-cli.md) — CLI client for the Platform API
- [LiteLLM](litellm.md) — LLM proxy managed by this API
- [Preview Environments](preview-environments.md) — preview stack managed by this API
- [Self-Hosted Runners & Webhook Service](self-hosted-runners-and-webhooks.md) — predecessor design (superseded)
- [Issue Governance](issue-governance.md) — label taxonomy enforced by this API
