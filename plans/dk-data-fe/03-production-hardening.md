# Plan 03: Production Hardening

## Goal

Close production reliability gaps across dk-data-fe's 2 Deployments (PostgREST, job-trigger) and 20+ CronJobs: rolling update strategy, pod anti-affinity, PodDisruptionBudgets, security contexts, and CronJob resource limits.

## Current State

| Area | PostgREST | job-trigger | CronJobs (20+) |
|------|-----------|-------------|-----------------|
| **Replicas (prod)** | 3 | 2 | N/A (batch) |
| **Rolling update strategy** | None (K8s default) | None (K8s default) | N/A |
| **Anti-affinity** | None — 3 replicas could land on same node | None | N/A |
| **PDB** | None — node drain takes all replicas | None | N/A |
| **securityContext** | None (image runs as non-root via Dockerfile) | None (appuser via Dockerfile) | None |
| **Resource requests** | 256Mi/200m (prod overlay) | 128Mi/100m (prod overlay) | None on most; mol-transform has 1Gi/500m |
| **Resource limits** | 1Gi/1000m (prod overlay) | 512Mi/500m (prod overlay) | None on most; mol-transform has 2Gi/1000m |
| **Backup endpoints** | N/A | N/A | MinIO (migrating to SeaweedFS) |

## Dependencies

| Dependency | Plan | Status | Blocking |
|-----------|------|--------|----------|
| Plan 01 audit complete | [01-platform-alignment-audit.md](01-platform-alignment-audit.md) | Not started | Gap verification |
| SeaweedFS migration | dk-planning MinIO→SeaweedFS effort | In progress | Backup CronJob endpoints |

---

## Workstream 1: Deployment Rolling Updates

Add explicit rolling update strategy to prevent downtime during deployments.

### Step 1: PostgREST Deployment

Add to `k8s/base/postgrest/deployment.yaml` under `spec:`:

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

`maxUnavailable: 0` ensures zero-downtime: a new pod must be Ready before an old pod is terminated. With 3 prod replicas, this means at most 4 pods during rollout.

### Step 2: job-trigger Deployment

Add same strategy to `k8s/base/ingestion/job-trigger-deployment.yaml` under `spec:`:

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

---

## Workstream 2: Pod Anti-Affinity

Spread replicas across nodes to survive single-node failures.

### Step 3: PostgREST Anti-Affinity

Add to `k8s/base/postgrest/deployment.yaml` under `spec.template.spec:`:

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchLabels:
              app: postgrest
          topologyKey: kubernetes.io/hostname
```

Using `preferred` (not `required`) so scheduling still succeeds if only one node is available. With 3 replicas across 2+ K3s worker nodes, this distributes load.

### Step 4: job-trigger Anti-Affinity

Same pattern in `k8s/base/ingestion/job-trigger-deployment.yaml`:

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchLabels:
              app: job-trigger
          topologyKey: kubernetes.io/hostname
```

---

## Workstream 3: PodDisruptionBudgets

Protect availability during voluntary disruptions (node drain, cluster upgrades).

### Step 5: Create PDB Manifests

**`k8s/base/pdb-postgrest.yaml`:**

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: postgrest-pdb
  labels:
    app.kubernetes.io/name: postgrest
    app.kubernetes.io/part-of: dk-data
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: postgrest
```

**`k8s/base/pdb-job-trigger.yaml`:**

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: job-trigger-pdb
  labels:
    app.kubernetes.io/name: job-trigger
    app.kubernetes.io/part-of: dk-data
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: job-trigger
```

### Step 6: Register in Kustomization

Add to `k8s/base/kustomization.yaml` resources:

```yaml
resources:
  # ... existing resources ...
  # Pod disruption budgets
  - pdb-postgrest.yaml
  - pdb-job-trigger.yaml
```

---

## Workstream 4: Security Contexts

Enforce least-privilege at the Kubernetes level, not just the Dockerfile level.

### Step 7: PostgREST Security Context

The `postgrest/postgrest:v12.2.3` image runs as UID 1000 by default. Add to `k8s/base/postgrest/deployment.yaml` under `spec.template.spec`:

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000
  seccompProfile:
    type: RuntimeDefault
```

Add to the `postgrest` container spec:

```yaml
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: ["ALL"]
```

PostgREST doesn't write to the filesystem, so `readOnlyRootFilesystem: true` should work without additional volumes.

The `jwt-secret-validator` init container (busybox:1.36) also needs:

```yaml
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: ["ALL"]
```

### Step 8: job-trigger Security Context

The custom image uses `appuser` (UID defined in Dockerfile). Add pod-level context:

```yaml
securityContext:
  runAsNonRoot: true
  fsGroup: 1000
  seccompProfile:
    type: RuntimeDefault
```

Container-level context:

```yaml
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: ["ALL"]
```

Add `/tmp` emptyDir volume for Python's tempfile and httpx:

```yaml
volumes:
  - name: tmp
    emptyDir: {}
# In container spec:
volumeMounts:
  - name: tmp
    mountPath: /tmp
