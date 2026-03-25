# Repository Consolidation Migrations

## Context
Single-purpose repos are being consolidated into DK-OS. Each migration moves services, databases, and GitOps config from a deprecated repo into its target. dk-alchemy needs cleanup after each migration (remove external app bootstraps, namespaces, DopplerSecrets). Note: dk-data-fe migration to carbon-5 has been cancelled — dk-data-fe is now a permanent first-class dk-managed product.

## ⚠️ SAFETY GATE — MANDATORY PRE-DELETION CHECKLIST

> **This plan includes DELETE operations on live `.gitops/external/` and `.gitops/repositories/` files.**
> These files control ArgoCD-managed production applications. Deleting them prematurely will cause
> ArgoCD to delete the running applications and their resources from the cluster.
>
> **Before ANY deletion of gitops bootstrap files, ALL of the following must be verified:**
>
> 1. [ ] All services verified running and healthy in the TARGET repo (not the deprecated one)
> 2. [ ] ArgoCD sync healthy on new applications in target repo — `Healthy/Synced` status
> 3. [ ] DNS/routes updated to point to new deployments (edge routes, IngressRoutes)
> 4. [ ] Monitoring dashboards updated to show data from new service names/namespaces
> 5. [ ] **48-hour burn-in period passed** after target services are running in production
> 6. [ ] Rollback plan documented and tested — can re-apply deleted gitops files within 5 minutes
> 7. [ ] Database migration verified — no data loss, queries returning expected results
> 8. [ ] No active incidents or ongoing deploys in either source or target repos
> 9. [ ] Doppler secrets verified serving correctly in target repo namespaces before removing deprecated DopplerSecret references
> 10. [ ] Deprecated repo CI/CD pipelines disabled (prevent race condition where a push re-triggers deploy during cutover)
>
> **Rollback procedure:** If deletion causes issues, immediately `git revert` the deletion commit
> and push to main. ArgoCD will re-sync and recreate the applications within its sync interval
> (default: 3 minutes, configured in `argocd-cm` ConfigMap `timeout.reconciliation`).
> Verify rollback by checking `argocd app list` for the restored applications within 5 minutes.

## Scope
- dk-phantom → DK-OS (smallest, recommended first)
- dk-mercury → DK-OS
- ~~dk-data-fe → carbon-5~~ **CANCELLED** — dk-data-fe is now a first-class dk-managed product; no migration needed
- ~~agent-mesh → lithium-5~~ **CANCELLED** — agent-mesh is now DK-OS agent-mesh (`apps/agent-mesh/` in DK-OS repo); no migration needed
- dk-alchemy cleanup per migration (bootstrap removal, namespace cleanup)
- New repo onboarding (carbon-5, DK-OS, dk-compliance-v2)

## Dependencies
- Target repos must be ready to receive code (DK-OS, carbon-5 onboarding)
- dk-template helps scaffold the target repo structure

## Existing Work
- dk-planning docs: migrations/README.md, 3 active migration plans (agent-mesh migration cancelled)
- dk-alchemy: .gitops/external/ has bootstrap apps for all 6 deprecated repos
- dk-alchemy specs: 008-dk-data-platform-integration, 011-dk-data-stabilization

## Recommended Execution Order
1. **dk-phantom → DK-OS** (smallest migration, good pilot)
2. **dk-mercury → DK-OS** (NestJS, same target as dk-phantom)

## Per-Migration Steps (template)

### Pre-Migration
1. Onboard target repo to K8s/ArgoCD (follow onboarding.md checklist)
2. Set up Doppler project for target repo
3. Create GitOps structure in target repo (.gitops/, k8s/)
4. Submit dk-alchemy PR: add external app bootstrap for target repo

### Migration
5. Move source code from deprecated repo to target repo
6. Migrate database tables/schemas
7. Update import paths, package references
8. Update CI/CD workflows
9. Redirect internal API calls to new service locations
10. Run integration tests in staging

### Post-Migration (dk-alchemy cleanup)
11. Remove external app bootstrap from .gitops/external/<deprecated>.yaml
12. Remove AppProject from .gitops/repositories/<deprecated>-bootstrap.yaml
13. Clean up namespaces: remove <deprecated>-prod and <deprecated>-staging
14. Remove DopplerSecret references
15. Update edge routes if domain mappings changed
16. Archive deprecated repo (don't delete — keep for reference)

### Validation
17. All services accessible at new locations
18. ArgoCD shows clean sync state for target repo
19. No orphaned resources in deprecated namespaces
20. Monitoring dashboards updated to reflect new service names

## dk-alchemy Changes Per Migration

### dk-phantom → DK-OS
- DELETE: .gitops/external/dk-phantom-prod.yaml, dk-phantom-staging.yaml
- DELETE: .gitops/repositories/dk-phantom-bootstrap.yaml
- MODIFY: .gitops/repositories/kustomization.yaml (remove dk-phantom)
- DELETE: k8s/infrastructure/namespaces/ entries for dk-phantom-prod, dk-phantom-staging

### dk-mercury → DK-OS
- DELETE: .gitops/external/dk-mercury-prod.yaml, dk-mercury-staging.yaml
- DELETE: .gitops/repositories/dk-mercury-bootstrap.yaml
- MODIFY: .gitops/repositories/kustomization.yaml (remove dk-mercury)

### ~~dk-data-fe → carbon-5~~ CANCELLED
> dk-data-fe is now a first-class dk-managed product. No migration. Its `.gitops/external/` bootstrap files, namespace, and DopplerSecrets remain in dk-alchemy permanently.

### agent-mesh → ~~lithium-5~~ CANCELLED
> agent-mesh has been superseded by DK-OS agent-mesh (`apps/agent-mesh/` in the DK-OS repo).
> No migration needed. The agent-mesh bootstrap files in dk-alchemy should still be cleaned up:
- DELETE: .gitops/external/agent-mesh-prod.yaml, agent-mesh-staging.yaml
- DELETE: .gitops/repositories/agentmesh-bootstrap.yaml

### New Repo Onboarding (carbon-5, DK-OS, dk-compliance-v2)
- CREATE: .gitops/external/<repo>-prod.yaml, <repo>-staging.yaml per repo
- CREATE: .gitops/repositories/<repo>-bootstrap.yaml per repo
- MODIFY: .gitops/repositories/kustomization.yaml (add new repos)
- MODIFY: grafana/provisioning/alerting/contact-points.yaml (add team channels)

## Verification
- ArgoCD shows no Applications for deprecated repos
- No pods running in deprecated namespaces
- Target repo's services are healthy in ArgoCD
- All monitoring dashboards show data for migrated services
- Edge routes correctly point to new service locations
- Deprecated repos archived on GitHub

## Options/Recommendations
**Migration approach:**
- **Option A (Recommended): Big-bang per repo** — Move everything at once, cut over in one deployment. Simpler, avoids long-running dual-state.
- **Option B: Incremental per service** — Move services one at a time. Lower risk per change but creates extended period of split state.
**Recommendation:** Option A for smaller migrations (dk-phantom, dk-mercury). Option B for dk-data-fe where the service count justifies incremental moves.
