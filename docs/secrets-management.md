# Secrets Management

## Overview

All secrets are managed via **Doppler** — no secrets are stored in Git. The Doppler Operator runs in-cluster and syncs secrets from Doppler SaaS into Kubernetes Secrets via `DopplerSecret` CRDs.

## Architecture

```
Doppler SaaS (source of truth)
  ├── Projects
  │   ├── behaviorlabs-applications (dev, stg, prd)
  │   ├── behaviorlabs-infrastructure (postgres, redis, minio, alloy)
  │   └── <product>-applications (per product repo)
  │
  └── Syncs via Doppler Operator ──→ Kubernetes Secrets
                                       ├── ArgoCD credentials
                                       ├── App secrets (per namespace)
                                       └── Infra secrets (per component)
```

## In-Cluster Components

| Component | Namespace | Purpose |
|-----------|-----------|---------|
| **Doppler Operator** | `doppler-operator-system` | Watches `DopplerSecret` CRDs, syncs to K8s Secrets |
| **DopplerSecret CRDs** (infra) | `infra` | Infrastructure secrets (DB, Redis, MinIO, Alloy) |
| **DopplerSecret CRDs** (apps) | per-namespace | Application secrets per product/environment |
| **ArgoCD Doppler secrets** | `argocd` | ArgoCD credentials, repo access tokens |

## Doppler Projects

| Project | Configs | Used By |
|---------|---------|---------|
| `behaviorlabs-applications` | `dev`, `stg`, `prd` | behavior-labs-ai (API, app, admin) |
| `behaviorlabs-infrastructure` | — | PostgreSQL, Redis, MinIO, Alloy |
| `dk-alchemy-runners` | `prd` | GitHub App credentials for ARC v2 self-hosted runners |
| `dk-alchemy-webhooks` | `prd` | Webhook service secrets: GitHub App, per-repo HMAC secrets, ArgoCD token, Slack URL, Grafana API key |

## Build-Time Secrets

Docker builds use Doppler CLI with `--mount=type=secret` (not baked into image layers):
- `DOPPLER_TOKEN` passed as a Docker build secret in GitHub Actions
- Doppler CLI installed in Dockerfiles, fetches secrets at build time

## Local Development

Helper scripts in product repos:
- `scripts/doppler/setup-doppler-dev.sh` — configure local Doppler CLI
- `scripts/doppler/create-kubernetes-tokens.sh` — generate K8s service tokens
- `scripts/doppler/generate-service-tokens.sh` — generate per-service tokens

## GitOps Integration

Each product repo includes `DopplerSecret` manifests in its ArgoCD app definitions:
- `.gitops/prod/apps/doppler-secrets.yaml` — production DopplerSecret Application
- `.gitops/staging/apps/doppler-secrets.yaml` — staging DopplerSecret Application
- `k8s/apps/doppler-secrets/` — DopplerSecret CRD manifests

## Gaps

- **No rotation schedule** — secrets are manually rotated ad-hoc
- **No expiry tracking** — no alerts for credentials nearing expiry
- **No audit trail in observability** — Doppler audit logs are not integrated with Loki
- **No automation for new projects** — setting up a new Doppler project is manual

## Recommendations

### 1. Secret Rotation Schedules

Define rotation cadences by secret type:

| Secret Type | Rotation Cadence | Method |
|-------------|------------------|--------|
| Database credentials | 90 days | Doppler scheduled rotation |
| API keys (external) | 90 days | Manual with Doppler update |
| Service tokens | 180 days | Doppler token regeneration |
| TLS certificates | Auto (cert-manager) | Already automated |

### 2. Expiry Alerting

- Add Grafana alerts for secrets nearing rotation deadlines
- Integrate Doppler audit logs with Loki for compliance visibility
- Create a `secrets-health` dashboard in Grafana

### 3. Standardize Doppler Project Naming Convention

All Doppler projects follow a consistent naming scheme. Note: [`dk-template`](https://github.com/data-kinetic/dk-template) generates `scripts/doppler/setup-doppler-dev.sh` pre-configured with the correct project naming — see [Template Repository](template-repo.md).

| Pattern | Used For | Example |
|---------|----------|---------|
| `<product>-applications` | Product repo application secrets | `behaviorlabs-applications`, `carbon5-applications` |
| `dk-alchemy-<service>` | Platform services in dk-alchemy | `dk-alchemy-runners`, `dk-alchemy-webhooks` |
| `<product>-infrastructure` | Product-specific infra (if needed) | `behaviorlabs-infrastructure` |

Each project has standard configs:
```
<product>-applications
  ├── dev   — local development
  ├── stg   — staging environment
  └── prd   — production environment

dk-alchemy-<service>
  └── prd   — production only (platform services)

<product>-infrastructure  (if product has dedicated infra)
  └── prd
```

**Naming rules:**
- Product names use lowercase with hyphens (e.g., `carbon-5`, `dk-os`)
- Platform service projects always prefixed with `dk-alchemy-`
- Never use underscores in project names

### 4. Least-Privilege Token Scoping

- Ensure Doppler service tokens are scoped to specific configs (not project-wide)
- ArgoCD credentials should use read-only tokens where possible
- Audit current token scopes

## Related Documentation

- [Infrastructure](infrastructure.md) — Doppler Operator deployment
- [GitOps & CD](gitops-and-cd.md) — how DopplerSecret CRDs fit in the app-of-apps pattern
- [Security & Compliance](security-and-compliance.md) — broader security posture
- [Template Repository](template-repo.md) — generates Doppler setup scripts following naming conventions
- [CI/CD Pipelines](ci-cd-pipelines.md) — build-time secret injection
