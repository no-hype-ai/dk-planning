# ArgoCD Onboarding Scaffolds for Migration Targets

## Context
Migration issues for dk-phantom, dk-mercury, dk-data-fe, and agent-mesh are blocked because
the target repos (DK-OS, carbon-5, lithium-5) lack the `.gitops/`, `k8s/`, and `monitoring/`
directories required for ArgoCD deployment. This document captures the scaffolding generated
by `dk-template init.sh` for each target repo.

## Status
- All three scaffolds generated successfully from dk-template (no placeholder errors)
- Scaffolds stored at `/tmp/{dk-os,carbon5,lithium5}-scaffold/` for review
- Issues #319-#322 referenced in migration plan were not found; may need to be created

## Important: Existing Workflows
All three target repos already have `.github/workflows/`. Do NOT overwrite:
- **DK-OS:** build-push.yml, promote.yml, staging-readiness.yml
- **carbon-5:** deploy.yml
- **lithium-5:** build-deploy.yml, promote.yml, staging-readiness.yml

The dk-template generates `build-deploy.yaml` and `standards.yaml` workflows. These should
be reviewed and merged with existing workflows, not dropped in wholesale. The CODEOWNERS
file should also be merged, not replaced.

---

## 1. DK-OS (data-kinetic/DK-OS)

**Migration target for:** dk-phantom, dk-mercury
**Product:** dk-os | **Team:** dk-engineering | **Repo:** DK-OS
**Services:** web, phantom, mercury-api
**Namespaces:** dk-os-prod, dk-os-staging

### Generated command
```bash
./scripts/init.sh --product dk-os --team dk-engineering --repo-name DK-OS \
  --service web --service phantom --service mercury-api
```

### Files to add to DK-OS repo
```
.gitops/
  dk-os-root-app-prod.yaml
  dk-os-root-app-staging.yaml
  local/apps/.env.example
  local/apps/docker-compose.yaml
  prod/apps/00-project.yaml
  prod/apps/doppler-secrets.yaml
  prod/apps/web.yaml
  prod/apps/phantom.yaml
  prod/apps/mercury-api.yaml
  staging/apps/00-project.yaml
  staging/apps/doppler-secrets.yaml
  staging/apps/web.yaml
  staging/apps/phantom.yaml
  staging/apps/mercury-api.yaml

k8s/apps/
  doppler-secrets/base/doppler-secret.yaml
  doppler-secrets/base/kustomization.yaml
  doppler-secrets/overlays/prod/kustomization.yaml
  doppler-secrets/overlays/staging/kustomization.yaml
  web/base/{deployment,kustomization,service}.yaml
  web/overlays/{prod,staging}/kustomization.yaml
  phantom/base/{deployment,kustomization,service}.yaml
  phantom/overlays/{prod,staging}/kustomization.yaml
  mercury-api/base/{deployment,kustomization,service}.yaml
  mercury-api/overlays/{prod,staging}/kustomization.yaml

monitoring/
  alerts/{web,phantom,mercury-api}.yaml
  dashboards/{web,phantom,mercury-api}-overview.json
```

### dk-alchemy PR files
```
.gitops/external/dk-os-prod.yaml
.gitops/external/dk-os-staging.yaml
.gitops/repositories/dk-os-bootstrap.yaml
contact-points-addition.yaml  (merge into grafana/provisioning/alerting/contact-points.yaml)
notification-policies-addition.yaml  (merge into grafana/provisioning/alerting/notification-policies.yaml)
```

### Post-scaffold customization needed
- Update container image refs in deployment.yaml (port, image path per service)
- phantom: likely port 3001 (NestJS), not 3000
- mercury-api: likely port 3002 (NestJS), not 3000
- web: Next.js app, confirm port 3000
- Configure Doppler project: dk-os-applications
- DK-OS already has `.github/workflows/` -- do NOT overwrite, merge CI steps if needed

---

## 2. carbon-5 (data-kinetic/carbon-5)

**Migration target for:** dk-data-fe
**Product:** carbon-5 | **Team:** data-platform | **Repo:** carbon-5
**Services:** api, worker
**Namespaces:** carbon-5-prod, carbon-5-staging

### Generated command
```bash
./scripts/init.sh --product carbon-5 --team data-platform --repo-name carbon-5 \
  --service api --service worker
```

### Files to add to carbon-5 repo
```
.gitops/
  carbon-5-root-app-prod.yaml
  carbon-5-root-app-staging.yaml
  local/apps/.env.example
  local/apps/docker-compose.yaml
  prod/apps/00-project.yaml
  prod/apps/doppler-secrets.yaml
  prod/apps/api.yaml
  prod/apps/worker.yaml
  staging/apps/00-project.yaml
  staging/apps/doppler-secrets.yaml
  staging/apps/api.yaml
  staging/apps/worker.yaml

k8s/apps/
  doppler-secrets/base/doppler-secret.yaml
  doppler-secrets/base/kustomization.yaml
  doppler-secrets/overlays/prod/kustomization.yaml
  doppler-secrets/overlays/staging/kustomization.yaml
  api/base/{deployment,kustomization,service}.yaml
  api/overlays/{prod,staging}/kustomization.yaml
  worker/base/{deployment,kustomization,service}.yaml
  worker/overlays/{prod,staging}/kustomization.yaml

monitoring/
  alerts/{api,worker}.yaml
  dashboards/{api,worker}-overview.json
```