```

### Step 9: CronJob Security Contexts

Apply the same pod/container security context pattern to all CronJob templates in `k8s/base/ingestion/`. Each CronJob's `spec.jobTemplate.spec.template.spec` needs the pod-level securityContext and `/tmp` emptyDir.

This affects 20+ files — create a Kustomize patch or apply individually based on template structure.

---

## Workstream 5: CronJob Resource Limits

Prevent unbounded memory consumption from crashing nodes.

### Step 10: Standard Fetcher Resources

For most fetchers (pubmed, ema-reg, openalex-ci, drugbank, journal-rss, hta, epo, cochrane, news, sec-edgar, uniprot, pdb, uspto-trademarks, euipo):

```yaml
resources:
  requests:
    memory: "128Mi"
    cpu: "50m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### Step 11: Heavy Fetcher Resources

For data-intensive fetchers (cms-all, mol-fetch-daily, mol-fetch-weekly, mol-fetch-monthly, uspto-patents, uspto-ci):

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "100m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

mol-transform already has production overlay resources (1Gi/500m → 2Gi/1000m) — no change needed.

### Step 12: Backup Job Resources

For `pg-backup-daily`, `pg-backup-weekly`, `pg-backup-verify`:

```yaml
resources:
  requests:
    memory: "128Mi"
    cpu: "50m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

---

## Workstream 6: SeaweedFS Migration (Backup CronJobs)

### Step 13: Update Backup Endpoints

When SeaweedFS migration is complete, update:
- `k8s/base/backup/minio-credentials.yaml` → rename to `seaweedfs-credentials.yaml` (or `s3-credentials.yaml`)
- `k8s/base/backup/pg-backup-configmap.yaml` → update `S3_ENDPOINT` from `minio.infra.svc.cluster.local:9000` to SeaweedFS endpoint
- `k8s/base/networkpolicy.yaml` → update egress rules if SeaweedFS uses different port

**Blocked on:** SeaweedFS deployment completing in dk-alchemy. Track via dk-planning MinIO→SeaweedFS effort.

---

## Files to Create/Modify

```
dk-data-fe/
├── k8s/base/
│   ├── postgrest/deployment.yaml          (modify: strategy, affinity, securityContext)
│   ├── ingestion/job-trigger-deployment.yaml  (modify: strategy, affinity, securityContext, volumes)
│   ├── ingestion/cronjob-*.yaml           (modify: resources, securityContext — 20+ files)
│   ├── backup/pg-backup-*.yaml            (modify: resources)
│   ├── backup/minio-credentials.yaml      (modify: SeaweedFS endpoint — when ready)
│   ├── networkpolicy.yaml                 (modify: SeaweedFS egress — when ready)
│   ├── kustomization.yaml                 (modify: add PDB resources)
│   ├── pdb-postgrest.yaml                 (new)
│   └── pdb-job-trigger.yaml               (new)
```

## Workstream 7: Kyverno Policy Compliance

dk-alchemy deploys 6 Kyverno policies in audit mode (including `require-run-as-non-root`, `require-read-only-rootfs`, `require-labels`). dk-data-fe pods must pass all policies before Kyverno moves to enforce mode.

### Step 14: Add Required Pod Labels

All pod templates must include these labels (required by `require-labels` policy):

```yaml
metadata:
  labels:
    team: data-platform
    service: dk-data
    product: dk-data
```

Apply to: PostgREST Deployment, job-trigger Deployment, all 20+ CronJob pod templates.

### Step 15: Verify Kyverno Compliance

After applying securityContext (Workstream 4) and labels (Step 14):

```bash
# Check policy audit results for dk-data namespace
kubectl get policyreport -n dk-data-prod -o yaml | grep -A5 "result: fail"

# Verify all pods pass all 6 policies
kubectl get clusterpolicyreport -o yaml | grep -B2 "dk-data"
```

All dk-data-fe pods must show `result: pass` for all policies before the namespace can be moved to Kyverno enforce mode.

---

## Verification

- [ ] `kubectl kustomize k8s/overlays/prod` renders all Deployments with `strategy.rollingUpdate`
- [ ] `kubectl kustomize k8s/overlays/prod | grep -A5 'podAntiAffinity'` shows anti-affinity on both Deployments
- [ ] `kubectl kustomize k8s/overlays/prod | grep -c 'PodDisruptionBudget'` returns 2
- [ ] `kubectl kustomize k8s/overlays/prod | grep -c 'runAsNonRoot: true'` returns count matching all pod specs
- [ ] All CronJob containers have `resources.limits.memory` defined
- [ ] Deploy to staging: PostgREST pods spread across nodes (`kubectl get pods -o wide`)
- [ ] Staging node drain test: drain one node, verify PostgREST remains available
- [ ] Staging CronJob test: mol-transform completes within resource limits
- [ ] All pod templates have `team`, `service`, `product` labels
- [ ] Kyverno policy report shows zero failures for dk-data namespace

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| `readOnlyRootFilesystem` breaks Python tempfile | Add `/tmp` emptyDir mount; test in staging first |
| PostgREST image UID mismatch | Verify UID with `docker inspect postgrest/postgrest:v12.2.3` before deploying |
| CronJob OOMKill with new limits | Set limits generously (512Mi standard, 1Gi heavy); monitor actual usage first |
| Anti-affinity with insufficient nodes | Using `preferred` not `required` — scheduling succeeds even with 1 node |
| PDB blocks node drain when only 1 replica | Staging uses 1 replica for some services — PDB `minAvailable: 1` blocks drain; consider staging-specific PDB override |
