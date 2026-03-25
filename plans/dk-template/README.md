# dk-template Implementation Plans

## Overview

[`dk-template`](https://github.com/data-kinetic/dk-template) is the GitHub template repository for scaffolding new Data Kinetic product repos. When a developer runs `dk init` or clicks "Use this template", they get a complete, production-ready project structure with GitOps, Kubernetes manifests, CI/CD, monitoring, local development, and dk-alchemy integration — all pre-configured.

## Status

Plans 01-06 (structural scaffold) are complete. Plan 07 (enforcement gaps) addresses security, implementation code, CI/CD integration, and multi-language support gaps identified by auditing the template against `docs/onboarding.md` and real product repos.

## Plans

| # | Plan | Status | Purpose |
|---|------|--------|---------|
| 01 | [Core Scaffold](01-core-scaffold.md) | Complete | init.sh, GitOps manifests, K8s deployment/service |
| 02 | [CI/CD & Standards](02-cicd-and-standards.md) | Complete | GitHub Actions workflows, .dk-standards.yaml, renovate.json |
| 03 | [Observability](03-observability.md) | Complete | Grafana dashboards, alert rules, OTel instrumentation |
| 04 | [Local Dev & Preview](04-local-dev-and-preview.md) | Complete | docker-compose (local + preview), Doppler setup |
| 05 | [dk-alchemy PR Gen](05-dk-alchemy-pr-gen.md) | Complete | Bootstrap YAML, contact points, notification policies |
| 06 | [dk-cli Integration](06-dk-cli-integration.md) | Complete | `dk init` reference implementation |
| 07 | [Enforcement Gaps](07-enforcement-gaps.md) | Not Started | Security hardening, health code, OTel code, CI/CD integration, multi-language |

## Execution Order

```
01-core-scaffold (foundation — must be first)
  ├── 02-cicd-and-standards (adds to scaffold)
  ├── 03-observability (adds to scaffold)
  ├── 04-local-dev-and-preview (adds to scaffold)
  └── 05-dk-alchemy-pr-gen (adds to scaffold)
        └── 06-dk-cli-integration (wraps everything)
```

Plans 02-05 can be executed in parallel after Plan 01. Plan 06 requires all others complete.

## Recent Additions

- **Claude Code skills** added to `.claude/commands/`:
  - `/dk-preview` — Preview environment management
  - `/dk-api` — Platform API interaction
  - `/dk-standards` — Standards compliance checks
  - `/dk-onboard` — Interactive onboarding checklist

## Generated File Inventory

After `./scripts/init.sh --product carbon-5 --team data-platform --service api`:

```
carbon-5/
├── .github/
│   ├── workflows/
│   │   ├── build-deploy.yaml
│   │   └── standards.yaml
│   └── CODEOWNERS
├── .gitops/
│   ├── carbon-5-root-app-prod.yaml
│   ├── carbon-5-root-app-staging.yaml
│   ├── prod/apps/
│   │   ├── 00-project.yaml
│   │   ├── api.yaml
│   │   └── doppler-secrets.yaml
│   ├── staging/apps/
│   │   ├── 00-project.yaml
│   │   ├── api.yaml
│   │   └── doppler-secrets.yaml
│   └── local/apps/
│       ├── docker-compose.yaml
│       └── .env.example
├── k8s/
│   ├── apps/api/
│   │   ├── base/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   └── kustomization.yaml
│   │   └── overlays/
│   │       ├── prod/kustomization.yaml
│   │       └── staging/kustomization.yaml
│   └── apps/doppler-secrets/
│       ├── base/
│       │   ├── doppler-secret.yaml
│       │   └── kustomization.yaml
│       └── overlays/
│           ├── prod/kustomization.yaml
│           └── staging/kustomization.yaml
├── monitoring/
│   ├── dashboards/
│   │   └── api-overview.json
│   └── alerts/
│       └── api.yaml
├── src/
│   └── instrumentation.ts
├── _dk-alchemy-pr/
│   ├── README.md
│   ├── .gitops/external/
│   │   ├── carbon-5-prod.yaml
│   │   └── carbon-5-staging.yaml
│   ├── .gitops/repositories/
│   │   └── carbon-5-bootstrap.yaml
│   ├── contact-points-addition.yaml
│   └── notification-policies-addition.yaml
├── .claude/commands/
│   ├── dk-preview.md
│   ├── dk-api.md
│   ├── dk-standards.md
│   └── dk-onboard.md
├── docker-compose.preview.yaml
├── scripts/doppler/
│   └── setup-doppler-dev.sh
├── .dk-standards.yaml
├── .gitignore
├── renovate.json
└── README.md
```

## Post-Init Manual Steps

After scaffolding, teams complete these steps (or use `dk onboard`):

1. [ ] Create Doppler project (`<product>-applications`) with `dev`, `stg`, `prd` configs
2. [ ] Create Slack channel (`#<product>-alerts`)
3. [ ] Submit dk-alchemy PR using `_dk-alchemy-pr/` content
4. [ ] Request webhook secret (`DK_WEBHOOK_SECRET`) from platform team
5. [ ] Configure branch protection on `main` and `staging`
6. [ ] Add `@datakinetic/observability` package (when available)
7. [ ] Implement health endpoints (`/health`, `/ready`)
8. [ ] Set up PostHog (if user-facing)
9. [ ] Configure issue governance labels
10. [ ] Production hardening review

See [Onboarding Checklist](../../docs/onboarding.md) for the complete guide.

## Dependencies

- [dk-alchemy plans](../dk-alchemy/) — Kustomize components, shared workflows, Platform API
- [dk-cli PRD](../dk-alchemy/12-dk-cli-prd.md) — CLI that consumes the template
- [dk-preview-stack](../dk-preview-stack/) — Preview environment infrastructure

## Related Documentation

- [Template Repository](../../docs/template-repo.md) — specification for dk-template
- [Onboarding](../../docs/onboarding.md) — full onboarding checklist
- [dk-cli](../../docs/dk-cli.md) — `dk init` command
- [GitOps & CD](../../docs/gitops-and-cd.md) — Product Repo GitOps Convention
- [Standards Compliance](../../docs/standards-compliance.md) — what `.dk-standards.yaml` enforces
- [dk-alchemy Plans](../dk-alchemy/) — infrastructure changes needed to support templates
