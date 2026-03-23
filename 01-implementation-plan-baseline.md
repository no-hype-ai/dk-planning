# Implementation Plan Baseline

Master execution plan across all workstreams. Synthesized from 25 plans across 3 domains: [dk-alchemy](plans/dk-alchemy/), [dk-clusters](plans/dk-clusters/), [dk-template](plans/dk-template/).

## Workstream Summary

| Workstream | Repo | Plans | Focus |
|-----------|------|-------|-------|
| [dk-clusters](plans/dk-clusters/) | [data-kinetic/dk-clusters](https://github.com/data-kinetic/dk-clusters) | 6 | Proxmox hosts, K3s HA, storage, networking, DR |
| [dk-alchemy](plans/dk-alchemy/) | [data-kinetic/dk-alchemy](https://github.com/data-kinetic/dk-alchemy) | 10 | Platform API, observability, security, CI/CD, migrations |
| [dk-template](plans/dk-template/) | [data-kinetic/dk-template](https://github.com/data-kinetic/dk-template) | 6 | Repo scaffolding, CI/CD standards, dk-cli integration |

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
- [ ] Reflector Running, secrets propagated to app namespaces
- [ ] Grafana application dashboards show metrics from all namespaces
- [ ] `zpool list vmfast` < 85%
- [ ] `kubectl get nodes` shows 2 nodes Ready (k3s-master-1 + k3s-slave-1)

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
| 1.5 | HA cluster (workload distribution, anti-affinity, CNPG standby) | [dk-clusters/02](plans/dk-clusters/02-ha-and-resilience.md) | Large | Backup & DR (03) |
| 1.6 | Storage optimization (vmfast migration, capacity alerting) | [dk-clusters/05](plans/dk-clusters/05-storage-optimization.md) | Medium | Long-term storage health |

### Phase 1 Exit Criteria
- [ ] Platform API responds at dk.datakinetic.com/health
- [ ] `dk llm keys list` returns LiteLLM virtual keys
- [ ] SLO dashboards populated, burn-rate alerts configured
- [ ] Grafana OnCall routing by team label
- [ ] Shared build-deploy workflow used by dk-alchemy CI
- [ ] `npm install @datakinetic/observability` succeeds
- [ ] Production pods distributed across penguin and krang
- [ ] Grafana storage dashboard with capacity alerts

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

### 2B: Infrastructure DR (dk-clusters)

| # | Task | Plan | Effort | Requires |
|---|------|------|--------|----------|
| 2.6 | PostgreSQL backups, off-site replication, restore testing | [dk-clusters/03](plans/dk-clusters/03-backup-and-dr.md) | Large | 1.5 HA cluster done |
| 2.7 | Network & edge hardening (TLS lifecycle, VRRP monitoring) | [dk-clusters/04](plans/dk-clusters/04-network-and-edge.md) | Medium | Phase 0 done |

### 2C: Repository Template (dk-template)

| # | Task | Plan | Effort | Requires |
|---|------|------|--------|----------|
| 2.8 | Core scaffold + init.sh | [dk-template/01](plans/dk-template/01-core-scaffold.md) | Large | Phase 1 stable |
| 2.9 | CI/CD workflow templates | [dk-template/02](plans/dk-template/02-cicd-and-standards.md) | Small | 2.8 done |
| 2.10 | Observability templates (dashboard, alerts) | [dk-template/03](plans/dk-template/03-observability.md) | Medium | 2.8 done |
| 2.11 | Local dev + preview docker-compose | [dk-template/04](plans/dk-template/04-local-dev-and-preview.md) | Small | 2.8 done |
| 2.12 | dk-alchemy PR content generation | [dk-template/05](plans/dk-template/05-dk-alchemy-pr-gen.md) | Small | 2.8 done |

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

---

## Phase 3 — Product Onboarding & Migrations (Weeks 13–16)

**Goal:** Migrate deprecated repos, onboard new products, ship dk-cli v1.0.

| # | Task | Plan | Effort | Requires |
|---|------|------|--------|----------|
| 3.1 | dk-phantom → DK-OS migration (smallest, pilot) | [dk-alchemy/10](plans/dk-alchemy/10-migrations.md) | Medium | Phase 2 complete |
| 3.2 | dk-mercury → DK-OS migration | [dk-alchemy/10](plans/dk-alchemy/10-migrations.md) | Medium | 3.1 done |
| 3.3 | dk-data-fe → carbon-5 migration | [dk-alchemy/10](plans/dk-alchemy/10-migrations.md) | Large | Phase 2 complete |
| 3.4 | agent-mesh → lithium-5 migration (largest) | [dk-alchemy/10](plans/dk-alchemy/10-migrations.md) | Large | Phase 2 complete |
| 3.5 | `dk init` command in dk-cli | [dk-template/06](plans/dk-template/06-dk-cli-integration.md) | Medium | 2.8–2.12 done |
| 3.6 | VM lifecycle (naming, HA policies, template update) | [dk-clusters/06](plans/dk-clusters/06-vm-lifecycle.md) | Small | Independent |

### Phase 3 Exit Criteria
- [ ] ArgoCD shows no Applications for deprecated repos
- [ ] dk-phantom, dk-mercury, dk-data-fe, agent-mesh archived
- [ ] carbon-5, DK-OS, lithium-5 healthy in ArgoCD
- [ ] `dk init --product new-app --team eng --service api` creates production-ready repo
- [ ] All VMs documented with HA policies applied

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
                               │   │   │   │   │
PHASE 2 (Weeks 7-12)          │   │   │   │   │
  dk-alchemy/03 Security ◄────┘───┘   │   │   │
  dk-alchemy/05 Sentry ◄──────────────┘   │   │
  dk-alchemy/07 Secrets ◄─────────────────┘   │
  dk-alchemy/08 Previews ◄────────────────────┘
  dk-alchemy/09 Governance ◄───────────────────┘
  dk-clusters/03 Backup & DR ◄─┘
  dk-clusters/04 Network ────────(independent)
  dk-template/01-05 Scaffold ────(requires Phase 1 stable)
                               │
PHASE 3 (Weeks 13-16)         │
  dk-alchemy/10 Migrations ◄──┘──(requires Phase 2 complete)
  dk-template/06 dk-cli ◄─────┘
  dk-clusters/06 VM Lifecycle ───(independent, low priority)
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
| vmfast fills completely before Phase 0 fix | Production K3s fails | Immediate snapshot cleanup + thin provisioning check |
| krang join blocked by network routing | No HA, single point of failure | Verify iptables forwarding rules before attempting join |
| Shared workflow adoption breaks existing CI | Product repo builds fail | Roll out to dk-alchemy first, then behavior-labs-ai with grace period |
| Platform API scope creep | Delays Phase 1 | Build LLM + webhook endpoints first, add previews + labels in Phase 2 |
| Sentry migration loses alert coverage | Errors go undetected | Phase 1 parallel run validates parity before SDK removal |
| Migration data loss | Service degradation | Full backup before each migration, staging validation, rollback plan |
| dk-template init.sh platform incompatibility | macOS vs Linux sed differences | Test on both platforms, use perl -i for portable in-place editing |
