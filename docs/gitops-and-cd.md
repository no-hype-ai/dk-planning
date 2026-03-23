# GitOps & Continuous Delivery

## Overview

ArgoCD is the sole CD engine. All cluster state is declared in Git — dk-alchemy owns infrastructure, product repos own application manifests. No manual `kubectl` in the deployment loop.

## App of Apps Pattern

### 3-Tier Architecture

```
Tier 1: Bootstrap (manual one-time kubectl apply)
  └─ dk-repositories Application
       ├── AppProjects (per-tenant RBAC boundaries)
       ├── dk-root-applicationsets (→ Tier 2)
       └── dk-external-apps (→ Tier 3)

Tier 2: ApplicationSets (auto-generated)
  ├── dk-infrastructure        — git directory generator over k8s/infrastructure/*
  ├── dk-infrastructure-staging — list generator (9 components, overlays/staging)
  ├── dk-edge-infrastructure   — matrix generator (2 edge clusters × 2 shared) + list (2 keepalived) = 6 Apps
  └── dk-apps / dk-apps-staging — reserved for future mono-repo workloads

Tier 3: External App Bootstraps
  └── Per-repo Application pointing to <repo>/.gitops/<env>/apps/
      (each external repo owns its own ArgoCD Application manifests)
```

### How It Works

1. **dk-alchemy declares** a bootstrap Application for each external product repo in `.gitops/external/`, pointing ArgoCD at that repo's `.gitops/prod/apps` or `.gitops/staging/apps` directory.
2. **Each product repo** contains its own ArgoCD Application manifests (AppProject, per-service Applications, Doppler secrets) inside `.gitops/<env>/apps/`.
3. **ArgoCD auto-syncs** with `prune: true` and `selfHeal: true` — pushing to `main` or `staging` triggers deployment.
4. **Image promotion** is per-repo: CI pushes images to GHCR, then updates the image tag in the GitOps overlay, which ArgoCD detects and deploys.

### Manifest Organization

All infrastructure uses **Kustomize base + overlay**:
- `k8s/infrastructure/<component>/base/` — shared base manifests
- `k8s/infrastructure/<component>/overlays/prod/` — production patches
- `k8s/infrastructure/<component>/overlays/staging/` — staging patches (optional)

Reusable Kustomize components in `k8s/components/`:
- `hpa-production` / `hpa-standard` — HorizontalPodAutoscaler templates
- `pdb-standard` — PodDisruptionBudget
- `doppler-secret` — DopplerSecret CRD template
- `otlp-collector` — ExternalName service for OTLP telemetry
- `service-loadbalancer` — LoadBalancer service template

### ApplicationSet Generators in Use

| ApplicationSet | Generator | Source | Target |
|----------------|-----------|--------|--------|
| `dk-infrastructure` | git directory | `k8s/infrastructure/*` | `overlays/prod` → `infra` namespace |
| `dk-infrastructure-staging` | list (9 components: doppler-secrets, postgres, redis, minio, loki, mimir, tempo, opensearch, grafana) | `k8s/infrastructure/*` | `overlays/staging` → `infra-staging` namespace |
| `dk-edge-infrastructure` | matrix generator (2 edge clusters × 2 shared components: traefik, routes) + list (2 keepalived) = 6 Applications | `k8s/edge/*` | phantom (10.0.0.2), venom (10.0.0.3) |
| `dk-apps` / `dk-apps-staging` | (empty) | — | Reserved |

### Currently Bootstrapped External Apps

| Tenant | Repository | Prod Branch | Staging Branch | Status |
|--------|------------|-------------|----------------|--------|
| BehaviorLabs AI | `data-kinetic/behavior-labs-ai` | `main` | `staging` | Production |
| BehaviorLabs Web | `data-kinetic/behavior-labs-web` | `main` | `staging` | Production |
| Agent Mesh | `data-kinetic/agent-mesh` | `main` | `staging` | Deprecated — migrating to lithium-5 |
| DK Data | `data-kinetic/dk-data-fe` | `main` | `staging` | Deprecated — migrating to carbon-5 |
| DK Mercury | `data-kinetic/dk-mercury` | `main` | `staging` | Deprecated — migrating to DK-OS |
| DK Phantom | `data-kinetic/dk-phantom` | `main` | `staging` | Deprecated — migrating to DK-OS |

**Pending onboarding** (will be added as migrations complete):

| Tenant | Repository | Prod Branch | Staging Branch |
|--------|------------|-------------|----------------|
| Carbon-5 | `data-kinetic/carbon-5` | `main` | `staging` |
| DK-OS | `data-kinetic-projects/DK-OS` | `main` | `staging` |
| Lithium-5 | `data-kinetic/lithium-5` | `main` | `staging` |
| DK Compliance v2 | `data-kinetic/dk-compliance-v2` | `main` | `staging` |

## Local Development

