# Plan 01: Platform Alignment Audit

## Goal

Produce a verified, file-by-file gap analysis of dk-data-fe against dk-template patterns and the onboarding checklist (docs/onboarding.md), then create GitHub issues for the work items in Plans 02-04.

## Current State

dk-data-fe is production-deployed with significant platform integration but pre-dates the dk-template standardization. No formal audit has been performed against the 13-section onboarding checklist.

| Onboarding Section | Status | Evidence |
|---|---|---|
| 1. Repository Scaffold | **Partial** | `.gitops/` + `k8s/` exist but use flat structure (not `k8s/apps/<service>/`) |
| 2. dk-alchemy Integration | **Done** | AppProject + external bootstrap in dk-alchemy |
| 3. CI/CD Pipeline | **Strong** | 4 workflows: ci, build-push, post-deploy-verify, promote-to-prod |
| 4. Secrets | **Done** | DopplerSecret for dk-data-secrets, ghcr-credentials, minio-backup-credentials |
| 5. Observability | **Strong** | ServiceMonitor, PodMonitor, Probe (blackbox), OTel tracing, structlog |
| 6. Health Checks | **Done** | PostgREST `/health` with startup/liveness/readiness probes, job-trigger `/health` |
| 7. Product Analytics | **N/A** | Not user-facing, PostHog not needed |
| 8. Issue Governance | **Missing** | No governance label taxonomy |
| 9. Kustomize Components | **Missing** | Not using dk-alchemy shared components (hpa, pdb, etc.) |
| 10. Standards Compliance | **Missing** | No `.dk-standards.yaml`, no `standards.yaml` workflow |
| 11. PR Review Service | **Done** | Org-level service |
| 12. Production Hardening | **Gaps** | No rolling update strategy, PDBs, anti-affinity, or securityContext |
| 13. Documentation | **Partial** | CLAUDE.md exists; not in dk-planning product portfolio docs |

## Gap Inventory

| # | Gap | Severity | Target Plan | Files Affected |
|---|-----|----------|-------------|----------------|
| G1 | No `dk-managed` GitHub topic | P0 | 01 | GitHub repo settings |
| G2 | No `.dk-standards.yaml` | P1 | 02 | New file at repo root |
| G3 | No `standards.yaml` CI workflow | P1 | 02 | `.github/workflows/standards.yaml` |
| G4 | No issue governance labels | P1 | 02 | GitHub label configuration |
| G5 | No rolling update strategy on Deployments | P0 | 03 | `k8s/base/postgrest/deployment.yaml`, `k8s/base/ingestion/job-trigger-deployment.yaml` |
| G6 | No PodDisruptionBudgets | P0 | 03 | 2 new PDB manifests |
| G7 | No pod anti-affinity | P0 | 03 | Both Deployment specs |
| G8 | No securityContext on pods/containers | P0 | 03 | All pod specs |
| G9 | No resource limits on CronJob containers | P1 | 03 | 20+ CronJob manifests in `k8s/base/ingestion/` |
| G10 | No `monitoring/` directory | P1 | 04 | New directory structure |
| G11 | No Grafana dashboards as code | P1 | 04 | New JSON files |
| G12 | Alert rules missing `product`/`service` labels | P1 | 04 | `k8s/base/alert-rules.yaml` |
| G13 | Backup CronJobs reference MinIO (migrating to SeaweedFS) | P2 | 03 | `k8s/base/backup/` |
| G14 | `runs-on: ubuntu-latest` (not self-hosted ARC v2) | P2 | 02 | `.github/workflows/*.yaml` |

## Implementation Steps

### Step 1: Add dk-managed Topic

```bash
gh repo edit data-kinetic/dk-data-fe --add-topic dk-managed
```

### Step 2: Verify dk-alchemy Bootstrap

Confirm these files exist in dk-alchemy:
- `.gitops/external/dk-data-fe-prod.yaml` (or equivalent external app)
- `.gitops/external/dk-data-fe-staging.yaml`
- AppProject definition for dk-data namespace

```bash
# From dk-alchemy repo
ls .gitops/external/ | grep dk-data
```

### Step 3: Verify ArgoCD Application Status

```bash
# Requires kubectl access to K3s cluster
kubectl get applications -n argocd | grep dk-data
argocd app get dk-data-prod --grpc-web 2>/dev/null || echo "Check ArgoCD UI"
argocd app get dk-data-staging --grpc-web 2>/dev/null || echo "Check ArgoCD UI"
```

### Step 4: Audit Rendered Manifests

```bash
cd /Users/nick/Code/dk-data-fe
kubectl kustomize k8s/overlays/prod 2>/dev/null | grep -c 'kind:'
# Verify: strategy, securityContext, resources on all containers
```

### Step 5: Audit GitHub Labels

```bash
gh label list --repo data-kinetic/dk-data-fe --limit 100
# Expected: status/triage, status/in-progress, priority/P0-P4, team/data-platform
```

### Step 6: Create Issues for Plans 02-04

Create GitHub issues in dk-data-fe for each gap, labeled with `platform-alignment`:

```bash
# Standards & Governance (Plan 02)
gh issue create --repo data-kinetic/dk-data-fe \
  --title "Add .dk-standards.yaml and standards CI workflow" \
  --label "platform-alignment" \
  --body "Closes gaps G2, G3. See plans/dk-data-fe/02-standards-and-governance.md in dk-planning."

# Issue Governance (Plan 02)
gh issue create --repo data-kinetic/dk-data-fe \
  --title "Add issue governance label taxonomy" \
  --label "platform-alignment" \
  --body "Closes gap G4. See plans/dk-data-fe/02-standards-and-governance.md in dk-planning."

# Production Hardening (Plan 03)
gh issue create --repo data-kinetic/dk-data-fe \
  --title "Production hardening: PDBs, anti-affinity, security contexts, rolling updates" \
  --label "platform-alignment" \
  --body "Closes gaps G5-G9. See plans/dk-data-fe/03-production-hardening.md in dk-planning."

# Monitoring (Plan 04)
gh issue create --repo data-kinetic/dk-data-fe \
  --title "Add monitoring/ directory with Grafana dashboards and standardize alert labels" \
  --label "platform-alignment" \
  --body "Closes gaps G10-G12. See plans/dk-data-fe/04-monitoring-consolidation.md in dk-planning."
```

## Verification

- [ ] `dk-managed` topic visible on [dk-data-fe repo page](https://github.com/data-kinetic/dk-data-fe)
- [ ] dk-alchemy bootstrap files confirmed for dk-data-fe
- [ ] ArgoCD applications healthy (Synced, Healthy)
- [ ] Gap inventory verified against live cluster state
- [ ] GitHub issues created for Plans 02, 03, 04

## Dependencies

None — this is the entry point for all dk-data-fe platform alignment work.
