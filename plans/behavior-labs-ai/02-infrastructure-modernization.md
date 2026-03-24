# Plan 02: Infrastructure Modernization

## Goal

Ensure behavior-labs-ai Kubernetes manifests, ArgoCD configuration, and deployment patterns follow the latest dk-template standards and leverage platform observability data for resource optimization.

## Current State

behavior-labs-ai has a mature K8s deployment setup:

| Area | Current State |
|------|--------------|
| **Kustomize** | `k8s/` with `base/`, `apps/{app,admin,api,doppler-secrets}/`, `components/{hpa-production,hpa-standard,pdb-standard}`, overlays for `prod/staging/local` |
| **ArgoCD** | `.gitops/` with branch-specific ApplicationSet roots |
| **NetworkPolicy** | Infrastructure namespace isolation only |
| **Resource limits** | Set but not tuned against actual usage data |
| **HPA** | Standard and production Kustomize components, thresholds not validated against SLOs |
| **Image tagging** | `staging-<sha7>`, `<semver>`, `main-<sha7>` — follows dk-alchemy convention |

## Dependencies

| Dependency | Plan | Blocking |
|-----------|------|----------|
| SLO targets defined | [dk-alchemy/02](../dk-alchemy/02-slo-and-incident-management.md) | HPA tuning |
| Kyverno enforce mode | [dk-alchemy/03](../dk-alchemy/03-security-hardening.md) | NetworkPolicy |
| K8s efficiency dashboard | [dk-alchemy/13](../dk-alchemy/13-cost-and-utilization.md) | Resource right-sizing |

---

## Workstream 1: Kustomize Alignment

### Steps

1. **Audit `k8s/` against dk-template/01 scaffold output**
   - Compare directory structure with dk-template `init.sh` generated layout
   - Identify any drift or missing components
   - Document behavior-labs-ai-specific extensions (e.g., doppler-secrets app)

2. **Align naming conventions**
   - Verify label selectors match dk-template patterns (`app.kubernetes.io/*` labels)
   - Verify annotation standards (Prometheus scrape, ArgoCD sync wave)
   - Update any legacy labels to standard taxonomy

3. **Document behavior-labs-ai extensions**
   - Kustomize components (`hpa-production`, `hpa-standard`, `pdb-standard`) should be proposed as dk-template components if not already present
   - Document BullMQ worker deployments (if separate from api)

### Files

```
k8s/base/
k8s/apps/app/
k8s/apps/admin/
k8s/apps/api/
k8s/apps/doppler-secrets/
k8s/components/
k8s/templates/
```

---

## Workstream 2: ArgoCD ApplicationSet

### Steps

1. **Verify `.gitops/` follows dk-alchemy app-of-apps pattern**
   - Check ApplicationSet generator type (matrix/list/directory)
   - Verify sync policy matches platform standard (auto-sync with prune for staging, manual for prod)
   - Confirm health checks are configured

2. **Validate branch-to-environment mapping**
   - `main` → production
   - `staging` branch (if exists) → staging
   - Confirm image tag patterns match ArgoCD Image Updater annotations

---

## Workstream 3: NetworkPolicy

**Requires:** dk-alchemy/03 Kyverno enforcement begins on staging

### Steps

1. **Define ingress/egress policies for each app**
   - `app` (Next.js): ingress from Traefik, egress to `api`, external (Clerk, PostHog)
   - `admin` (Next.js): ingress from Traefik, egress to `api`, external (Clerk)
   - `api` (NestJS): ingress from `app`/`admin`/Traefik, egress to PostgreSQL, Redis, SeaweedFS, OpenSearch, LiteLLM, external (Clerk, Stripe, Svix)

2. **Create NetworkPolicy manifests**
   - Add to `k8s/base/` or environment-specific overlays
   - Use label selectors consistent with Kyverno policies

3. **Test on local K3d first**
   - `pnpm local:deploy` with NetworkPolicies
   - Verify all service-to-service communication works
   - Verify external connectivity (Clerk, LiteLLM)

4. **Deploy to staging with Kyverno audit**
   - Verify no policy violations
   - Monitor for 48 hours before production

### Files (New)

```
k8s/base/network-policies/
  app-network-policy.yaml
  admin-network-policy.yaml
  api-network-policy.yaml
```

---

## Workstream 4: Resource Right-Sizing

**Requires:** dk-alchemy/13 K8s efficiency dashboard operational

### Steps

1. **Collect baseline metrics (7-day window)**
   - CPU request vs actual usage per pod
   - Memory request vs actual usage per pod
   - Identify overprovisioned pods (request > 2x actual 95th percentile)

2. **Tune resource requests/limits**
   - Set requests to P95 usage + 20% headroom
   - Set limits to P99 usage + 50% headroom
   - Special handling for BullMQ workers (bursty workloads)

3. **Validate**
   - Deploy to staging, monitor OOMKills and CPU throttling
   - Re-check efficiency dashboard after 7 days

### Files

```
k8s/apps/app/deployment.yaml (resource blocks)
k8s/apps/admin/deployment.yaml
k8s/apps/api/deployment.yaml
```

---

## Workstream 5: HPA Tuning

**Requires:** dk-alchemy/02 SLO targets defined

### Steps

1. **Map SLO targets to HPA thresholds**
   - Availability SLO (99.5%) → min replicas to survive 1 pod failure
   - Latency SLO (P95 < 1s) → scale-up trigger at CPU/memory threshold

2. **Review HPA component configs**
   - `k8s/components/hpa-standard/` — validate min/max replicas, target CPU
   - `k8s/components/hpa-production/` — validate production-specific thresholds
   - Consider custom metrics (request latency via Mimir) for advanced HPA

3. **Test scale-up/down behavior**
   - Load test on staging with k6 or similar
   - Verify HPA responds within SLO latency budget
   - Verify scale-down doesn't cause connection drops

### Files

```
k8s/components/hpa-standard/hpa.yaml
k8s/components/hpa-production/hpa.yaml
```

---

## Verification

- [ ] `k8s/` structure matches dk-template scaffold (or deviations documented)
- [ ] `.gitops/` follows dk-alchemy app-of-apps pattern
- [ ] NetworkPolicies deployed on staging (audit mode)
- [ ] Resource requests tuned to within 20% of actual P95 usage
- [ ] HPA thresholds aligned with SLO targets
- [ ] No OOMKills or CPU throttling in staging over 48 hours
- [ ] Local K3d deployment works with all changes (`pnpm local:deploy`)
