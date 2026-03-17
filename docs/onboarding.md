# Onboarding

## Overview

This document is the checklist for adding a new product repo to the Data Kinetic platform. It covers GitOps integration, CI/CD, observability, analytics, secrets, and issue governance.

Repos pending onboarding: dk-compliance-v2, DK-OS, carbon-5, lithium-5.

## Prerequisites

- [ ] Repository exists in the `data-kinetic` GitHub org (or cross-org credentials configured for `data-kinetic-projects`)
- [ ] Doppler project created with `dev`, `stg`, `prd` configs
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

<!-- TODO: Create a GitHub template repo that generates this structure -->

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
  - Docker build with Doppler secrets injection
  - GHCR push with standard tagging (`staging-<sha7>`, `<version>`, `main-<sha7>`)
  - Kustomize overlay update for staging
  - SBOM and provenance attestation
- [ ] Configure `dorny/paths-filter` for smart change detection per service
- [ ] Add kubeconform and kustomize-validate CI checks for `k8s/` manifests
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
- [ ] Set up feature flags in PostHog with matching flag keys in code

## 8. Issue Governance

- [ ] Add issue governance workflows (use shared workflow when available)
- [ ] Configure label taxonomy matching governance scripts:
  - Status labels: `status/triage`, `status/in-progress`, `status/in-review`, `status/done`, `status/blocked`
  - Priority labels: `priority/P0` through `priority/P4`
  - Team labels: `team/<product-team>`
- [ ] Define SLO targets for the product
- [ ] Add SLO dashboard to `monitoring/dashboards/<service>-slo.json`

## 9. Production Hardening

- [ ] Rolling update strategy (maxSurge 1, maxUnavailable 0)
- [ ] Pod anti-affinity (spread across nodes)
- [ ] PodDisruptionBudgets
- [ ] HorizontalPodAutoscaler (include HPA Kustomize component)
- [ ] Resource requests and limits set
- [ ] Database migrations as ArgoCD PreSync hooks (if applicable)

## 10. Documentation

- [ ] Update [Platform Overview](platform-overview.md) — add to product portfolio table
- [ ] Update dk-alchemy README if needed
- [ ] Add product-specific runbook if the product has unique operational concerns

## Validation

After completing all steps, verify:

- [ ] ArgoCD shows the product's Applications as synced and healthy
- [ ] Pushing to `staging` triggers build → image push → kustomize update → ArgoCD sync → deployment
- [ ] Health endpoints respond correctly
- [ ] Telemetry appears in Grafana (logs in Loki, metrics in Mimir, traces in Tempo)
- [ ] Dashboards and alerts are visible in Grafana
- [ ] Slack alerts fire for test conditions
- [ ] PostHog events appear (if applicable)
- [ ] Issue governance labels and workflows function

## Related Documentation

- [GitOps & CD](gitops-and-cd.md) — ArgoCD pattern details
- [CI/CD Pipelines](ci-cd-pipelines.md) — build workflow details
- [Observability](observability.md) — LGTM stack connection
- [Application Instrumentation](application-instrumentation.md) — OTel SDK setup
- [Product Analytics](product-analytics.md) — PostHog integration
- [Secrets Management](secrets-management.md) — Doppler setup
- [Issue Governance](issue-governance.md) — governance scripts
