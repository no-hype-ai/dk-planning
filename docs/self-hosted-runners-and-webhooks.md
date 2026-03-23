# Self-Hosted Runners & Webhook Service

> **Status:** Not yet implemented. All CI currently runs on GitHub-hosted runners (`ubuntu-latest`). The webhook service described below is superseded by the [dk-alchemy Platform API](platform-api.md). This document is retained as a design reference for the planned runner migration.

## Overview

Two related initiatives that improve CI/CD reliability, performance, and cross-repo coordination:

1. **Self-hosted [GitHub Actions](https://docs.github.com/en/actions) runners** — ARC v2 on [K3s](https://docs.k3s.io/), replacing GitHub-hosted runners with ephemeral pods on penguin/krang
2. **Webhook service** — centralized [FastAPI](https://fastapi.tiangolo.com/) service in dk-alchemy that replaces per-repo CI-driven [Kustomize](https://kubectl.docs.kubernetes.io/references/kustomize/) commits with a secure webhook-based pattern

### Why

- **Runners:** GitHub-hosted runners (2 vCPU / 7GB RAM / 14GB SSD) are undersized for [Docker](https://docs.docker.com/) multi-stage builds, [Turborepo](https://turbo.build/repo/docs) monorepos, and [Playwright](https://playwright.dev/docs/intro) tests. Penguin and krang have significant spare capacity. Metered GitHub Actions minutes add up across 6+ active repos.
- **Webhooks:** Each product repo's CI independently commits kustomize tag changes to its own overlays — fragile, inconsistent, and requires each repo to have write access to its own `k8s/` directory. A centralized webhook service owns all kustomize mutations, improving security and consistency.

### Confirmed Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Webhook domain | `webhooks.datakinetic.com` | Dedicated subdomain for webhook traffic |
| GitHub auth | GitHub App (not PAT) | Short-lived tokens (1h), per-repo scoping, auditable |
| Webhook scope | Replaces all CI-driven kustomize commits | Not just one repo — all product repos send webhooks |
| Megatron runners | Decommission directly | Stale/experimental runners on DK-OS and lithium-5, no migration period needed |

---

## Initiative 1: Self-Hosted Runners (ARC v2 on K3s)

### Architecture

Actions Runner Controller v2 deploys as a Helm chart in the K3s cluster. A controller pod watches for `workflow_job` webhook events from GitHub and creates ephemeral runner pods on demand — true scale-to-zero.

```
GitHub.com ──webhook──► ARC Controller (arc-system namespace)
                            │
                            ├── AutoscalingRunnerSet: runner-standard (penguin)
                            ├── AutoscalingRunnerSet: runner-large (penguin)
                            └── AutoscalingRunnerSet: runner-gpu (krang)
```

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| ARC version | **v2** | v1 deprecated. v2 uses AutoscalingRunnerSet CRDs, true per-job ephemeral pods |
| Container builds | **Docker-in-Docker (privileged sidecar)** | Existing Dockerfiles use `--mount=type=secret` for [Doppler](https://docs.doppler.com/). Kaniko doesn't support this. Buildah would require Dockerfile rewrites. Ephemeral pods mitigate privilege risk. |
| Workspace storage | **emptyDir (ephemeral)** | No state between jobs. Prevents data leakage. |
| Build cache | **Registry-based (`--cache-from`/`--cache-to` [GHCR](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry))** | No shared PVC needed. BuildKit pushes/pulls layer cache to `ghcr.io/<repo>/cache`. |
| Turborepo cache | **Self-hosted remote cache on MinIO** | Configure `TURBO_API` pointing to MinIO S3 endpoint |
| Auth | **GitHub App** (not PAT) | Short-lived tokens (1h), scoped per-repo, auditable |
| Node placement | **nodeAffinity** on runner class | standard/large → penguin, gpu → krang |

### Runner Classes

| Class | Labels | Resources | Node | Max Scale | Use Cases |
|-------|--------|-----------|------|-----------|-----------|
| **standard** | `self-hosted, linux, standard` | 2C/4Gi → 4C/8Gi | penguin | 10 | Linting, testing, Kustomize validation |
| **large** | `self-hosted, linux, large` | 8C/32Gi → 16C/64Gi | penguin | 5 | Turborepo builds, Docker multi-stage, Playwright |
| **gpu** | `self-hosted, linux, gpu` | 4C/16Gi + 1 GPU → 8C/32Gi | krang | 4 | ML workloads, NeMo, vLLM testing |

Workflows select runners via `runs-on`:

```yaml
jobs:
  build:
    runs-on: [self-hosted, linux, large]   # Docker builds, Turborepo
  lint:
    runs-on: [self-hosted, linux, standard] # Fast checks
  ml-test:
    runs-on: [self-hosted, linux, gpu]      # GPU workloads
```

### dk-alchemy Components

```
k8s/infrastructure/arc-controller/
  base/
    kustomization.yaml       # Helm: gha-runner-scale-set-controller
    namespace.yaml           # arc-system
    values.yaml
  overlays/prod/

k8s/infrastructure/arc-runners/
  base/
    kustomization.yaml
    runner-standard.yaml     # AutoscalingRunnerSet
    runner-large.yaml        # AutoscalingRunnerSet
    runner-gpu.yaml          # AutoscalingRunnerSet
    dind-config.yaml         # Docker daemon config
    rbac.yaml                # ServiceAccount, Role, RoleBinding
    network-policy.yaml      # Egress: github.com, ghcr.io, doppler, alloy, npm
  overlays/prod/
```

Both directories are auto-discovered by the `dk-infrastructure` ApplicationSet (git directory generator over `k8s/infrastructure/*`) — no ApplicationSet changes needed.

### Security

- **Ephemeral pods** — destroyed after each job, no persistent state or credential leakage
- **NetworkPolicy** — default-deny ingress, explicit egress allowlist:
  - `github.com`, `ghcr.io` — source and registry
  - `api.doppler.com` — build-time secrets
  - `alloy.infra` — telemetry
  - `registry.npmjs.org` — npm packages
- **RBAC** — minimal ServiceAccount per runner class, no cluster-level permissions
- **Runner groups** — GitHub org-level runner groups restrict which repos can use gpu runners
- **Secrets** — GitHub App credentials stored in Doppler (`dk-alchemy-runners` project), synced via DopplerSecret CRD

### Observability

- **Metrics**: ARC controller exposes Prometheus metrics → [Grafana Alloy](https://grafana.com/docs/alloy/latest/) scrapes via `prometheus.io/scrape` annotation
- **Logs**: Pod stdout/stderr → Alloy DaemonSet → [Loki](https://grafana.com/docs/loki/latest/) (standard collection path)
- **Dashboard**: `grafana/dashboards/infrastructure/arc-runners.json`
  - Active runners by class, queue depth, job duration histograms, resource usage, scale events
- **Alerts** (append to `grafana/alerts/infrastructure.yaml`):

| Rule | Condition | Severity |
|------|-----------|----------|
| `arc-runner-queue-stuck` | Jobs queued >10m | critical |
| `arc-runner-high-failure-rate` | >20% failure in 30m | warning |
| `arc-controller-down` | Controller unavailable | critical |

### Migration Path

| Phase | Action | Repos |
|-------|--------|-------|
| 1 | Deploy ARC controller + standard runners, test with dk-alchemy validation workflows | dk-alchemy |
| 2 | Migrate dk-alchemy Docker builds (ddns, probe) to `runs-on: [self-hosted, standard]` | dk-alchemy |
| 3 | Migrate behavior-labs-ai to `runs-on: [self-hosted, large]` for Docker builds | behavior-labs-ai |
| 4 | Roll out to remaining repos | carbon-5, lithium-5, DK-OS, dk-compliance-v2 |
| 5 | Deploy gpu runners on krang for ML workloads | lithium-5, carbon-5 |
| 6 | Decommission Megatron stale runners (no migration needed, just remove) | DK-OS, lithium-5 |
| 7 | Optionally keep GitHub-hosted as fallback (`runs-on` matrix) | All |

---

## Initiative 2: Webhook Service

### Architecture

A lightweight Python FastAPI service in dk-alchemy that receives webhooks from GitHub and product repos, validates signatures, and triggers platform actions.

```
GitHub / Product Repos
  │
  └──► Traefik IngressRoute (TLS + rate-limit)
         └──► webhook-service (FastAPI)
                ├── Signature validation (HMAC-SHA256)
                ├── Handlers:
                │   ├── kustomize-tag-update  → GitHub API commit
                │   ├── argocd-sync           → ArgoCD API
                │   ├── slack-notify          → Slack webhook
                │   └── grafana-annotate      → Grafana API
                └── OTLP traces + Prometheus metrics → Alloy
```

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | **Python (FastAPI)** | Aligns with existing dk-alchemy services (ddns, probe). Lightweight, async-native. |
| Processing | **Synchronous + BackgroundTasks** | Most handlers are fast API calls. Git operations use GitHub REST API (no clone needed). Add Redis queue later if volume demands. |
| Git operations | **GitHub REST API** (not git clone/push) | Stateless. Read kustomization.yaml → update YAML → commit via API. No git credentials on disk. |
| Auth for git | **GitHub App installation token** | Short-lived (1h), scoped, auditable. Better than PAT. |
| Multi-tenant secrets | **Per-repo webhook secrets in Doppler** | Each product repo gets its own HMAC secret. Webhook URL includes repo name for secret lookup. |
| Rate limiting | **[Traefik](https://doc.traefik.io/traefik/) middleware + app-level** | Traefik: 30 req/min burst 50. App: per-repo, per-IP limits. |

### Service Structure

```
src/webhook-service/
  Dockerfile
  requirements.txt
  app/
    main.py                 # FastAPI app + lifespan
    config.py               # Pydantic Settings (Doppler env vars)
    routes/
      github.py             # POST /webhooks/github (org-level webhook)
      custom.py             # POST /webhooks/{repo} (per-repo custom)
      health.py             # GET /health, GET /ready
    handlers/
      kustomize.py          # Update kustomize tags via GitHub API
      argocd.py             # Trigger ArgoCD sync
      slack.py              # Slack notifications
      grafana.py            # Grafana deployment annotations
    middleware/
      signature.py          # HMAC-SHA256 validation
      rate_limit.py         # Per-repo rate limiting
    telemetry.py            # OTel instrumentation
```

This follows the same pattern as `src/ddns-service/` and `src/probe-service/` in dk-alchemy.

### PR Event Forwarding

The webhook service also handles GitHub PR events for the [PR Review Service](pr-review-service.md):

```python
# handlers/pr_critic.py
async def handle_pr_event(payload):
    if payload.action not in ("opened", "synchronize"):
        return
    if not is_staging_branch(payload.pull_request.base.ref):
        return  # Only review PRs targeting staging branches
    await forward_to_lithium5("/api/critic/review", payload)
```

When a PR is opened or updated against a staging branch, the webhook service forwards the event to lithium-5's PR critic service for automated review. The critic runs on krang GPUs and posts review comments back to the PR via GitHub API.

### Kustomize Tag Update Flow (Primary Handler)

This **replaces** the per-repo CI step that currently commits kustomize changes. Product repos no longer need write access to their own `k8s/` overlays — the webhook service owns all kustomize mutations centrally.

```
1. Product repo CI pushes image to GHCR
2. Product repo CI sends webhook:
   POST /webhooks/{repo}
   Body: {"event": "image-built", "image": "...", "tag": "staging-abc1234"}
3. Webhook service validates HMAC signature
4. Handler reads k8s/apps/{service}/overlays/staging/kustomization.yaml
   via GitHub API (GET contents)
5. Updates newTag in YAML
6. Commits via GitHub API with [skip ci] message
7. ArgoCD detects change and syncs
8. Handler optionally triggers ArgoCD sync API for immediate deployment
9. Handler sends Slack notification and Grafana annotation
```

### Doppler Project

```
dk-alchemy-webhooks (Doppler project)
  prd:
    GITHUB_WEBHOOK_SECRET           # Org-level GitHub webhook
    WEBHOOK_SECRET_BEHAVIOR_LABS    # Per-repo HMAC secrets
    WEBHOOK_SECRET_CARBON_5
    WEBHOOK_SECRET_LITHIUM_5
    WEBHOOK_SECRET_DK_OS
    ARGOCD_AUTH_TOKEN               # ArgoCD API
    SLACK_WEBHOOK_URL               # Slack notifications
    GRAFANA_API_KEY                 # Grafana annotations
    GITHUB_APP_ID                   # GitHub App for git operations
    GITHUB_APP_PRIVATE_KEY          # GitHub App key
```

### [K8s](https://kubernetes.io/docs/) Manifests

```
k8s/infrastructure/webhook-service/
  base/
    kustomization.yaml
    deployment.yaml         # 2 replicas, 256m/256Mi → 500m/512Mi
    service.yaml            # ClusterIP :8000
    doppler-secret.yaml     # DopplerSecret for dk-alchemy-webhooks
    network-policy.yaml     # Ingress from Traefik, egress to GitHub/Slack/ArgoCD/Alloy
  overlays/prod/
    ingress-route.yaml      # Traefik IngressRoute with rate-limit + TLS

k8s/edge/routes/base/
    webhook-service.yaml    # Edge IngressRoute for webhooks.datakinetic.com
```

Auto-discovered by the `dk-infrastructure` ApplicationSet. The edge route is picked up by `dk-edge-infrastructure`.

### Observability

- **Traces**: `opentelemetry-instrumentation-fastapi` → Alloy OTLP → [Tempo](https://grafana.com/docs/tempo/latest/)
- **Metrics** (`/metrics`): request rate, duration, signature failures, handler errors — all by repo
- **Dashboard**: `grafana/dashboards/infrastructure/webhook-service.json`
  - Request rate by repo, handler success/failure, signature validation, latency percentiles
- **Alerts** (append to `grafana/alerts/infrastructure.yaml`):

| Rule | Condition | Severity |
|------|-----------|----------|
| `webhook-service-down` | Service unavailable | critical |
| `webhook-high-signature-failures` | >10 failures in 5m | warning |
| `webhook-handler-errors` | >10% error rate in 15m | warning |

### Product Repo Integration

Each product repo replaces its CI kustomize commit step with a webhook notification:

```yaml
# In .github/workflows/build-deploy.yaml
- name: Notify dk-alchemy
  run: |
    PAYLOAD='{"event":"image-built","image":"${{ steps.meta.outputs.image }}","tag":"${{ steps.meta.outputs.tag }}"}'
    SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "${{ secrets.DK_WEBHOOK_SECRET }}" | cut -d' ' -f2)
    curl -s -X POST "https://webhooks.datakinetic.com/webhooks/${{ github.event.repository.name }}" \
      -H "Content-Type: application/json" \
      -H "X-Webhook-Signature: sha256=$SIGNATURE" \
      -d "$PAYLOAD"
```

This replaces the existing `update-gitops` job that commits `newTag` changes directly.

---

## How the Two Initiatives Connect

- **Separate webhook paths**: ARC v2 controller manages its own webhook listener for `workflow_job` events (runner scaling). This is distinct from the webhook service's `/webhooks/*` endpoints.
- **Shared observability**: Both emit metrics to Alloy, logs to Loki, and are monitored via [Grafana](https://grafana.com/docs/grafana/latest/) dashboards in the `infrastructure/` folder.
- **Shared security patterns**: Both use Doppler for secrets, NetworkPolicies for traffic control, and Traefik TLS for external endpoints.
- **Complementary**: Runners execute the builds; the webhook service handles what happens after a build completes (tag updates, syncs, notifications).

## Implementation Sequence

| Week | Initiative 1 (Runners) | Initiative 2 (Webhooks) |
|------|----------------------|------------------------|
| 1 | Deploy ARC controller + standard runners | Create webhook-service source + Dockerfile |
| 2 | Migrate dk-alchemy workflows | Implement handlers (Kustomize, [ArgoCD](https://argo-cd.readthedocs.io/), Slack) |
| 3 | Migrate behavior-labs-ai | Add observability, security, tests |
| 4 | Roll out to remaining repos | Deploy to K8s, register GitHub org webhook |
| 5 | Deploy gpu runners on krang | Integrate product repos |
| 6 | Decommission Megatron runners | Monitor and iterate |

## Related Documentation

- [CI/CD Pipelines](ci-cd-pipelines.md) — build workflows, image tagging, self-hosted runner usage
- [Infrastructure](infrastructure.md) — ARC and webhook-service in component inventory
- [Secrets Management](secrets-management.md) — dk-alchemy-runners and dk-alchemy-webhooks Doppler projects
- [Security & Compliance](security-and-compliance.md) — runner pod isolation, webhook signature validation
- [Onboarding](onboarding.md) — runner label selection and webhook notification step for new repos
- [GitOps & CD](gitops-and-cd.md) — ArgoCD app-of-apps pattern, ApplicationSets
- [Observability](observability.md) — LGTM stack, dashboard/alert patterns
- [PR Review Service](pr-review-service.md) — PR critic service that receives forwarded PR events
