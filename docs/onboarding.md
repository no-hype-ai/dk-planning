# Onboarding

## Overview

This document is the checklist for adding a new product repo to the Data Kinetic platform. It covers GitOps integration, CI/CD, observability, analytics, secrets, and issue governance.

Repos pending onboarding: dk-compliance-v2, DK-OS, carbon-5.

## Prerequisites

- [ ] Repository exists in the `data-kinetic` GitHub org (or cross-org credentials configured for `data-kinetic-projects`)
- [ ] [Doppler](https://docs.doppler.com/) project created with `dev`, `stg`, `prd` configs
- [ ] Slack channel created for team alerts (e.g., `#<product>-alerts`)

## 1. Repository Scaffold

Create the GitOps and Kubernetes directory structure:

```
.gitops/
  <product>-root-app-prod.yaml           # ArgoCD root Application (main branch)
  <product>-root-app-staging.yaml         # ArgoCD root Application (staging branch)
  prod/apps/
    00-project.yaml                       # ArgoCD AppProject (RBAC boundaries)
    <service>.yaml                        # Per-service ArgoCD Application
    doppler-secrets.yaml                  # DopplerSecret Application
  staging/apps/
    00-project.yaml
    <service>.yaml
    doppler-secrets.yaml
k8s/
  apps/<service>/
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
    <service>-overview.json
  alerts/
    <service>.yaml
.github/workflows/
  build-deploy.yaml
```

> **Template available:** Use [`data-kinetic/dk-template`](https://github.com/data-kinetic/dk-template) to generate this structure automatically. Click "Use this template" on GitHub, then run `./scripts/init.sh --product <name> --team <team> --service <service>`. See [Template Repository](template-repo.md) for details.

## 2. dk-alchemy Integration

Submit a PR to dk-alchemy adding:

- [ ] **External app bootstrap** — `.gitops/external/<product>-prod.yaml` and `<product>-staging.yaml`
  - Points to the product repo's `.gitops/prod/apps` and `.gitops/staging/apps`
  - References appropriate branch (main/staging)
- [ ] **AppProject** — `.gitops/repositories/<product>-bootstrap.yaml`
  - Defines allowed repos, namespaces, cluster resources for this product
- [ ] **Slack contact point** — `grafana/provisioning/alerting/contact-points.yaml`
  - Add entry for the product team's alert channel
- [ ] **Notification policy route** — `grafana/provisioning/alerting/notification-policies.yaml`
  - Route `team=<product-team>` to the new contact point

## 3. CI/CD Pipeline

- [ ] Add `build-deploy.yaml` workflow (use shared workflow when available)
  - [Docker](https://docs.docker.com/) build with Doppler secrets injection
  - [GHCR](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) push with standard tagging (`staging-<sha7>`, `<version>`, `main-<sha7>`)
  - SBOM and provenance attestation
- [ ] **Select runner labels** — choose the appropriate self-hosted runner class for each job:
  - `runs-on: [self-hosted, linux, standard]` — linting, testing, kustomize validation
  - `runs-on: [self-hosted, linux, large]` — Docker builds, [Turborepo](https://turbo.build/repo/docs), [Playwright](https://playwright.dev/docs/intro)
  - `runs-on: [self-hosted, linux, gpu]` — ML workloads (requires runner group approval)
  - See [Self-Hosted Runners & Webhook Service](self-hosted-runners-and-webhooks.md) for details
- [ ] **Add webhook notification step** — replace direct kustomize commits with a webhook call to `webhooks.datakinetic.com`:
  ```yaml
  - name: Notify dk-alchemy
    run: |
      PAYLOAD='{"event":"image-built","image":"...","tag":"..."}'
      SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "${{ secrets.DK_WEBHOOK_SECRET }}" | cut -d' ' -f2)
      curl -s -X POST "https://webhooks.datakinetic.com/webhooks/${{ github.event.repository.name }}" \
        -H "Content-Type: application/json" \
        -H "X-Webhook-Signature: sha256=$SIGNATURE" \
        -d "$PAYLOAD"
  ```
  - Request a per-repo webhook secret (`DK_WEBHOOK_SECRET`) — stored in Doppler `dk-alchemy-webhooks` project
- [ ] Configure `dorny/paths-filter` for smart change detection per service
- [ ] Add [kubeconform](https://github.com/yannh/kubeconform) and kustomize-validate CI checks for `k8s/` manifests
- [ ] Set up branch protection on `main` and `staging`

## 4. Secrets

- [ ] Create Doppler project: `<product>-applications` with configs `dev`, `stg`, `prd`
- [ ] Add service-specific secrets to each config
- [ ] Create `DopplerSecret` CRD manifests in `k8s/apps/doppler-secrets/`
- [ ] Add Doppler service token to GitHub repo secrets (for CI builds)
- [ ] Create `scripts/doppler/setup-doppler-dev.sh` for local development

## 5. Observability

- [ ] Add `@datakinetic/observability` package (or `@repo/observability` until extracted)
- [ ] Configure env vars in Doppler:
  - `OTEL_SERVICE_NAME` — unique per service (e.g., `<product>-api`)
  - `OTEL_EXPORTER_OTLP_ENDPOINT` — `http://otlp-collector:4318` (in-cluster)
- [ ] Include `otlp-collector` Kustomize component in each service's kustomization
- [ ] Add `instrumentation.ts` in each app entry point
- [ ] Wrap error handling with `parseError()` from observability package
- [ ] Create `monitoring/dashboards/<service>-overview.json`
  - UID format: `<product>-<service>-overview`
  - Tags: `["<product>", "<service>", "auto-deployed"]`
- [ ] Create `monitoring/alerts/<service>.yaml`
  - Required labels: `team`, `service`, `product`, `severity`
- [ ] Include `grafana-dashboards` and `grafana-alerts` Kustomize components

## 6. Health Checks

- [ ] `GET /health` — k8s liveness probe (bare `200 OK`, no dependency checks)
- [ ] `GET /ready` — k8s readiness probe (check critical dependencies: DB, cache)
- [ ] `GET /api/health` — detailed health endpoint (per-dependency status, response times)
- [ ] Configure liveness and readiness probes in Deployment manifests

## 7. Product Analytics (if user-facing)

- [ ] Add `@repo/analytics` (or future `@datakinetic/analytics`) package
- [ ] Configure `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` in Doppler
- [ ] Wrap app root in `AnalyticsProvider`
- [ ] Call `useIdentifyUser()` after authentication
- [ ] Define events following `<domain>.<action>` naming convention
- [ ] Set up feature flags in [PostHog](https://posthog.com/docs) with matching flag keys in code

## 8. Issue Governance

- [ ] Add issue governance workflows (use shared workflow when available)
- [ ] Configure label taxonomy matching governance scripts:
  - Status labels: `status/triage`, `status/in-progress`, `status/in-review`, `status/done`, `status/blocked`
  - Priority labels: `priority/P0` through `priority/P4`
  - Team labels: `team/<product-team>`
- [ ] Define SLO targets for the product
- [ ] Add SLO dashboard to `monitoring/dashboards/<service>-slo.json`

## 9. Kustomize Component Matrix

The following Kustomize components (from `dk-alchemy k8s/components/`) should be included based on your service's needs:

| Component | When to Include | Example |
|-----------|-----------------|---------|
| `hpa-production` | Production services that need autoscaling | API servers, web apps |
| `hpa-standard` | Staging/smaller services with autoscaling | Background workers |
| `pdb-standard` | Any service with >1 replica | All production services |
| `doppler-secret` | All services | Required for secrets |
| `otlp-collector` | All services | Required for observability |
| `service-loadbalancer` | Services exposed via edge LB | Public APIs, web apps |
| `grafana-dashboards` | Services with custom dashboards | Services contributing `monitoring/dashboards/` |
| `grafana-alerts` | Services with custom alerts | Services contributing `monitoring/alerts/` |

Include components in your overlay's `kustomization.yaml`. The relative paths navigate from the overlay directory up to the shared `components/` directory in dk-alchemy:

```
k8s/
├── apps/<service>/
│   ├── base/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── kustomization.yaml
│   └── overlays/
│       ├── prod/
│       │   └── kustomization.yaml   ← YOU ARE HERE
│       └── staging/
│           └── kustomization.yaml
└── components/                      ← ../../../../components/
    ├── doppler-secret/
    ├── otlp-collector/
    ├── hpa-production/
    ├── pdb-standard/
    ├── grafana-dashboards/
    └── grafana-alerts/
```

> **Note:** [Kustomize](https://kubectl.docs.kubernetes.io/references/kustomize/) requires literal relative paths for components — variables and aliases are not supported.

```yaml
# k8s/apps/<service>/overlays/prod/kustomization.yaml
components:
  - ../../../../components/doppler-secret
  - ../../../../components/otlp-collector
  - ../../../../components/hpa-production
  - ../../../../components/pdb-standard
  - ../../../../components/grafana-dashboards
  - ../../../../components/grafana-alerts
```

## 10. Standards Compliance

- [ ] Add `.dk-standards.yaml` to repo root:
  ```yaml
  product: <product-name>
  team: <team-name>
  tiers: [1, 2, 3]
  grace_period_until: "<date>"  # Optional: warn-only until this date
  ```
- [ ] Add standards check workflow:
  ```yaml
  jobs:
    standards:
      uses: data-kinetic/.github/.github/workflows/standards-check.yaml@main
      with:
        tiers: '1,2,3'
  ```
- [ ] Verify all Tier 1 checks pass (manifest validation, labels, probes, resource limits)
- [ ] Verify Tier 2 checks pass (dashboard/alert existence and validity)

See [Standards Compliance](standards-compliance.md) for the full tier system.

## 11. PR Review Service

The automated [PR Review Service](pr-review-service.md) will review PRs targeting staging branches. No repo-level configuration needed — the webhook service forwards PR events to the critic automatically for repos listed in `CRITIC_ENABLED_REPOS`.

## 12. Production Hardening

- [ ] Rolling update strategy (maxSurge 1, maxUnavailable 0)
- [ ] Pod anti-affinity (spread across nodes)
- [ ] PodDisruptionBudgets
- [ ] HorizontalPodAutoscaler (include HPA Kustomize component)
- [ ] Resource requests and limits set
- [ ] Database migrations as [ArgoCD](https://argo-cd.readthedocs.io/) PreSync hooks (if applicable)

## 13. Documentation

- [ ] Update [Platform Overview](platform-overview.md) — add to product portfolio table
- [ ] Update dk-alchemy README if needed
- [ ] Add product-specific runbook if the product has unique operational concerns

## Validation

After completing all steps, verify:

- [ ] Template init completed successfully (`init.sh` ran without errors, placeholders replaced)
- [ ] ArgoCD shows the product's Applications as synced and healthy
- [ ] Pushing to `staging` triggers build → image push → webhook notification → webhook service commits kustomize update → ArgoCD sync → deployment
- [ ] Health endpoints respond correctly
- [ ] Telemetry appears in [Grafana](https://grafana.com/docs/grafana/latest/) (logs in [Loki](https://grafana.com/docs/loki/latest/), metrics in [Mimir](https://grafana.com/docs/mimir/latest/), traces in [Tempo](https://grafana.com/docs/tempo/latest/))
- [ ] Dashboards and alerts are visible in Grafana
- [ ] Slack alerts fire for test conditions
- [ ] PostHog events appear (if applicable)
- [ ] Issue governance labels and workflows function

## Related Documentation

- [Template Repository](template-repo.md) — GitHub template repo for scaffolding new product repos
- [GitOps & CD](gitops-and-cd.md) — ArgoCD pattern details
- [CI/CD Pipelines](ci-cd-pipelines.md) — build workflow details
- [Self-Hosted Runners & Webhook Service](self-hosted-runners-and-webhooks.md) — runner classes and webhook integration
- [Standards Compliance](standards-compliance.md) — CI/CD standards enforcement
- [PR Review Service](pr-review-service.md) — automated PR review
- [Observability](observability.md) — LGTM stack connection
- [Application Instrumentation](application-instrumentation.md) — [OTel](https://opentelemetry.io/docs/) SDK setup
- [Product Analytics](product-analytics.md) — PostHog integration
- [Secrets Management](secrets-management.md) — Doppler setup
- [Issue Governance](issue-governance.md) — governance scripts
