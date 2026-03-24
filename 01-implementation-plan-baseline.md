# Implementation Plan Baseline

Master execution plan across all workstreams. Synthesized from 41 plans across 6 domains: [dk-alchemy](plans/dk-alchemy/), [dk-clusters](plans/dk-clusters/), [dk-template](plans/dk-template/), [behavior-labs-ai](plans/behavior-labs-ai/), [dk-os](plans/dk-os/).

## Workstream Summary

| Workstream | Repo | Plans | Focus |
|-----------|------|-------|-------|
| [dk-clusters](plans/dk-clusters/) | [data-kinetic/dk-clusters](https://github.com/data-kinetic/dk-clusters) | 7 | Proxmox hosts, K3s HA, storage, networking, DR, host monitoring |
| [dk-alchemy](plans/dk-alchemy/) | [data-kinetic/dk-alchemy](https://github.com/data-kinetic/dk-alchemy) | 14 | Platform API, observability, security, CI/CD, migrations, cost visibility |
| [dk-template](plans/dk-template/) | [data-kinetic/dk-template](https://github.com/data-kinetic/dk-template) | 7 | Repo scaffolding, CI/CD standards, dk-cli integration, enforcement gaps |
| [behavior-labs-ai](plans/behavior-labs-ai/) | [data-kinetic/behavior-labs-ai](https://github.com/data-kinetic/behavior-labs-ai) | 6 | Platform integration, testing, feature roadmap, AI infra, security |
| [dk-os](plans/dk-os/) | [data-kinetic/DK-OS](https://github.com/data-kinetic/DK-OS) | 7 | K8s migration, platform integration, agent mesh, testing, feature roadmap, security |

---

## Phase 0 — Stabilize Infrastructure (Weeks 1–2)

**Goal:** Resolve P0 blockers that threaten production stability. Nothing else should start until these are addressed.

| # | Task | Plan | Effort | Issue |
|---|------|------|--------|-------|
| 0.1 | Fix reflector CrashLoopBackOff | [dk-clusters/01](plans/dk-clusters/01-critical-fixes.md) | Small | #290 |
| 0.2 | Fix Alloy namespace scraping (infra-only → all namespaces) | [dk-clusters/01](plans/dk-clusters/01-critical-fixes.md) | Small | #295 |
| 0.3 | Address vmfast storage (92.3% → < 85%) | [dk-clusters/01](plans/dk-clusters/01-critical-fixes.md) | Medium | — |
| 0.4 | Join k3s-slave-1 on krang to cluster | [dk-clusters/01](plans/dk-clusters/01-critical-fixes.md) | Medium | #292 |

**Parallel quick-start:** Begin [dk-alchemy/06 Shared Observability Package](plans/dk-alchemy/06-shared-observability-package.md) — small effort, no infrastructure dependency, unblocks Sentry migration later.

### Phase 0 Exit Criteria
- [x] Reflector Running, secrets propagated to app namespaces *(resolved Mar 2026)*
- [x] Grafana application dashboards show metrics from all namespaces *(Alloy scraping all namespaces)*
- [x] `zpool list vmfast` < 85% *(nvfast at 9%)*
- [x] `kubectl get nodes` shows 2 nodes Ready (k3s-master-1 + k3s-slave-1) *(joined, zone labels applied)*

---

## Phase 1 — Foundation (Weeks 3–6)

**Goal:** Build the base layer that everything else depends on. Four dk-alchemy initiatives run in parallel with two dk-clusters initiatives.

### 1A: Platform Foundation (dk-alchemy) — Parallel

| # | Task | Plan | Effort | Unblocks |
|---|------|------|--------|----------|
| 1.1 | Platform API (FastAPI at dk.datakinetic.com) | [dk-alchemy/01](plans/dk-alchemy/01-platform-api.md) | Large | Previews (08), Governance (09), dk-cli server commands |
| 1.2 | SLO definitions + Grafana OnCall + incident lifecycle | [dk-alchemy/02](plans/dk-alchemy/02-slo-and-incident-management.md) | Large | Secrets lifecycle (07), alert-to-issue bridge |
| 1.3 | Shared CI workflows + standards enforcement | [dk-alchemy/04](plans/dk-alchemy/04-cicd-modernization.md) | Large | Security hardening (03), all product repo CI |
| 1.4 | Extract @datakinetic/observability package | [dk-alchemy/06](plans/dk-alchemy/06-shared-observability-package.md) | Small | Sentry migration (05), standards Tier 4 |

### 1B: Infrastructure Resilience (dk-clusters) — Parallel with 1A

| # | Task | Plan | Effort | Unblocks |
|---|------|------|--------|----------|
| 1.5 | HA cluster (workload distribution, anti-affinity, CNPG standby) | [dk-clusters/02](plans/dk-clusters/02-ha-and-resilience.md) | Large | **Partial** — pods redistributed 55/45, CNPG standby pending. Backup & DR (03) |
| 1.6 | Storage optimization (vmfast migration, capacity alerting) | [dk-clusters/05](plans/dk-clusters/05-storage-optimization.md) | Medium | **Largely complete** — nvfast at 9%, PVC placement verified. Capacity dashboard pending. |
| 1.7 | Proxmox host & GPU monitoring (node_exporter, pve-exporter, DCGM) | [dk-clusters/07](plans/dk-clusters/07-proxmox-monitoring.md) | Medium | VM right-sizing (06), cost dashboards (dk-alchemy/13) |

### Phase 1 Exit Criteria
- [ ] Platform API responds at dk.datakinetic.com/health
- [ ] `dk llm keys list` returns LiteLLM virtual keys
- [ ] SLO dashboards populated, burn-rate alerts configured
- [ ] Grafana OnCall routing by team label
- [ ] Shared build-deploy workflow used by dk-alchemy CI
- [ ] `npm install @datakinetic/observability` succeeds
- [x] Production pods distributed across penguin and krang *(55%/45% after rolling restarts, Mar 2026)*
- [ ] Grafana storage dashboard with capacity alerts
- [x] Proxmox host metrics visible in Grafana (CPU, RAM, disk, ZFS for penguin + krang) *(node_exporter + pve-exporter deployed, Mar 2026)*
- [x] GPU utilization dashboard shows 8x A100 metrics from krang *(DCGM exporter in vllm-minimax VM, Mar 2026)*

---

## Phase 2 — Core Platform (Weeks 7–12)

**Goal:** Security, observability maturity, developer tooling, and DR. Enables product repo onboarding.

### 2A: Security & Observability (dk-alchemy)

| # | Task | Plan | Effort | Requires |
|---|------|------|--------|----------|
| 2.1 | Kyverno admission controller (audit → staging → prod) | [dk-alchemy/03](plans/dk-alchemy/03-security-hardening.md) | Medium | 1.3 CI/CD done |
| 2.2 | Sentry → Grafana migration (Phase 1–2: parallel run, remove SDK) | [dk-alchemy/05](plans/dk-alchemy/05-sentry-migration.md) | Medium | 1.4 Observability package done |
| 2.3 | Secrets rotation schedules + expiry alerting | [dk-alchemy/07](plans/dk-alchemy/07-secrets-lifecycle.md) | Small | 1.2 SLO/incident done |
| 2.4 | Preview standardization (dk preview commands) | [dk-alchemy/08](plans/dk-alchemy/08-preview-standardization.md) | Medium | 1.1 Platform API done |
| 2.5 | Issue governance extraction (org-wide workflows) | [dk-alchemy/09](plans/dk-alchemy/09-governance-extraction.md) | Medium | 1.1 Platform API done |
| 2.6a | Cost & utilization dashboards (LLM, K8s, GPU) | [dk-alchemy/13](plans/dk-alchemy/13-cost-and-utilization.md) | Small | Phases 1-2: None. Phase 3: 1.7 Proxmox monitoring |

### 2B: Infrastructure DR & Storage Migration (dk-clusters / dk-alchemy)

| # | Task | Plan | Effort | Requires |
|---|------|------|--------|----------|
| 2.6 | PostgreSQL backups, off-site replication, restore testing | [dk-clusters/03](plans/dk-clusters/03-backup-and-dr.md) | Large | 1.5 HA cluster done |
| 2.6a | **Migrate MinIO → SeaweedFS** (object storage) | [dk-planning#9](https://github.com/data-kinetic/dk-planning/issues/9), [dk-alchemy#365](https://github.com/data-kinetic/dk-alchemy/issues/365) | Medium | Independent — blocks 2.6 off-site replication |
| 2.7 | Network & edge hardening (TLS lifecycle, VRRP monitoring) | [dk-clusters/04](plans/dk-clusters/04-network-and-edge.md) | Medium | Phase 0 done |

### 2C: Repository Template (dk-template)

| # | Task | Plan | Effort | Requires |
|---|------|------|--------|----------|
| 2.8 | Core scaffold + init.sh | [dk-template/01](plans/dk-template/01-core-scaffold.md) | Large | Phase 1 stable |
| 2.9 | CI/CD workflow templates | [dk-template/02](plans/dk-template/02-cicd-and-standards.md) | Small | 2.8 done |
| 2.10 | Observability templates (dashboard, alerts) | [dk-template/03](plans/dk-template/03-observability.md) | Medium | 2.8 done |
| 2.11 | Local dev + preview docker-compose | [dk-template/04](plans/dk-template/04-local-dev-and-preview.md) | Small | 2.8 done |
| 2.12 | dk-alchemy PR content generation | [dk-template/05](plans/dk-template/05-dk-alchemy-pr-gen.md) | Small | 2.8 done |

### 2D: Product Repo Integration (behavior-labs-ai)

| # | Task | Plan | Effort | Requires |
|---|------|------|--------|----------|
| 2.13 | Sentry SDK removal + OTel-only error tracking | [behavior-labs-ai/01](plans/behavior-labs-ai/01-platform-integration.md) | Medium | 2.2 Sentry migration Phase 1 done |
| 2.14 | Shared observability package adoption | [behavior-labs-ai/01](plans/behavior-labs-ai/01-platform-integration.md) | Small | 1.4 Observability package published |
| 2.15 | Shared CI workflow migration + Renovate | [behavior-labs-ai/01](plans/behavior-labs-ai/01-platform-integration.md) | Medium | 1.3 CI/CD shared workflows done |
| 2.16 | Infrastructure modernization (NetworkPolicy, resource tuning) | [behavior-labs-ai/02](plans/behavior-labs-ai/02-infrastructure-modernization.md) | Medium | 2.1 Kyverno, 2.6a cost dashboards |
| 2.17 | Testing & quality gates | [behavior-labs-ai/03](plans/behavior-labs-ai/03-testing-and-quality.md) | Medium | Independent |
| 2.18 | AI & LLM infrastructure (LightRAG, model tracking) | [behavior-labs-ai/05](plans/behavior-labs-ai/05-lightrag-and-ai-infrastructure.md) | Medium | Independent |

### 2E: DK-OS Onboarding

| # | Task | Plan | Effort | Requires |
|---|------|------|--------|----------|
| 2.19 | DK-OS K8s/ArgoCD migration (Docker Compose → K3s) | [dk-os/01](plans/dk-os/01-k8s-migration.md) | Large | dk-template scaffold, dk-alchemy bootstrap |
| 2.20 | DK-OS platform integration (Sentry, observability, CI) | [dk-os/02](plans/dk-os/02-platform-integration.md) | Medium | dk-alchemy/04, /05, /06 |
| 2.21 | DK-OS infrastructure service migration | [dk-os/03](plans/dk-os/03-infrastructure-services.md) | Medium | 2.19 done |
| 2.22 | dk-template enforcement gap closure | [dk-template/07](plans/dk-template/07-enforcement-gaps.md) | Medium | Independent |

### Phase 2 Exit Criteria
- [ ] Kyverno enforcing on staging, audit on production
- [ ] Sentry SDK removed from behavior-labs-ai, alerts in Grafana only
- [ ] Secret expiry alerts firing in Grafana
- [ ] `dk preview up` creates working preview at *.preview.behaviorlabs.ai
- [ ] Governance workflows running from data-kinetic/.github
- [ ] Weekly PostgreSQL restore test passing
- [ ] Off-site backups < 4 hours old in S3
- [ ] `./scripts/init.sh --product test --team test --service api` generates complete scaffold
- [ ] dk-template generates valid dk-alchemy PR content
- [ ] LLM cost dashboard shows per-app spend and cache efficiency
- [ ] K8s resource efficiency dashboard identifies overprovisioned pods
- [ ] Sentry SDK removed from behavior-labs-ai, `@datakinetic/observability` adopted
- [ ] behavior-labs-ai CI running on shared workflows + ARC v2 runners
- [ ] behavior-labs-ai test coverage gates enforced in CI
- [ ] DK-OS Node.js apps running on K3s with ArgoCD (not Docker Compose on Megatron)
- [ ] dk-template generates security-hardened manifests (securityContext, rolling update)

---

## Phase 3 — Product Onboarding & Migrations (Weeks 13–16)

**Goal:** Migrate deprecated repos, onboard new products, ship dk-cli v1.0.

| # | Task | Plan | Effort | Requires |
|---|------|------|--------|----------|
| 3.1 | dk-phantom → DK-OS migration (smallest, pilot) | [dk-alchemy/10](plans/dk-alchemy/10-migrations.md) | Medium | Phase 2 complete |
| 3.2 | dk-mercury → DK-OS migration | [dk-alchemy/10](plans/dk-alchemy/10-migrations.md) | Medium | 3.1 done |
| 3.3 | dk-data-fe → carbon-5 migration | [dk-alchemy/10](plans/dk-alchemy/10-migrations.md) | Large | Phase 2 complete |
| 3.4 | agent-mesh → DK-OS migration (largest) | [dk-alchemy/10](plans/dk-alchemy/10-migrations.md) | Large | Phase 2 complete |
| 3.5 | `dk init` command in dk-cli | [dk-template/06](plans/dk-template/06-dk-cli-integration.md) | Medium | 2.8–2.12 done |
| 3.6 | VM lifecycle (naming, HA policies, template update) | [dk-clusters/06](plans/dk-clusters/06-vm-lifecycle.md) | Small | Independent |
| 3.7 | behavior-labs-ai security & compliance hardening | [behavior-labs-ai/06](plans/behavior-labs-ai/06-security-and-compliance.md) | Medium | 2.1 Kyverno enforce, dk-compliance-v2 |
| 3.8 | DK-OS agent-mesh K8s deployment | [dk-os/04](plans/dk-os/04-agent-mesh.md) | Medium | 2.19 K8s migration done |
| 3.9 | DK-OS security & compliance hardening | [dk-os/07](plans/dk-os/07-security-and-compliance.md) | Medium | dk-alchemy/03, dk-compliance-v2 |
| 3.10 | DK-OS testing & quality gates | [dk-os/05](plans/dk-os/05-testing-and-quality.md) | Medium | Independent |

### Phase 3 Exit Criteria
- [ ] ArgoCD shows no Applications for deprecated repos
- [ ] dk-phantom, dk-mercury, dk-data-fe, agent-mesh archived
- [ ] carbon-5, DK-OS healthy in ArgoCD
- [ ] `dk init --product new-app --team eng --service api` creates production-ready repo
- [ ] All VMs documented with HA policies applied
- [ ] DK-OS agent-mesh running on K8s (no Docker socket mount)
- [ ] DK-OS multi-tenant isolation tests passing
- [ ] Megatron VM decommissioned or repurposed

---

## Phase 4 — Future (Months 5+)

Lower-priority items from individual plans, to be scheduled as capacity allows:

| Task | Plan | Priority |
|------|------|----------|
| ARC v2 GPU runners on krang | [dk-alchemy/04](plans/dk-alchemy/04-cicd-modernization.md) | Medium |
| Sentry migration Phase 3 (Pyroscope, Faro, source maps) | [dk-alchemy/05](plans/dk-alchemy/05-sentry-migration.md) | Low |
| Per-PR K8s preview environments (ApplicationSet) | [dk-alchemy/08](plans/dk-alchemy/08-preview-standardization.md) | Medium |
| Argo Rollouts (progressive delivery) | [docs/gitops-and-cd.md](docs/gitops-and-cd.md) | Low |
| Multi-cluster HA (scarecrow third node, Ceph) | [dk-clusters/02](plans/dk-clusters/02-ha-and-resilience.md) | Medium |
| Grafana Faro (frontend RUM) | [docs/application-instrumentation.md](docs/application-instrumentation.md) | Low |
| Doc-gap scanner automation | [dk-alchemy/09](plans/dk-alchemy/09-governance-extraction.md) | Medium |
| Renovate for automated dependency updates | [dk-alchemy/04](plans/dk-alchemy/04-cicd-modernization.md) | Medium |
| Proxmox IaC (Terraform/Ansible for VM provisioning) | — | Low (revisit when VM count > 15 or third host added) |
| Product analytics standardization (`@datakinetic/analytics`) | — | Low (revisit after carbon-5/DK-OS onboarded) |

---

## Dependency Graph

```
PHASE 0 (Weeks 1-2)
  dk-clusters/01 Critical Fixes ─────────────────────────────────────┐
  dk-alchemy/06 Observability Package (parallel quick-start) ──┐     │
                                                                │     │
PHASE 1 (Weeks 3-6)                                            │     │
  dk-alchemy/01 Platform API ──────────────────┐               │     │
  dk-alchemy/02 SLO & Incident ────────────┐   │               │     │
  dk-alchemy/04 CI/CD Modernization ───┐   │   │               │     │
  dk-alchemy/06 Observability Pkg ─────┤   │   │               │     │
  dk-clusters/02 HA & Resilience ──┐   │   │   │  ◄────────────┘─────┘
  dk-clusters/05 Storage Opt ──┐   │   │   │   │
  dk-clusters/07 Proxmox Mon ─┤   │   │   │   │  ◄────────────┘
                               │   │   │   │   │
PHASE 2 (Weeks 7-12)          │   │   │   │   │
  dk-alchemy/03 Security ◄────┘───┘   │   │   │
  dk-alchemy/05 Sentry ◄──────────────┘   │   │
  dk-alchemy/07 Secrets ◄─────────────────┘   │
  dk-alchemy/08 Previews ◄────────────────────┘
  dk-alchemy/09 Governance ◄───────────────────┘
  dk-alchemy/13 Cost (Phases 1-2) ──(independent, uses existing metrics)
  dk-clusters/03 Backup & DR ◄─┘
  dk-clusters/04 Network ────────(independent)
  dk-alchemy/13 Cost Phase 3 ◄──── dk-clusters/07 (GPU + VM metrics)
  behavior-labs-ai/01 Platform Integration ◄── dk-alchemy/04, /05, /06
  behavior-labs-ai/02 Infra Modernization ◄── dk-alchemy/02, /03, /13
  behavior-labs-ai/03 Testing & Quality ────(independent, can start now)
  behavior-labs-ai/05 AI Infrastructure ────(independent, can start now)
  dk-os/01 K8s Migration ◄── dk-template scaffold + dk-alchemy bootstrap
  dk-os/02 Platform Integration ◄── dk-alchemy/04, /05, /06
  dk-os/03 Infrastructure ◄── dk-os/01 (migration decisions)
  dk-template/07 Enforcement Gaps ────(independent, can start now)
  dk-template/01-05 Scaffold ────(requires Phase 1 stable)
                               │
PHASE 3 (Weeks 13-16)         │
  dk-alchemy/10 Migrations ◄──┘──(requires Phase 2 complete)
  dk-template/06 dk-cli ◄─────┘
  dk-clusters/06 VM Lifecycle ───(independent, low priority)
  behavior-labs-ai/06 Security ◄── dk-alchemy/03, dk-compliance-v2
  behavior-labs-ai/04 Feature Roadmap ──(ongoing, product-driven)
  dk-os/04 Agent Mesh ◄── dk-os/01 (K8s first)
  dk-os/07 Security ◄── dk-alchemy/03, dk-compliance-v2
  dk-os/05 Testing ────(independent, can start now)
  dk-os/06 Feature Roadmap ──(ongoing, product-driven)
```

---

## Synchronization Points

| Week | Checkpoint | Validation |
|------|-----------|------------|
| 2 | Phase 0 complete | 2-node cluster, reflector + Alloy fixed, vmfast < 85% |
| 6 | Phase 1 complete | Platform API live, SLOs defined, CI standards enforced, observability package published |
| 9 | Phase 2 midpoint | Kyverno on staging, Sentry removed, template scaffold working |
| 12 | Phase 2 complete | All security + DR + template ready, green light for migrations |
| 14 | Migration midpoint | dk-phantom + dk-mercury migrated to DK-OS |
| 16 | Phase 3 complete | All migrations done, dk-cli v1.0, platform fully operational |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| ~~vmfast fills completely before Phase 0 fix~~ | ~~Production K3s fails~~ | **MITIGATED** — nvfast at 9% after quota enforcement + cleanup |
| ~~krang join blocked by network routing~~ | ~~No HA, single point of failure~~ | **MITIGATED** — k3s-slave-1 joined, 2 nodes Ready, zone labels applied |
| Shared workflow adoption breaks existing CI | Product repo builds fail | Roll out to dk-alchemy first, then behavior-labs-ai with grace period |
| Platform API scope creep | Delays Phase 1 | Build LLM + webhook endpoints first, add previews + labels in Phase 2 |
| Sentry migration loses alert coverage | Errors go undetected | Phase 1 parallel run validates parity before SDK removal |
| Migration data loss | Service degradation | Full backup before each migration, staging validation, rollback plan |
| dk-template init.sh platform incompatibility | macOS vs Linux sed differences | Test on both platforms, use perl -i for portable in-place editing |
| Proxmox host failure undetected | Production cluster down, no advance warning | dk-clusters/07 monitoring with host, VM, and GPU alerts |
| GPU fleet idle cost untracked | 8x A100s burning power with no utilization visibility | dk-alchemy/13 cost dashboard + GPU idle alerts from dk-clusters/07 |
| MinIO in maintenance mode (Dec 2025) | No security patches, increasing ecosystem drift | Migrate to SeaweedFS in Phase 2 ([dk-planning#9](https://github.com/data-kinetic/dk-planning/issues/9)) |
