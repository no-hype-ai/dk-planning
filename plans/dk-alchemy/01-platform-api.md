# Platform API Implementation

## Context

dk-alchemy has scattered services (ddns, probe, LiteLLM on VM, preview stack on VM) with no unified control plane. The dk-cli needs a server-side API for operations requiring cluster/VM access. The planned webhook service was never built. The Platform API consolidates all of these into a single FastAPI service behind `dk.datakinetic.com`.

See `../../docs/platform-api.md` for the full API specification and `../../docs/dk-cli.md` for the client commands that will consume this API.

## Scope

- FastAPI service in `dk-alchemy/src/platform-api/`
- Endpoints: `/dk/v1/llm/*`, `/dk/v1/previews/*`, `/dk/v1/webhooks/*`, `/dk/v1/labels/*`, `/dk/v1/probes/*`
- Auth: API tokens with `dk_` prefix, RBAC (admin/developer/readonly), webhook HMAC-SHA256
- Deployment: K8s in `infra` namespace, ArgoCD-managed, GHCR image
- External: `dk.datakinetic.com` via edge route

## Dependencies

- None (this is the foundation for other workstreams)

## Existing Work

- **dk-alchemy specs:** None directly (webhook service was planned but never spec'd)
- **dk-alchemy src/:** `probe-service` and `ddns-service` provide patterns for Python service structure
- **dk-planning docs:** `../../docs/platform-api.md` (full spec), `../../docs/dk-cli.md` (client commands)

## Implementation Steps

### Phase 1: Project Scaffold & Health Endpoints
1. Scaffold FastAPI project in `dk-alchemy/src/platform-api/`:
   - `pyproject.toml` with FastAPI, uvicorn, httpx, pydantic dependencies
   - `Dockerfile` (multi-stage build, non-root user, read-only rootfs)
   - `src/platform_api/main.py` (FastAPI app factory)
   - `src/platform_api/config.py` (Pydantic settings from env)
2. Implement health endpoints:
   - `GET /health` — liveness probe (returns 200 immediately)
   - `GET /ready` — readiness probe (checks downstream connectivity: LiteLLM, GitHub API, SSH to VM101)

### Phase 2: Auth Middleware
3. Add auth middleware in `src/platform_api/auth/`:
   - API token validation: tokens stored in Doppler, prefixed with `dk_`, hashed with SHA-256
   - RBAC decorator: `@require_role("admin")`, `@require_role("developer")`, `@require_role("readonly")`
   - Webhook HMAC-SHA256 validation for GitHub webhook payloads
   - Rate limiting per token (100 req/min default, configurable per role)

### Phase 3: LLM Endpoints
4. Implement LLM endpoints (proxy to LiteLLM at `192.168.10.50:4000`):
   - `GET /dk/v1/llm/keys` — list API keys
   - `POST /dk/v1/llm/keys` — create API key
   - `DELETE /dk/v1/llm/keys/{key_id}` — revoke key
   - `GET /dk/v1/llm/models` — list available models
   - `GET /dk/v1/llm/spend` — usage/spend data
   - Proxy uses httpx async client with retry and circuit breaker

### Phase 4: Preview Endpoints
5. Implement preview endpoints (SSH orchestration to VM101 at `10.0.0.51`):
   - `GET /dk/v1/previews` — list active preview environments
   - `POST /dk/v1/previews` — create preview (triggers docker-compose on VM101)
   - `DELETE /dk/v1/previews/{id}` — tear down preview
   - `GET /dk/v1/previews/{id}/logs` — tail preview logs
   - SSH key stored in Doppler, connection pooled via asyncssh

### Phase 5: Webhook Endpoints
6. Implement webhook endpoints:
   - `POST /dk/v1/webhooks/github` — receives GitHub push/PR events
   - Validates HMAC-SHA256 signature from `X-Hub-Signature-256` header
   - On push to main: updates kustomize image tag via GitHub API (commit to dk-alchemy)
   - On PR opened/updated: triggers preview creation
   - `POST /dk/v1/webhooks/test` — test endpoint for webhook validation

### Phase 6: Labels & Probes Endpoints
7. Implement labels endpoints:
   - `GET /dk/v1/labels` — list org-wide label definitions
   - `POST /dk/v1/labels/sync` — sync labels across all repos in org via GitHub API
   - `GET /dk/v1/labels/drift` — report repos with missing/extra labels
8. Implement probes endpoint:
   - `GET /dk/v1/probes` — read probe-service Prometheus metrics, return structured JSON
   - `GET /dk/v1/probes/{target}` — probe results for specific target

### Phase 7: K8s Deployment & Infrastructure
9. Add K8s manifests in `dk-alchemy/k8s/infrastructure/platform-api/`:
   - `base/deployment.yaml` — 2 replicas, resource limits (256Mi/500m), probes, non-root
   - `base/service.yaml` — ClusterIP on port 8000
   - `base/configmap.yaml` — non-secret configuration (LiteLLM host, VM101 IP, GitHub org)
   - `base/kustomization.yaml`
   - `overlays/prod/kustomization.yaml` — production image tag, replica count
   - `overlays/prod/doppler-secret.yaml` — DopplerSecret for API tokens, SSH keys, GitHub PAT
10. Add edge route: `dk-alchemy/k8s/edge/routes/base/platform-api.yaml`
    - Host: `dk.datakinetic.com`
    - TLS termination at edge
    - Rate limiting middleware

### Phase 8: Observability & CI
11. Add Grafana dashboard: `dk-alchemy/grafana/dashboards/infrastructure/platform-api.json`
    - Request rate, latency P50/P95/P99, error rate by endpoint
    - Downstream health (LiteLLM, VM101, GitHub API)
    - Active API tokens, rate limit hits
12. Add alert rules: `dk-alchemy/grafana/alerts/platform-api.yaml`
    - Error rate > 5% for 5 minutes
    - P95 latency > 2s for 5 minutes
    - Downstream unreachable for 2 minutes
13. Add CI workflow: `dk-alchemy/.github/workflows/build-platform-api.yaml`
    - Trigger: push to `src/platform-api/**`
    - Steps: lint, type-check, test, Docker build, GHCR push, SBOM
14. Update dk-infrastructure ApplicationSet (auto-discovers new `k8s/infrastructure/platform-api/` component)

## dk-alchemy Changes

| Action | Path | Description |
|--------|------|-------------|
| CREATE | `src/platform-api/` | Entire FastAPI service (source, tests, Dockerfile, pyproject.toml) |
| CREATE | `k8s/infrastructure/platform-api/base/` | Deployment, Service, ConfigMap, Kustomization |
| CREATE | `k8s/infrastructure/platform-api/overlays/prod/` | Kustomization, DopplerSecret |
| CREATE | `k8s/edge/routes/base/platform-api.yaml` | Edge route for dk.datakinetic.com |
| CREATE | `grafana/dashboards/infrastructure/platform-api.json` | Request metrics dashboard |
| CREATE | `grafana/alerts/platform-api.yaml` | Alert rules for error rate, latency, downstream health |
| CREATE | `.github/workflows/build-platform-api.yaml` | CI build workflow |
| CREATE | `docs/platform-api-integration-guide.md` | Integration guide for consumers |

## Verification

- `curl https://dk.datakinetic.com/health` returns 200
- `curl https://dk.datakinetic.com/ready` returns 200 with downstream status
- `dk llm keys list` returns keys from LiteLLM (via `/dk/v1/llm/keys`)
- `dk preview list` returns active previews (via `/dk/v1/previews`)
- `POST /dk/v1/webhooks/test` with valid HMAC returns 200
- `POST /dk/v1/webhooks/test` with invalid HMAC returns 403
- Unauthorized request (no token) returns 401
- Insufficient role returns 403
- Grafana dashboard shows request metrics with real traffic
- ArgoCD Application for platform-api shows Healthy/Synced

## Options/Recommendations

**Option A (Recommended): Full API from day 1**
Build all endpoint groups in a single release. The endpoint groups are independent and can be developed in parallel. This provides immediate value across all dk-cli server commands and avoids multiple deployment iterations.

**Option B: Incremental rollout**
Start with LLM + webhooks only, add previews and labels in a follow-up. Lower risk but delays `dk preview` and `dk labels --org` commands.

**Recommendation:** Option A. The endpoint groups share auth, config, and deployment infrastructure. Building them together amortizes that cost and avoids partial-API states where dk-cli commands fail with "not implemented."
