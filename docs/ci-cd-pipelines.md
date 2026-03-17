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

Create a reusable GitHub Actions workflow in a `.github` org-level repo. Note: [`dk-template`](https://github.com/data-kinetic/dk-template) pre-configures the shared workflow call in generated repos — see [Template Repository](template-repo.md).

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

Deploy **Renovate** (self-hosted on ARC runners) for automated dependency management. Note: [`dk-template`](https://github.com/data-kinetic/dk-template) includes a pre-configured `renovate.json` extending the org base config — see [Template Repository](template-repo.md).

- **Docker base images** — auto-PR when base images have updates (e.g., `node:20-alpine`)
- **npm dependencies** — group minor/patch updates into weekly PRs, pin majors for manual review
- **GitHub Actions** — pin to commit SHA, auto-PR when new versions are available
- **Helm charts** — track Helm chart versions in dk-alchemy kustomization files

Renovate config (`renovate.json`) in each repo:
```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["local>data-kinetic/.github:renovate-config"],
  "packageRules": [
    { "groupName": "minor-and-patch", "matchUpdateTypes": ["minor", "patch"], "automerge": true },
    { "groupName": "github-actions", "matchManagers": ["github-actions"], "pinDigests": true }
  ]
}
```

### 5. Image Tag Immutability

Image tags **must be immutable** — never overwrite a tag that has been deployed:

| Environment | Tag Format | Mutable? | Policy |
|-------------|------------|----------|--------|
| Staging | `staging-<sha7>` | No | Each commit produces a unique tag |
| Production | `<semver>` (e.g., `1.2.3`) | No | Release tags are immutable |
| Production | `latest` | Yes | Acceptable for convenience but never used in kustomize overlays |
| Main | `main-<sha7>` | No | Development builds |

**Enforcement:** The [Standards Compliance](standards-compliance.md) Tier 1 checks reject `:latest` in production overlays. Kyverno admission policy provides in-cluster enforcement.

## Self-Hosted Runners (ARC v2)

All CI/CD is migrating from GitHub-hosted runners to **self-hosted ephemeral runners** managed by Actions Runner Controller v2 on the K3s cluster. See [Self-Hosted Runners & Webhook Service](self-hosted-runners-and-webhooks.md) for full details on runner classes (standard/large/gpu), resource allocations, security, and migration path.

**Quick reference** — select runners via `runs-on`:

```yaml
jobs:
  build:
    runs-on: [self-hosted, linux, large]   # Docker builds, Turborepo
  lint:
    runs-on: [self-hosted, linux, standard] # Linting, testing, validation
  ml-test:
    runs-on: [self-hosted, linux, gpu]      # GPU workloads (requires runner group approval)
```

### Build Caching

- **Docker layers**: Registry-based cache via `--cache-from`/`--cache-to` on GHCR (`ghcr.io/<repo>/cache`)
- **Turborepo**: Self-hosted remote cache on MinIO (`TURBO_API` → MinIO S3 endpoint)

## Webhook-Driven Deployments

The **webhook service** replaces per-repo CI kustomize commits. Instead of each repo's CI committing `newTag` changes to its own overlays, product repos send a webhook to `webhooks.datakinetic.com` after pushing an image. The webhook service handles the kustomize update, ArgoCD sync, Slack notification, and Grafana annotation centrally.

See [Self-Hosted Runners & Webhook Service](self-hosted-runners-and-webhooks.md) for the full architecture and integration pattern.

### Product Repo CI Change

Replace the `update-gitops` job with a webhook notification step:

```yaml
- name: Notify dk-alchemy
  run: |
    PAYLOAD='{"event":"image-built","image":"${{ steps.meta.outputs.image }}","tag":"${{ steps.meta.outputs.tag }}"}'
    SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "${{ secrets.DK_WEBHOOK_SECRET }}" | cut -d' ' -f2)
    curl -s -X POST "https://webhooks.datakinetic.com/webhooks/${{ github.event.repository.name }}" \
      -H "Content-Type: application/json" \
      -H "X-Webhook-Signature: sha256=$SIGNATURE" \
      -d "$PAYLOAD"
```

## Standards Compliance Checks

A reusable GitHub Actions workflow enforces platform standards across all repos at CI time. See [Standards Compliance](standards-compliance.md) for the full tier system.

Product repos opt in by calling the reusable workflow:

```yaml
jobs:
  standards:
    uses: data-kinetic/.github/.github/workflows/standards-check.yaml@main
    with:
      tiers: '1,2,3'
```

**Tiers enforced in CI:**
- **Tier 1 — Manifest Validation:** kubeconform, kustomize build, required labels, no `:latest`, resource limits, probes
- **Tier 2 — Observability:** dashboard/alert existence and validity, OTLP component reference
- **Tier 3 — CI/CD:** SBOM + provenance, Action SHA pinning, webhook notification step
- **Tier 4 — Code Patterns** (language-specific): health endpoints, observability imports

Grace periods allow repos to adopt standards gradually. See [Standards Compliance](standards-compliance.md#per-repo-configuration) for configuration.

## Gaps

- **No shared workflow** — each repo maintains its own build-deploy pipeline, leading to drift
- **No kubeconform in product repos** — only dk-alchemy validates manifests (addressed by Tier 1 standards checks)
- **Smart change detection is repo-specific** — each repo must configure `dorny/paths-filter` independently

## Related Documentation

- [GitOps & CD](gitops-and-cd.md) — what happens after CI pushes images
- [Self-Hosted Runners & Webhook Service](self-hosted-runners-and-webhooks.md) — runner details, webhook-driven deploys
- [Standards Compliance](standards-compliance.md) — CI/CD standards tier system
- [PR Review Service](pr-review-service.md) — automated PR review
- [Security & Compliance](security-and-compliance.md) — supply chain, image provenance
- [Template Repository](template-repo.md) — pre-configured CI workflows in generated repos
- [Onboarding](onboarding.md) — CI setup for new repos
