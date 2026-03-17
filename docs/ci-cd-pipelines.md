# CI/CD Pipelines

## Overview

All CI/CD runs on **GitHub Actions**. Each product repo owns its own build-deploy workflow; dk-alchemy has separate workflows for infrastructure validation, Grafana sync, and security scanning. The target state is a shared reusable workflow library that standardizes the build-deploy pattern across repos.

## Current Workflows

### dk-alchemy

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `argocd-sync-check.yaml` | Push | Validates ArgoCD sync status |
| `kubeconform.yaml` | PR/Push | Validates Kubernetes manifests against schemas |
| `kustomize-validate.yaml` | PR/Push | Runs `kustomize build` on all overlays |
| `yaml-lint.yaml` | PR/Push | YAML linting |
| `security-scan.yaml` | PR/Push | Security scanning |
| `grafana-dashboards.yaml` | Push to main | Syncs dashboards/alerts to Grafana |
| `grafana-pr-preview.yaml` | PR | Validates dashboard JSON, posts preview |
| `build-ddns.yaml` | Push | Builds ddns-service image |
| `build-probe.yaml` | Push | Builds probe-service image |

### behavior-labs-ai (Reference)

Single workflow: `.github/workflows/build-deploy.yaml`

**5 jobs:**

1. **prepare** — extracts metadata (environment, Doppler config, tag prefix, SHA)
   - `main` / `v*` tags → `prod`
   - `staging` branch → `staging`

2. **detect-changes** — `dorny/paths-filter` for smart change detection per app (api, app, admin, migrate) including dependent packages. Skipped on tag push.

3. **build** — parallel Docker builds via matrix (4 images: api, app, admin, migrate)
   - Registry: GHCR (`ghcr.io/data-kinetic/behavior-labs-ai/<app>`)
   - Tags: `staging-<sha7>` for staging, `<version>` + `latest` for tags, `main-<sha7>` for main
   - Doppler CLI installed in Docker for build-time secret injection (`--mount=type=secret`)
   - SBOM and provenance attestations enabled

4. **update-gitops** — staging only: commits updated `newTag` to kustomize overlays with `[skip ci]`

5. **summary** — workflow summary with build status

### behavior-labs-ai Issue Governance

Multiple scheduled workflows driving the issue governance scripts (see [Issue Governance](issue-governance.md)):
- Triage evidence enforcement (hourly)
- Status traceability (every 20m)
- Risk prioritization sync (every 15m)
- Regression closure gates (every 25m)
- Stub governance (daily)
- Weekly reports (Monday 8 AM UTC)

## Image Tagging Convention

| Environment | Tag Format | Example |
|-------------|------------|---------|
| Staging | `staging-<sha7>` | `staging-a1b2c3d` |
| Production (tag) | `<version>` + `latest` | `1.2.3`, `latest` |
| Main (untagged) | `main-<sha7>` | `main-a1b2c3d` |

## Build-Time Secrets

Doppler CLI is installed in Docker builds. Secrets are injected via `--mount=type=secret` (not baked into layers):
- `DOPPLER_TOKEN` passed as a Docker build secret
- Doppler project: `behaviorlabs-applications` with configs: `dev`, `stg`, `prd`

## Supply Chain Security

- **SBOM generation** enabled on Docker builds
- **Provenance attestations** enabled
- **Source map deletion** post-upload (Sentry, to be removed)
- **Image source restriction** — all images from `ghcr.io/data-kinetic/` (should be enforced via policy)

## Recommendations

### 1. Shared Reusable Workflow

Create a reusable GitHub Actions workflow in a `.github` org-level repo:

```yaml
# .github/workflows/build-deploy.yaml (in org .github repo)
# Encapsulates:
#   - Docker build with Doppler secrets injection
#   - GHCR push with standard tagging
#   - Kustomize overlay update for staging
#   - SBOM and provenance attestation

# Product repos call:
jobs:
  build:
    uses: data-kinetic/.github/.github/workflows/build-deploy.yaml@main
    with:
      apps: '["api", "app", "admin"]'
      doppler-project: behaviorlabs-applications
    secrets: inherit
```

### 2. Extend Validation to Product Repos

dk-alchemy already runs kubeconform and kustomize-validate. Extend to product repos:
- Add `kubeconform` check for `k8s/` manifests
- Add `kustomize build` validation for all overlays
- Add YAML linting for `.gitops/` and `k8s/` directories

### 3. CI-Driven Dashboard Validation

When product repos contribute dashboards (see [Observability](observability.md#product-repo-self-service-monitoring)):
- Validate dashboard JSON schema in CI
- Validate alert YAML syntax
- Post preview of changed dashboards in PR comments

### 4. Dependency Update Automation

<!-- TODO: Document Renovate/Dependabot strategy if in use -->
- Automate base image updates
- Automate npm dependency updates
- Pin and audit GitHub Action versions

## Gaps

- **No shared workflow** — each repo maintains its own build-deploy pipeline, leading to drift
- **No kubeconform in product repos** — only dk-alchemy validates manifests
- **No automated dependency updates** documented
- **Smart change detection is repo-specific** — each repo must configure `dorny/paths-filter` independently

## Related Documentation

- [GitOps & CD](gitops-and-cd.md) — what happens after CI pushes images
- [Security & Compliance](security-and-compliance.md) — supply chain, image provenance
- [Onboarding](onboarding.md) — CI setup for new repos
