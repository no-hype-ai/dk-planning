# Template Repository

## Overview

The [`data-kinetic/dk-template`](https://github.com/data-kinetic/dk-template) GitHub Template Repository eliminates manual scaffolding when creating new DK product repos. Instead of manually creating ~20 files across `.gitops/`, `k8s/`, `monitoring/`, `.github/workflows/`, and config directories, teams use the template and run a single init script.

**Workflow:**
1. Click **"Use this template"** on GitHub to create a new repo from `data-kinetic/dk-template`
2. Clone the new repo locally
3. Run `./scripts/init.sh --product <name> --team <team> --service <service>`
4. Push to GitHub

## What the Template Generates

### Product Repo Structure

The template generates the full repository scaffold documented in [Onboarding](onboarding.md#1-repository-scaffold):

```
.gitops/
  {{product}}-root-app-prod.yaml
  {{product}}-root-app-staging.yaml
  prod/apps/
    00-project.yaml
    {{service}}.yaml
    doppler-secrets.yaml
  staging/apps/
    00-project.yaml
    {{service}}.yaml
    doppler-secrets.yaml
k8s/
  apps/{{service}}/
    base/
      deployment.yaml
      service.yaml
      kustomization.yaml
    overlays/
      prod/kustomization.yaml
      staging/kustomization.yaml
  apps/doppler-secrets/
    base/
      doppler-secret.yaml
      kustomization.yaml
    overlays/
      prod/kustomization.yaml
      staging/kustomization.yaml
monitoring/
  dashboards/
    {{service}}-overview.json
  alerts/
    {{service}}.yaml
.github/workflows/
  build-deploy.yaml
  standards.yaml
scripts/
  doppler/
    setup-doppler-dev.sh
.dk-standards.yaml
renovate.json
```

### dk-alchemy PR Content

The template also generates dk-alchemy PR content in `_dk-alchemy-pr/`, ready to be submitted as a PR to dk-alchemy:

```
_dk-alchemy-pr/
  .gitops/external/{{product}}-prod.yaml
  .gitops/external/{{product}}-staging.yaml
  .gitops/repositories/{{product}}-bootstrap.yaml
  grafana/provisioning/alerting/contact-points-addition.yaml
  grafana/provisioning/alerting/notification-policies-addition.yaml
```

## Init Script

`scripts/init.sh` configures the generated repo for a specific product:

```bash
./scripts/init.sh \
  --product carbon-5 \
  --team data-platform \
  --service api \
  --service worker       # repeat for multi-service repos
```

### What It Does

| Step | Action |
|------|--------|
| **Placeholder replacement** | Replaces `{{product}}`, `{{team}}`, `{{service}}` in all files |
| **Directory renaming** | Renames `k8s/apps/{{service}}/` to `k8s/apps/api/`, etc. |
| **`.dk-standards.yaml`** | Pre-fills product/team and default tiers `[1, 2, 3]` |
| **`renovate.json`** | Pre-configured extending the org base config (`local>data-kinetic/.github:renovate-config`) |
| **`build-deploy.yaml`** | Pre-configured calling the shared reusable workflow |
| **`standards.yaml`** | Pre-configured calling the shared standards check workflow |
| **Deployment manifests** | Pre-configured with liveness/readiness probes on `/health` and `/ready` |
| **dk-alchemy PR content** | Generates files in `_dk-alchemy-pr/` for the dk-alchemy integration PR |
| **Self-cleanup** | Removes `scripts/init.sh` itself and `_dk-alchemy-pr/` instructions after use |

### Multi-Service Repos

Pass `--service` multiple times to generate per-service directories under `k8s/apps/` and per-service ArgoCD Applications in `.gitops/`:

```bash
./scripts/init.sh --product carbon-5 --team data-platform \
  --service api --service worker --service scheduler
```

## Template Contents Detail

| Generated File/Directory | Purpose | Reference |
|--------------------------|---------|-----------|
| `.gitops/` | ArgoCD Application manifests (root apps, per-service apps, AppProject) | [GitOps & CD](gitops-and-cd.md#product-repo-gitops-convention) |
| `k8s/` | Kustomize base + overlay manifests per service | [GitOps & CD](gitops-and-cd.md#manifest-organization) |
| `monitoring/dashboards/` | Placeholder Grafana dashboard JSON with correct UID/tag conventions | [Observability](observability.md#dashboard-contribution-quick-start) |
| `monitoring/alerts/` | Placeholder alert YAML with required labels (`team`, `service`, `product`, `severity`) | [Observability](observability.md#dashboard-contribution-quick-start) |
| `.github/workflows/build-deploy.yaml` | Build-deploy pipeline calling the shared reusable workflow | [CI/CD Pipelines](ci-cd-pipelines.md) |
| `.github/workflows/standards.yaml` | Standards compliance check calling the shared reusable workflow | [Standards Compliance](standards-compliance.md) |
| `.dk-standards.yaml` | Per-repo standards configuration (product, team, tiers) | [Standards Compliance](standards-compliance.md#per-repo-configuration) |
| `renovate.json` | Dependency update automation extending org base config | [CI/CD Pipelines](ci-cd-pipelines.md#4-dependency-update-automation) |
| `scripts/doppler/setup-doppler-dev.sh` | Local Doppler CLI setup following naming convention | [Secrets Management](secrets-management.md) |
| `_dk-alchemy-pr/` | Pre-built dk-alchemy PR content (external app bootstraps, alert routing) | [Onboarding](onboarding.md#2-dk-alchemy-integration) |

## Post-Init Checklist

After running `init.sh`, complete the remaining manual steps from [Onboarding](onboarding.md):

- [ ] Create Doppler project with `dev`, `stg`, `prd` configs ([Section 4](onboarding.md#4-secrets))
- [ ] Create Slack channel for team alerts ([Prerequisites](onboarding.md#prerequisites))
- [ ] Submit dk-alchemy PR using generated `_dk-alchemy-pr/` content ([Section 2](onboarding.md#2-dk-alchemy-integration))
- [ ] Request per-repo webhook secret (`DK_WEBHOOK_SECRET`) ([Section 3](onboarding.md#3-cicd-pipeline))
- [ ] Configure branch protection on `main` and `staging`
- [ ] Add observability package and configure OTLP env vars ([Section 5](onboarding.md#5-observability))
- [ ] Implement health check endpoints ([Section 6](onboarding.md#6-health-checks))
- [ ] Set up PostHog if user-facing ([Section 7](onboarding.md#7-product-analytics-if-user-facing))
- [ ] Configure issue governance labels ([Section 8](onboarding.md#8-issue-governance))
- [ ] Production hardening review ([Section 12](onboarding.md#12-production-hardening))

## Related Documentation

- [Onboarding](onboarding.md) — full checklist for adding a new product repo
- [GitOps & CD](gitops-and-cd.md) — ArgoCD app-of-apps pattern and manifest organization
- [CI/CD Pipelines](ci-cd-pipelines.md) — build-deploy workflows and dependency automation
- [Standards Compliance](standards-compliance.md) — tiered CI/CD standards enforcement
- [Observability](observability.md) — LGTM stack and self-service monitoring
- [Secrets Management](secrets-management.md) — Doppler setup and naming conventions
- [Application Instrumentation](application-instrumentation.md) — OTel SDK and health checks
