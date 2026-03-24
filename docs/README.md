# Data Kinetic Platform Documentation

Operational documentation for the Data Kinetic platform — a self-hosted [Kubernetes](https://kubernetes.io/docs/) environment running on bare-metal Proxmox hosts, using GitOps-driven continuous delivery via [ArgoCD](https://argo-cd.readthedocs.io/).

## Platform at a Glance

**Infrastructure:** Two Proxmox hosts (penguin, krang with 8x A100 GPUs) running [K3s](https://docs.k3s.io/) clusters + 2 edge LB nodes ([Traefik](https://doc.traefik.io/traefik/) + Keepalived VIP failover).

**Deployment model:** ArgoCD app-of-apps pattern. [dk-alchemy](https://github.com/data-kinetic/dk-alchemy) is the platform mono-repo that owns all shared infrastructure, the ArgoCD control plane, and the bootstrap for every product repo. Product repos own their own application manifests and deploy via GitOps.

**Observability:** Self-hosted LGTM stack ([Loki](https://grafana.com/docs/loki/latest/), [Grafana](https://grafana.com/docs/grafana/latest/), [Tempo](https://grafana.com/docs/tempo/latest/), [Mimir](https://grafana.com/docs/mimir/latest/)) with [Grafana Alloy](https://grafana.com/docs/alloy/latest/) as the unified collector. Product repos connect via an OTLP [Kustomize](https://kubectl.docs.kubernetes.io/references/kustomize/) component.

**Secrets:** [Doppler](https://docs.doppler.com/) Operator syncs secrets from Doppler SaaS into Kubernetes — no secrets in Git.

**Analytics:** [PostHog](https://posthog.com/docs) for product analytics and feature flags (retained). [Sentry](https://docs.sentry.io/) for error tracking (to be migrated to the Grafana stack).

## Key Repositories

### Active Platform (post-consolidation)

| Repository | Role | Status |
|------------|------|--------|
| [dk-alchemy](https://github.com/data-kinetic/dk-alchemy) | Platform mono-repo — infra, CD, observability | Production (K8s/ArgoCD) |
| [behavior-labs-ai](https://github.com/data-kinetic/behavior-labs-ai) | Pharma SaaS — reference product repo | Production (K8s/ArgoCD) |
| [carbon-5](https://github.com/data-kinetic/carbon-5) | Data pipeline + AI workflow platform | Early — onboarding to K8s/ArgoCD. Absorbing agent-mesh + dk-data-fe |
| [DK-OS](https://github.com/data-kinetic-projects/DK-OS) | Business operating system | Early — onboarding to K8s/ArgoCD. Absorbing dk-mercury + dk-phantom |
| [dk-compliance-v2](https://github.com/data-kinetic/dk-compliance-v2) | Compliance management platform | Pending onboarding |
| [dk-clusters](https://github.com/data-kinetic/dk-clusters) | Proxmox cluster management — host configs, VM lifecycle, storage, networking, DR for penguin + krang | New |
| [dk-template](https://github.com/data-kinetic/dk-template) | GitHub template for scaffolding new product repos | New (empty, planned) |

### Being Deprecated (services migrating out)

| Repository | Destination | Migration Doc |
|------------|-------------|---------------|
| [agent-mesh](https://github.com/data-kinetic/agent-mesh) | DK-OS | [Migration plan](migrations/agent-mesh-to-dk-os.md) |
| [dk-data-fe](https://github.com/data-kinetic/dk-data-fe) | carbon-5 | [Migration plan](migrations/dk-data-to-carbon-5.md) |
| [dk-mercury](https://github.com/data-kinetic/dk-mercury) | DK-OS | [Migration plan](migrations/dk-mercury-to-dk-os.md) |
| [dk-phantom](https://github.com/data-kinetic/dk-phantom) | DK-OS | [Migration plan](migrations/dk-phantom-to-dk-os.md) |

## Documentation Index

### Core Architecture

| Document | Scope |
|----------|-------|
| [Platform Overview](platform-overview.md) | Top-level architecture, physical hosts, network topology, product portfolio, GitHub org structure |
| [GitOps & Continuous Delivery](gitops-and-cd.md) | ArgoCD 3-tier app-of-apps pattern, ApplicationSets, image promotion strategy, preview environments, progressive delivery |
| [Infrastructure](infrastructure.md) | K3s clusters, data stores (PostgreSQL/Redis/SeaweedFS/OpenSearch), networking, edge LBs, storage classes, staging isolation, full component inventory |
| [CI/CD Pipelines](ci-cd-pipelines.md) | [GitHub Actions](https://docs.github.com/en/actions) workflows, build-deploy pattern, image tagging, supply chain security, shared workflow library (planned) |

### Observability & Operations

| Document | Scope |
|----------|-------|
| [Observability](observability.md) | LGTM stack architecture, Alloy collection pipeline, 26 dashboards, 26 alert rules, Slack routing, probe-service + sentinel-probe synthetic monitoring, self-service monitoring pattern for product repos, target architecture |
| [Application Instrumentation](application-instrumentation.md) | [OpenTelemetry](https://opentelemetry.io/docs/) SDK (`@repo/observability`), custom span attributes (LLM, pipeline, storage), Sentry overlap analysis + 3-phase migration plan, health check standard, shared `@datakinetic/observability` package target |
| [Product Analytics](product-analytics.md) | PostHog integration, 35+ tracked events, feature flag definitions, event naming conventions, PostHog vs. Grafana boundary, best practices |
| [Incident Management](incident-management.md) | On-call escalation (Grafana OnCall), SLO targets + burn-rate alerting, incident lifecycle, error-to-issue pipeline, ArgoCD deployment notifications, postmortem process |
| [Issue Governance](issue-governance.md) | GitHub issue automation (5 enforcement scripts, 6 weekly reports), status label state machine, regression closure gates, risk prioritization, shared extraction plan |

### Security & Reliability

| Document | Scope |
|----------|-------|
| [Secrets Management](secrets-management.md) | Doppler operator architecture, project structure, build-time secrets, rotation schedules (planned), expiry alerting (planned) |
| [Security & Compliance](security-and-compliance.md) | ArgoCD AppProject RBAC, namespace isolation, image security, policy enforcement gaps ([Kyverno](https://kyverno.io/docs/)/Gatekeeper), supply chain gaps, audit log centralization |
| [Compliance & Attestation](compliance-and-attestation/) | Compliance program overview — SOC 2, HIPAA, ISO 27001 (BehaviorLabs.ai) + NIST 800-171, CMMC L2 (Data Kinetic). CISO Assistant platform, phase plan, ownership matrix. Cross-references [`dk-compliance-v2`](https://github.com/data-kinetic/dk-compliance-v2). |
| [Disaster Recovery](disaster-recovery.md) | Recovery bootstrap order, data store backup strategy, RTO/RPO targets (TBD), multi-cluster readiness, DR test schedule |

### Migrations

| Document | Scope |
|----------|-------|
| [Migration Overview](migrations/README.md) | Repo consolidation strategy, target state diagram, migration ordering, cross-cutting concerns (dk-alchemy cleanup, domain remapping, deployment model shift, database consolidation) |
| [agent-mesh → DK-OS](migrations/agent-mesh-to-dk-os.md) | Agent orchestration, MCP gateway, 25+ tables, SDK → merges into DK-OS agent-mesh |
| [dk-data-fe → carbon-5](migrations/dk-data-to-carbon-5.md) | Data pipeline (Python), 25+ sources, SQLMesh, PostgREST → absorbed into carbon-5's Prefect dataflow system |
| [dk-mercury → DK-OS](migrations/dk-mercury-to-dk-os.md) | Org intelligence, NeMo STT, knowledge graph, connectors — [NestJS](https://docs.nestjs.com/) into DK-OS [Docker](https://docs.docker.com/) Compose |
| [dk-phantom → DK-OS](migrations/dk-phantom-to-dk-os.md) | Synthetic testing, security audit, [Playwright](https://playwright.dev/docs/intro) — smallest migration, recommended first |

### CI/CD & Deployment

| Document | Scope |
|----------|-------|
| [Self-Hosted Runners & Webhook Service](self-hosted-runners-and-webhooks.md) | ARC v2 runners on K3s (penguin/krang), webhook-driven kustomize updates, runner classes, migration path, PR event forwarding |
| [Standards Compliance](standards-compliance.md) | Tiered CI/CD standards enforcement: manifest validation, observability, CI/CD, code patterns. Shared definitions consumed by CI checks and PR reviewer. |
| [PR Review Service](pr-review-service.md) | Automated PR review on DK-OS agent-mesh (krang GPUs): security, observability, standards, and code quality rubrics. [OpenHands](https://docs.all-hands.dev/) SDK integration, review thresholds. |

### Getting Started

| Document | Scope |
|----------|-------|
| [dk-cli](dk-cli.md) | `@datakinetic/cli` — unified CLI (`dk init`, `dk up`, `dk check`, `dk llm`, `dk preview`, etc.) for scaffolding, local dev, secrets, observability, standards, LLM keys, and previews |
| [Platform API](platform-api.md) | dk-alchemy Platform API (FastAPI) — unified control plane for LLM key management, preview orchestration, webhooks, and label governance. Server-side counterpart to dk-cli. |
| [LiteLLM](litellm.md) | LLM proxy service — unified gateway for all product repos to access language models. Virtual keys with per-app budgets, rate limits, and model restrictions. |
| [Preview Environments](preview-environments.md) | VM-based preview stack (docker-compose on VM101) — branch previews at `*.preview.behaviorlabs.ai`. Being standardized via dk-cli + Platform API. |
| [Template Repository](template-repo.md) | GitHub template repo (`dk-template`) for scaffolding new product repos — generates `.gitops/`, `k8s/`, `monitoring/`, CI workflows, and dk-alchemy PR content |
| [Onboarding](onboarding.md) | Full checklist for adding a new product repo: scaffold, dk-alchemy PR, CI/CD, secrets, observability, health checks, analytics, issue governance, standards compliance, production hardening |

## Key Decisions

| Decision | Details | Document |
|----------|---------|----------|
| ArgoCD app-of-apps | 3-tier pattern: bootstrap → ApplicationSets → external app bootstraps | [GitOps & CD](gitops-and-cd.md) |
| dk-alchemy as platform mono-repo | Owns all shared infra, observability, and CD bootstraps | [Platform Overview](platform-overview.md) |
| Product repos own their manifests | `.gitops/` and `k8s/` directories per repo | [GitOps & CD](gitops-and-cd.md) |
| Self-hosted LGTM stack | Loki, Grafana, Tempo, Mimir in dk-alchemy | [Observability](observability.md) |
| Doppler for all secrets | Doppler Operator syncs to K8s, no secrets in Git | [Secrets Management](secrets-management.md) |
| [GHCR](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) for all images | Standard tagging convention per environment | [CI/CD Pipelines](ci-cd-pipelines.md) |
| PostHog for product analytics | Retained for user analytics and feature flags | [Product Analytics](product-analytics.md) |
| Sentry to be replaced | Migrate to Grafana stack (3-phase plan) | [App Instrumentation](application-instrumentation.md) |
| behavior-labs-ai as reference | Most mature repo, pattern for others to follow | [Onboarding](onboarding.md) |
| GitHub Template Repo for scaffolding | `dk-template` generates full repo structure, CI workflows, and dk-alchemy PR content | [Template Repository](template-repo.md) |
| Self-hosted runners (ARC v2) | Ephemeral pods on K3s, 3 runner classes (standard/large/gpu) | [Runners & Webhooks](self-hosted-runners-and-webhooks.md) |
| Webhook-driven deploys | Centralized webhook service replaces per-repo kustomize commits | [Runners & Webhooks](self-hosted-runners-and-webhooks.md) |
| Repo consolidation (6 → 3+1) | Deprecate agent-mesh, dk-data-fe, dk-mercury, dk-phantom — absorb into carbon-5 and DK-OS | [Migrations](migrations/README.md) |
| DK-OS agent-mesh as agent execution layer | Absorbs agent-mesh. Provides agent CRUD, LLM execution, MCP gateway, tool sandboxing + existing mail/orchestration/governance. Products consume via API. | [Migrations](migrations/README.md) |
| K8s/ArgoCD for all platforms | carbon-5, DK-OS onboard to K3s cluster following behavior-labs-ai patterns | [Migrations](migrations/README.md) |
| Tiered standards compliance | 4-tier system (manifests, observability, CI/CD, code patterns) with shared YAML definitions | [Standards Compliance](standards-compliance.md) |
| PR critic on DK-OS agent-mesh | Separate service on krang GPUs, not webhook-service extension. OpenHands SDK. | [PR Review Service](pr-review-service.md) |
| Kyverno for admission control | Phased rollout: audit → staging enforce → prod enforce | [Security & Compliance](security-and-compliance.md) |

## Tooling Roadmap

Current → target state for key concerns:

| Concern | Current | Target | Priority | Document |
|---------|---------|--------|----------|----------|
| agent-mesh → DK-OS | Separate repo on K8s | Agent execution in DK-OS agent-mesh | High | [Migration](migrations/agent-mesh-to-dk-os.md) |
| Automated PR review | Manual review only | PR critic on DK-OS agent-mesh (krang GPUs) | High | [PR Review Service](pr-review-service.md) |
| dk-cli | No CLI tooling | `@datakinetic/cli` — full lifecycle CLI (`dk init`, `dk up`, `dk check`, etc.) | High | [dk-cli](dk-cli.md) |
| dk-data-fe → carbon-5 | Separate repo on K8s | Python service in carbon-5 | High | [Migration](migrations/dk-data-to-carbon-5.md) |
| dk-mercury → DK-OS | Separate repo on K8s | DK-OS module on Megatron | High | [Migration](migrations/dk-mercury-to-dk-os.md) |
| dk-phantom → DK-OS | Separate repo on K8s | DK-OS module on Megatron | High | [Migration](migrations/dk-phantom-to-dk-os.md) |
| DR runbook | Tribal knowledge | Documented + tested | High | [Disaster Recovery](disaster-recovery.md) |
| Error tracking | Sentry + OTel (dual) | OTel → Loki only | High | [App Instrumentation](application-instrumentation.md) |
| Repo consolidation | 6+ single-purpose repos | 3 platforms | High | [Migrations](migrations/README.md) |
| Repo onboarding | Manual / ad-hoc | `dk-template` GitHub Template + onboarding checklist | High | [Template Repository](template-repo.md) |
| LLM management | Manual LiteLLM admin API | dk-cli + Platform API key management, budgets, cost tracking | High | [LiteLLM](litellm.md) |
| Platform API | No unified control plane | dk-alchemy Platform API (FastAPI) — LLM, previews, webhooks, labels | High | [Platform API](platform-api.md) |
| Preview environments (VM) | Ad-hoc docker-compose on VM101 | Standardized via dk-cli + Platform API | High | [Preview Environments](preview-environments.md) |
| Self-hosted runners | GitHub-hosted (2C/7GB) | ARC v2 on K3s (planned, not yet deployed) | Medium | [Runners & Webhooks](self-hosted-runners-and-webhooks.md) |
| Shared instrumentation | behavior-labs-ai only | `@datakinetic/observability` package | High | [App Instrumentation](application-instrumentation.md) |
| Standards compliance | Convention-only, no enforcement | Tiered CI checks + shared definitions | High | [Standards Compliance](standards-compliance.md) |
| Webhook-driven deploys | Per-repo CI kustomize commits | Platform API webhook handler | High | [Platform API](platform-api.md) |
| Deployment notifications | None | ArgoCD Notification Controller | Medium | [Incident Management](incident-management.md) |
| Doc gap tracking | Manual / ad-hoc | Automated scanner + GitHub issues | Medium | [Issue Governance](issue-governance.md) |
| Image promotion | Mixed (CI + Image Updater) | Unified per-env strategy | Medium | [GitOps & CD](gitops-and-cd.md) |
| On-call escalation | Slack-only | Grafana OnCall + escalation tiers | Medium | [Incident Management](incident-management.md) |
| Policy enforcement | Convention-only | Kyverno in-cluster | Medium | [Security & Compliance](security-and-compliance.md) |
| Preview environments (K8s) | Static IngressRoutes | Per-PR ephemeral via ApplicationSet | Medium | [GitOps & CD](gitops-and-cd.md) |
| Product dashboards | dk-alchemy only | Self-deployed via Kustomize components | Medium | [Observability](observability.md) |
| Shared CI workflows | Per-repo duplication | Reusable org-level workflows | Medium | [CI/CD Pipelines](ci-cd-pipelines.md) |
| SLOs | None | Mimir recording rules + Grafana SLO | Medium | [Incident Management](incident-management.md) |
| Traces | Sentry + Tempo (dual) | Tempo only | Medium | [App Instrumentation](application-instrumentation.md) |
| Event naming | Inconsistent | `<domain>.<action>` convention | Low | [Product Analytics](product-analytics.md) |
| Frontend RUM | Sentry Web Vitals | Grafana Faro | Low | [App Instrumentation](application-instrumentation.md) |
| GitHub org consolidation | DK-OS in separate org | Single `data-kinetic` org | Low | [Platform Overview](platform-overview.md) |
| Issue governance | behavior-labs-ai only | Shared org-level workflows | Low | [Issue Governance](issue-governance.md) |
| Profiling | Sentry Profiling | Grafana Pyroscope | Low | [App Instrumentation](application-instrumentation.md) |
| Progressive delivery | Vanilla Deployments | Argo Rollouts (canary/blue-green) | Low | [GitOps & CD](gitops-and-cd.md) |
| Session replay | Sentry Replay | PostHog Recordings | Low | [Product Analytics](product-analytics.md) |
