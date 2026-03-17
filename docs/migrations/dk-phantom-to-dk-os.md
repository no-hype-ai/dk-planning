# Migration: dk-phantom → DK-OS

## Summary

| | |
|---|---|
| **Source** | [data-kinetic/dk-phantom](https://github.com/data-kinetic/dk-phantom) |
| **Target** | [data-kinetic-projects/DK-OS](https://github.com/data-kinetic-projects/DK-OS) |
| **Complexity** | Medium |
| **Suggested order** | 1 of 4 (first — smallest surface area, most self-contained) |

## What dk-phantom Is

An **AI Synthetic User Testing Platform** that auto-discovers API endpoints, frontend pages, WebSocket events, background job queues, and multi-step service flows in target applications, then runs automated test suites using AI-driven analysis and persona-based evaluation. It also performs OWASP-aligned security audits.

Two applications:
- **Phantom CLI/Server** — TypeScript CLI (Commander.js) + Fastify dashboard API
- **Phantom Web Dashboard** — Next.js 15 + React 19 visualization frontend

## What Moves

### Applications

| Component | Tech | Port | Destination in DK-OS |
|-----------|------|------|---------------------|
| **CLI/Server** | TypeScript, Fastify | 9090 | New `apps/phantom/` or `services/phantom/` |
| **Web Dashboard** | Next.js 15 | 3000 | New routes in `apps/app/` or separate `apps/phantom-web/` |

### Core Modules

| Module | Purpose | DK-OS Fit |
|--------|---------|-----------|
| `core/discovery/` | Auto-discovers Express, NestJS, Next.js, FastAPI, OpenAPI, Prisma, BullMQ, WebSocket endpoints | Quality assurance tool for DK-OS products |
| `core/runner/` | Test execution: endpoint matrix, scenario runner, flow runner, checkpoints, throttle | Test automation module |
| `core/assertions/` | AI, schema, and standard assertion engines | Test validation |
| `core/auth/` | Clerk ticket-strategy auth (headless Playwright JWT minting) | DK-OS already uses Clerk |
| `core/llm/` | OpenAI SDK wrapper → dk-litellm proxy | DK-OS already uses LiteLLM |
| `core/personas/` | Persona-based evaluation (busy-executive, power-user, etc.) | Test personas module |
| `core/reporter/` | JSON, Markdown, email (Resend), coverage, drift, security reports | Test reporting module |
| `core/security/` | Full OWASP audit suite (injection, CORS, headers, crypto, SSRF, etc.) | Security audit module |
| `adapters/` | HTTP, browser (Playwright), WebSocket, storage (local + S3) | Test adapters |
| `skills/` | Reusable test skills: API CRUD, auth, browser nav, data seed/cleanup, polling | Test skill library |
| `metrics/` | Prometheus metrics (`prom-client`) + OpenTelemetry tracing | Merge with DK-OS observability |

### Scenarios & Personas

- `scenarios/` — YAML scenario templates (CRUD, wizard, file-upload, etc.)
- `personas/` — YAML persona definitions
- `targets/` — Target configurations (currently behavior-labs-ai, localhost)

These are configuration — move as-is.

### Feature Specs

2 feature specifications (`specs/001-phantom-platform`, `specs/002-security-audit`) with plans, contracts, and data models.

## Data Stores

### PostgreSQL 16 + pgvector

**7 tables** via Prisma ORM:

| Table | Purpose |
|-------|---------|
| `Target` | Test target configurations |
| `Run` | Test run metadata and status |
| `EndpointTestResult` | Per-endpoint test results |
| `ScenarioResult` | Scenario execution results |
| `ScenarioStepResult` | Per-step scenario results |
| `CoverageSnapshot` | API coverage tracking over time |
| `SecurityAuditRun` | Security audit execution results |

This is the **smallest schema** of all four migrations — straightforward to merge.

**Migration approach:**
- DK-OS uses Prisma — same ORM
- **Recommended:** Merge into DK-OS Prisma schema with `phantom_` prefix on tables

### Redis 7

- Used in "cluster mode" configuration
- DK-OS already runs Redis — merge, namespace to avoid collision

### S3 / MinIO

- Report storage (`@aws-sdk/client-s3`, `forcePathStyle`)
- DK-OS uses SeaweedFS — remap bucket config

## External Service Dependencies

| Service | Current Config | Migration Action |
|---------|---------------|-----------------|
| **Clerk** | `discrete-firefly-25` — ticket-strategy JWT minting via headless Playwright | DK-OS already uses Clerk — merge auth config |
| **dk-litellm** | LLM proxy at `192.168.10.50:4000/v1` | DK-OS already uses LiteLLM — same endpoint |
| **Resend** | Email delivery for security audit reports (`phantom@datakinetic.dev`) | Add Resend config to DK-OS Doppler |
| **Doppler** | Project: `dk-phantom` | Merge secrets into DK-OS project |
| **GHCR** | `ghcr.io/data-kinetic/dk-phantom` | New image path under DK-OS |
| **Slack** | Webhook for nightly regression failure | Merge into DK-OS Slack config |
| **Playwright/Chromium** | Required in Docker image for browser testing + Clerk auth | DK-OS containers will need Playwright |

## Special Considerations

### Playwright / Chromium Dependency

Phantom requires Playwright with Chromium installed in its Docker image for:
- Browser-based frontend testing
- Headless Clerk JWT minting (ticket-strategy auth)

This is a **significant image size addition** (~400MB). Options:
- **Separate container:** Keep phantom as its own Docker image with Playwright, alongside DK-OS services
- **Merged image:** Add Playwright to DK-OS's base image (increases all image sizes)
- **Recommended:** Separate container. Phantom is a testing tool — it doesn't need to run in the same process as DK-OS's product management app.

### Nightly CronJob

K8s CronJob `phantom-nightly` runs `phantom run --target staging` at 3 AM UTC daily.

**Migration:** Convert to either:
- Docker Compose + `cron` sidecar
- GitHub Actions scheduled workflow (already exists: `phantom-nightly.yaml`)
- **Recommended:** Keep as GitHub Actions scheduled workflow — it already works, runs on self-hosted runner

### Target Configurations

Phantom tests are configured per-target in `targets/` directory:
- Currently targets `behavior-labs-ai` (staging)
- After DK-OS migration, add DK-OS itself as a target
- Can target any DK product — this is a platform-wide testing tool

## Deployment Shift

### Current (K8s/ArgoCD)

- Deployment: `phantom-dashboard` (1 replica, port 9090)
- CronJob: `phantom-nightly` (3 AM UTC)
- Ingress: Traefik IngressRoute, `phantom.behaviorlabs.ai`
- Secrets: Doppler Operator (DopplerSecret CRDs)
- OTLP: Optional export to `alloy.infra.svc.cluster.local:4317`
- Prometheus metrics at `/metrics`

### Target (K8s / ArgoCD — following behavior-labs-ai patterns)

- Phantom services added to DK-OS's Kustomize manifests (`k8s/apps/phantom/base/` + overlays)
- DK-OS's ArgoCD Application manifests (`.gitops/<env>/apps/`) include phantom Deployments
- dk-alchemy bootstrap entry updated for DK-OS (already includes phantom)
- Secrets: Doppler Operator (DopplerSecret CRDs) — same as current, merged into DK-OS Doppler project
- Ingress: Traefik IngressRoute + cert-manager TLS
- Observability: OTLP via Alloy Kustomize component (same in-cluster pattern as current)

### DNS

| Domain | Action |
|--------|--------|
| `phantom.behaviorlabs.ai` | Update edge IngressRoute to point at DK-OS namespace, or move to new subdomain |

## Integration Opportunities

DK-OS as a business OS benefits from built-in quality assurance:

| Phantom Capability | DK-OS Integration Point |
|--------------------|------------------------|
| API auto-discovery | Test DK-OS's own API on every deploy |
| Security audits | Built-in OWASP scanning for DK-OS and all DK products |
| Coverage tracking | Dashboard widget in DK-OS showing test coverage trends |
| Persona evaluation | Use DK-OS's customer personas for synthetic user testing |
| Regression detection | Drift reports on DK-OS API changes |
| Nightly reports | Surface in DK-OS dashboard |

## CI/CD Workflows to Migrate

| Workflow | Action |
|----------|--------|
| `ci.yaml` | Merge into DK-OS's build pipeline |
| `docker-build-push.yaml` | Add phantom to DK-OS's build matrix |
| `phantom-nightly.yaml` | Keep as-is (runs on self-hosted runner, targets staging) |
| `phantom-post-deploy.yaml` | Trigger from DK-OS's deploy workflow |
| `phantom-pr-smoke.yaml` | Add to DK-OS's PR pipeline |

## Gaps & Risks

| Gap | Risk | Mitigation |
|-----|------|------------|
| **Playwright image size** | ~400MB Chromium adds to container size | Keep as separate Docker image |
| **LiteLLM IP dependency** | Hardcoded `192.168.10.50:4000` | Use DNS name or env var (DK-OS LiteLLM is already on Megatron) |
| **Clerk ticket-strategy** | Headless Playwright Clerk auth is fragile | Test thoroughly; may need Clerk API token auth as fallback |
| **15+ secrets** | Doppler project migration | Audit and merge into DK-OS project |
| **Target management** | Currently YAML files in `targets/` | Consider making targets configurable via DK-OS admin UI |
| **Legacy Python API** | None — TypeScript only | Clean migration |

## Migration Steps

```
Phase 1: Preparation
  □ Audit dk-phantom Prisma schema — map 7 tables to DK-OS models
  □ Audit Doppler secrets (15+ in dk-phantom project)
  □ Decide: domain routing (phantom.behaviorlabs.ai vs phantom.dev.datakinetic.com)
  □ Decide: separate Docker image or merged
  □ Test Playwright/Chromium in DK-OS's Docker Compose environment

Phase 2: Database Migration
  □ Add phantom tables to DK-OS Prisma schema (phantom_ prefix)
  □ Run Prisma migrations on Megatron PostgreSQL
  □ Migrate existing run/result data (if historical data matters)

Phase 3: Service Migration
  □ Add phantom-server service to DK-OS docker-compose.yml (with Playwright)
  □ Add phantom-web service to DK-OS docker-compose.yml
  □ Configure Doppler secrets in DK-OS project
  □ Configure Nginx Proxy Manager routes
  □ Wire S3 storage to SeaweedFS
  □ Wire LiteLLM to DK-OS's instance
  □ Wire Resend for email reports

Phase 4: Test Automation
  □ Update phantom-nightly.yaml to target DK-OS staging
  □ Add phantom-post-deploy hook to DK-OS deploy workflow
  □ Add DK-OS as a target in targets/ directory
  □ Verify nightly regression runs successfully

Phase 5: Validation
  □ Run phantom against behavior-labs-ai staging (existing target)
  □ Run phantom against DK-OS staging (new target)
  □ Verify security audit runs and email reports deliver
  □ Verify web dashboard shows runs, trends, coverage
  □ Verify Prometheus metrics export
  □ Verify Playwright browser tests work in Docker Compose

Phase 6: Cutover
  □ Update DNS
  □ Remove dk-phantom bootstrap from dk-alchemy
  □ Remove dk-phantom namespaces from K3s
  □ Update dk-alchemy probe-service targets
  □ Archive dk-phantom repo
```

## Related

- [Migration Overview](README.md)
- [dk-mercury → DK-OS](dk-mercury-to-dk-os.md) — the other DK-OS migration