Local/dev environments are **product-repo-specific** and not managed by [ArgoCD](https://argo-cd.readthedocs.io/). Unlike staging and production which use the ArgoCD GitOps loop, local development typically runs via [Docker Compose](https://docs.docker.com/compose/) or [k3d](https://k3d.io/) with secrets injected directly from [Doppler](https://docs.doppler.com/).

### Convention

Product repos may include a `.gitops/local/apps/` directory for local environment configuration. This is optional — not all repos need it.

```
.gitops/
  <app>-root-app-prod.yaml
  <app>-root-app-staging.yaml
  prod/apps/
    ...
  staging/apps/
    ...
  local/apps/              # Optional — local dev config
    docker-compose.yaml
    .env.example
```

### Reference: behavior-labs-ai

`behavior-labs-ai` maintains a `.gitops/local/apps/` directory with Docker Compose configuration for running the full stack locally. This pattern is recommended for repos where developers need a full local environment.

### dk-cli Integration

The [`dk` CLI tool](dk-cli.md) provides lifecycle commands for local development:

| Command | Purpose |
|---------|---------|
| `dk up` | Start local environment (docker-compose or k3d) |
| `dk down` | Stop and clean up local environment |
| `dk logs` | Stream logs from local services |
| `dk status` | Show running services and health |
| `dk secrets` | Inject Doppler secrets for local dev |

The `dk-template` scaffolding generates the local development structure automatically. See [Template Repository](template-repo.md) and [dk-cli](dk-cli.md) for details.

## Image Promotion Strategy

### Current State (behavior-labs-ai reference)

| Environment | Mechanism |
|-------------|-----------|
| **Staging** | CI builds image → pushes to GHCR → CI commits updated `newTag` to `k8s/apps/*/overlays/staging/kustomization.yaml` → ArgoCD syncs |
| **Production** | ArgoCD Image Updater (semver/digest) or manual tag update |

### Gap

Two different promotion mechanisms for staging vs. production creates confusion. Additionally, staging promotion is shifting from direct CI kustomize commits to the centralized [webhook service](self-hosted-runners-and-webhooks.md).

### Recommendation: Unified Flow

- **Staging:** Use the webhook service for all kustomize tag updates. Product repo CI sends a webhook after image push; the webhook service commits `newTag` changes via GitHub API. See [Self-Hosted Runners & Webhook Service](self-hosted-runners-and-webhooks.md#kustomize-tag-update-flow-primary-handler) for the full flow.
- **Production:** Standardize on ArgoCD Image Updater with semver constraints, triggered by tagging a release. Remove manual kustomize tag editing for prod.
- Document the promotion flow in dk-alchemy so all product teams follow the same process.

## Preview Environments

### Current State

Static IngressRoute definitions exist for preview domains, but no automated per-PR workflow.

### Recommendation

Implement per-PR ephemeral environments using ArgoCD ApplicationSets with a pull-request generator:

- On PR open: ArgoCD creates `<app>-preview-<pr-number>` namespace
- Traefik IngressRoute at `pr-<number>.preview.<domain>`
- On PR close/merge: ArgoCD prunes the namespace
- Replaces static preview IngressRoutes in dk-alchemy edge routes

## Product Repo GitOps Convention

Every product repo should maintain this structure. This is auto-generated by [`data-kinetic/dk-template`](https://github.com/data-kinetic/dk-template) — see [Template Repository](template-repo.md). For the full setup checklist, see [Onboarding](onboarding.md).

```
.gitops/
  <app>-root-app-prod.yaml
  <app>-root-app-staging.yaml
  prod/apps/
    00-project.yaml         # ArgoCD AppProject
    <service>.yaml           # Per-service Application
    doppler-secrets.yaml
  staging/apps/
    ...
k8s/
  apps/<service>/
    base/
      deployment.yaml
      service.yaml
      kustomization.yaml
    overlays/
      prod/kustomization.yaml
      staging/kustomization.yaml
```

## Database Migration Patterns

For products using database migrations (Prisma, Drizzle, Knex, etc.), use **ArgoCD PreSync hooks** to run migrations before the application deploys:

```yaml
# k8s/apps/<service>/base/migration-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: <service>-migrate
  annotations:
    argocd.argoproj.io/hook: PreSync
    argocd.argoproj.io/hook-delete-policy: BeforeHookCreation
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: ghcr.io/data-kinetic/<repo>/<service>-migrate
          envFrom:
            - secretRef:
                name: <product>-secrets   # Doppler-synced
      restartPolicy: Never
  backoffLimit: 1
```

**Key principles:**
- Migrations run as a Kubernetes Job with `PreSync` hook — ArgoCD runs them before updating the Deployment
- `BeforeHookCreation` delete policy ensures old Job is cleaned up before creating a new one
- Migrations must be **backwards-compatible** — the old app version must still work with the new schema (since rolling updates mean both versions coexist briefly)
- Use separate migration images (e.g., `<service>-migrate`) to keep migration tooling out of the runtime image

## Progressive Delivery (Future)

When the platform matures, layer in:

- **Argo Rollouts** for canary/blue-green deployments (replaces vanilla Deployments)
- **Analysis templates** tied to Mimir metrics (error rate, latency p99) for automated rollback
- Pilot with behavior-labs-ai's API service, then extend to other products

## Related Documentation

- [Platform Overview](platform-overview.md) — architecture context
- [CI/CD Pipelines](ci-cd-pipelines.md) — build and image push workflows
- [Self-Hosted Runners & Webhook Service](self-hosted-runners-and-webhooks.md) — webhook-driven staging promotion
- [Standards Compliance](standards-compliance.md) — CI/CD standards enforcement
- [Template Repository](template-repo.md) — auto-generates the product repo GitOps structure
- [Onboarding](onboarding.md) — how to add a new product repo
- [Infrastructure](infrastructure.md) — what dk-alchemy manages