### dk-alchemy PR files
```
.gitops/external/carbon-5-prod.yaml
.gitops/external/carbon-5-staging.yaml
.gitops/repositories/carbon-5-bootstrap.yaml
contact-points-addition.yaml
notification-policies-addition.yaml
```

### Post-scaffold customization needed
- api: FastAPI (Python), change port from 3000 to 8000, update health/ready paths
- worker: data pipeline process, may not need a Service (remove service.yaml), no HTTP port
- Container images: ghcr.io/data-kinetic/carbon-5/{api,worker}
- Configure Doppler project: carbon-5-applications

---

## 3. lithium-5 (data-kinetic/lithium-5)

**Migration target for:** agent-mesh
**Product:** lithium-5 | **Team:** dk-engineering | **Repo:** lithium-5
**Services:** api, worker-claude
**Namespaces:** lithium-5-prod, lithium-5-staging

### Generated command
```bash
./scripts/init.sh --product lithium-5 --team dk-engineering --repo-name lithium-5 \
  --service api --service worker-claude
```

### Files to add to lithium-5 repo
```
.gitops/
  lithium-5-root-app-prod.yaml
  lithium-5-root-app-staging.yaml
  local/apps/.env.example
  local/apps/docker-compose.yaml
  prod/apps/00-project.yaml
  prod/apps/doppler-secrets.yaml
  prod/apps/api.yaml
  prod/apps/worker-claude.yaml
  staging/apps/00-project.yaml
  staging/apps/doppler-secrets.yaml
  staging/apps/api.yaml
  staging/apps/worker-claude.yaml

k8s/apps/
  doppler-secrets/base/doppler-secret.yaml
  doppler-secrets/base/kustomization.yaml
  doppler-secrets/overlays/prod/kustomization.yaml
  doppler-secrets/overlays/staging/kustomization.yaml
  api/base/{deployment,kustomization,service}.yaml
  api/overlays/{prod,staging}/kustomization.yaml
  worker-claude/base/{deployment,kustomization,service}.yaml
  worker-claude/overlays/{prod,staging}/kustomization.yaml

monitoring/
  alerts/{api,worker-claude}.yaml
  dashboards/{api,worker-claude}-overview.json
```

### dk-alchemy PR files
```
.gitops/external/lithium-5-prod.yaml
.gitops/external/lithium-5-staging.yaml
.gitops/repositories/lithium-5-bootstrap.yaml
contact-points-addition.yaml
notification-policies-addition.yaml
```

### Post-scaffold customization needed
- api: NestJS from agent-mesh, port 3000 likely correct
- worker-claude: agent worker process, may not need HTTP service, review if service.yaml is needed
- Container images: ghcr.io/data-kinetic/lithium-5/{api,worker-claude}
- Configure Doppler project: lithium-5-applications

---

## dk-alchemy Bootstrap PRs (Combined)

Three separate PRs should be submitted to dk-alchemy to register each target repo:

### PR 1: DK-OS bootstrap
- `ADD .gitops/external/dk-os-prod.yaml`
- `ADD .gitops/external/dk-os-staging.yaml`
- `ADD .gitops/repositories/dk-os-bootstrap.yaml`
- `MODIFY .gitops/repositories/kustomization.yaml` (add dk-os-bootstrap.yaml)
- `MODIFY grafana/provisioning/alerting/contact-points.yaml` (add dk-os-slack)
- `MODIFY grafana/provisioning/alerting/notification-policies.yaml` (add dk-os route)

### PR 2: carbon-5 bootstrap
- `ADD .gitops/external/carbon-5-prod.yaml`
- `ADD .gitops/external/carbon-5-staging.yaml`
- `ADD .gitops/repositories/carbon-5-bootstrap.yaml`
- `MODIFY .gitops/repositories/kustomization.yaml` (add carbon-5-bootstrap.yaml)
- `MODIFY grafana/provisioning/alerting/contact-points.yaml` (add carbon-5-slack)
- `MODIFY grafana/provisioning/alerting/notification-policies.yaml` (add carbon-5 route)

### PR 3: lithium-5 bootstrap
- `ADD .gitops/external/lithium-5-prod.yaml`
- `ADD .gitops/external/lithium-5-staging.yaml`
- `ADD .gitops/repositories/lithium-5-bootstrap.yaml`
- `MODIFY .gitops/repositories/kustomization.yaml` (add lithium-5-bootstrap.yaml)
- `MODIFY grafana/provisioning/alerting/contact-points.yaml` (add lithium-5-slack)
- `MODIFY grafana/provisioning/alerting/notification-policies.yaml` (add lithium-5 route)

These can be combined into a single PR if preferred.

---

## Execution Order

1. Submit dk-alchemy bootstrap PR(s) -- can be done immediately
2. PR scaffold files into DK-OS -- unblocks dk-phantom and dk-mercury migrations
3. PR scaffold files into carbon-5 -- unblocks dk-data-fe migration
4. PR scaffold files into lithium-5 -- unblocks agent-mesh migration
5. Customize deployment.yaml files per service (ports, images, health checks)
6. Set up Doppler projects for each target repo
7. Verify ArgoCD picks up each repo after merge

## Scaffold Source Files

Generated scaffolds are stored at:
- `/tmp/dk-os-scaffold/` -- DK-OS (web, phantom, mercury-api)
- `/tmp/carbon5-scaffold/` -- carbon-5 (api, worker)
- `/tmp/lithium5-scaffold/` -- lithium-5 (api, worker-claude)

These were generated from `data-kinetic/dk-template` using `scripts/init.sh`.
