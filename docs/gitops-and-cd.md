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
  ├── dk-infrastructure-staging — list generator (11 components, overlays/staging)
  ├── dk-edge-infrastructure   — matrix generator (2 edge LBs x 3 components)
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
| `dk-infrastructure-staging` | list (11 components) | `k8s/infrastructure/*` | `overlays/staging` → `infra-staging` namespace |
| `dk-edge-infrastructure` | matrix (2 clusters x 3 components) | `k8s/edge/*` | phantom (10.0.0.2), venom (10.0.0.3) |
| `dk-apps` / `dk-apps-staging` | (empty) | — | Reserved |

### Currently Bootstrapped External Apps

| Tenant | Repository | Prod Branch | Staging Branch |
|--------|------------|-------------|----------------|
| BehaviorLabs AI | `data-kinetic/behavior-labs-ai` | `main` | `staging` |
| BehaviorLabs Web | `data-kinetic/behavior-labs-web` | `main` | `staging` |
| Agent Mesh | `data-kinetic/agent-mesh` | `main` | `staging` |
| DK Data | `data-kinetic/dk-data-fe` | `main` | `staging` |
| DK Mercury | `data-kinetic/dk-mercury` | `main` | `staging` |
| DK Phantom | `data-kinetic/dk-phantom` | `main` | `staging` |

## Image Promotion Strategy

### Current State (behavior-labs-ai reference)

| Environment | Mechanism |
|-------------|-----------|
| **Staging** | CI builds image → pushes to GHCR → CI commits updated `newTag` to `k8s/apps/*/overlays/staging/kustomization.yaml` → ArgoCD syncs |
| **Production** | ArgoCD Image Updater (semver/digest) or manual tag update |

### Gap

Two different promotion mechanisms for staging vs. production creates confusion.

### Recommendation: Unified Flow

- **Staging:** Keep CI-driven kustomize tag updates (works well, immediate feedback).
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

Every product repo should maintain this structure (see [Onboarding](onboarding.md) for the full checklist):

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

## Progressive Delivery (Future)

When the platform matures, layer in:

- **Argo Rollouts** for canary/blue-green deployments (replaces vanilla Deployments)
- **Analysis templates** tied to Mimir metrics (error rate, latency p99) for automated rollback
- Pilot with behavior-labs-ai's API service, then extend to other products

## Related Documentation

- [Platform Overview](platform-overview.md) — architecture context
- [CI/CD Pipelines](ci-cd-pipelines.md) — build and image push workflows
- [Onboarding](onboarding.md) — how to add a new product repo
- [Infrastructure](infrastructure.md) — what dk-alchemy manages
