# Platform API

## Overview

The dk-alchemy Platform API is the unified control plane for Data Kinetic platform operations. It is the server-side counterpart to [dk-cli](dk-cli.md) — dk-cli is the client, the Platform API is the server.

The API consolidates scattered platform operations (LLM key management, preview deployments, webhook handling, label governance) into a single authenticated service with RBAC and audit logging.

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

### LLM Management

Proxies to [LiteLLM](litellm.md) admin API with added RBAC and audit logging.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/dk/v1/llm/keys` | Create virtual key (budget, RPM, TPM, models) |
| `GET` | `/dk/v1/llm/keys` | List all keys with usage stats |
| `PUT` | `/dk/v1/llm/keys/{alias}` | Update key configuration |
| `POST` | `/dk/v1/llm/keys/{alias}/rotate` | Rotate a virtual key |
| `GET` | `/dk/v1/llm/budget` | Budget usage across all apps |
| `GET` | `/dk/v1/llm/models` | List available models |

### Preview Environments

Orchestrates docker-compose deployments on VM101 (preview-stack) via SSH.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/dk/v1/previews` | Deploy preview (repo, branch, services) |
| `GET` | `/dk/v1/previews` | List active previews |
| `DELETE` | `/dk/v1/previews/{name}` | Tear down preview |
| `GET` | `/dk/v1/previews/{name}/logs` | Stream logs (SSE) |

### Webhooks

Receives [GitHub](https://docs.github.com/en/actions) webhook events for cross-repo coordination.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/dk/v1/webhooks/{repo}` | GitHub webhook receiver (image-built, PR events) |

Webhook signature validation uses HMAC-SHA256 with per-repo secrets from Doppler.

### Label Governance

Manages GitHub label taxonomy across the `data-kinetic` org.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/dk/v1/labels/sync` | Sync label taxonomy to specified repos |
| `GET` | `/dk/v1/labels/audit` | Audit label compliance across org |

### Probes

Read-only access to probe-service status.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/dk/v1/probes/status` | Current probe results from probe-service metrics |

### Health

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/health` | Kubernetes liveness probe |
| `GET` | `/ready` | Kubernetes readiness probe |

## Authentication

- **API tokens:** Per-user tokens with `dk_` prefix, stored in Doppler
- **RBAC roles:** `admin` (full access), `developer` (LLM keys, previews), `readonly` (read-only endpoints)
- **GitHub webhooks:** HMAC-SHA256 signature validation with per-repo secrets

## Secrets

| Secret | Doppler Project | Purpose |
|--------|----------------|---------|
| LiteLLM master key | `00-dk-tools/prd` | Admin access to LiteLLM API |
| GitHub App credentials | `dk-infrastructure/prd` | Webhook verification, repo access |
| SSH key (VM101) | `dk-infrastructure/prd` | Preview stack orchestration |
| API signing key | `dk-infrastructure/prd` | Token generation and validation |

## dk-cli Integration

dk-cli authenticates to the Platform API using a token stored in `~/.dk/config.yaml`:

```yaml
api_url: https://dk.datakinetic.com
api_token: dk_...
```

All server-backed dk-cli commands (`dk llm`, `dk preview`, `dk labels sync --org`) route through this API. Local-only commands (`dk check`, `dk init`, `dk up`) do not require the API.

## Related Documentation

- [dk-cli](dk-cli.md) — CLI client for the Platform API
- [LiteLLM](litellm.md) — LLM proxy managed by this API
- [Preview Environments](preview-environments.md) — preview stack managed by this API
- [Self-Hosted Runners & Webhook Service](self-hosted-runners-and-webhooks.md) — predecessor design (superseded)
- [Issue Governance](issue-governance.md) — label taxonomy enforced by this API
