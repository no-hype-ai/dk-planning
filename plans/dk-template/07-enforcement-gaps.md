# Plan 07: Enforcement Gaps — Template to Platform Standard

## Goal

Close the gap between dk-template scaffolding (~70% complete) and a fully enforced deployment framework that works with dk-cli and the Platform API. The template generates excellent directory structure and manifest scaffolds, but defers security hardening, implementation code, CI/CD integration, and automation to manual effort. This plan captures every gap identified by auditing the template against `docs/onboarding.md`, `docs/standards-compliance.md`, `docs/dk-cli.md`, and real product repo patterns (behavior-labs-ai, DK-OS).

## Current State

dk-template is structurally complete (Plans 01-06 implemented):
- `init.sh` — Multi-service placeholder replacement engine (production-ready)
- `validate-scaffold.sh` — Post-init validation
- GitOps, K8s, monitoring, CI/CD, Doppler, docker-compose scaffolds
- dk-alchemy PR content generation
- dk-cli `init` command reference implementation

**What's missing:** The template generates scaffolding but doesn't provide the *implementation* needed to pass the onboarding checklist. Teams must manually add security contexts, health endpoints, instrumentation code, webhook steps, and more.

## Dependencies

This plan is **independent** — all work happens in the dk-template repo. However, some gaps require coordination:

| Gap | Coordination Needed |
|-----|-------------------|
| `@datakinetic/observability` installation | dk-alchemy/06 must be published first |
| Shared CI workflows | dk-alchemy/04 must create the workflows |
| Platform API integration | dk-alchemy/01 must be operational |
| Python service variant | DK-OS agent-mesh patterns inform design |

---

## Gap Category 1: Security Hardening

**Onboarding refs:** Step 12 (Production Hardening), Step 9 (Kustomize Components)

### 1.1 SecurityContext in deployment.yaml

**Current:** No securityContext in template deployment.

**Fix:** Add to `k8s/apps/{{service}}/base/deployment.yaml`:
```yaml
spec:
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        fsGroup: 1001
      containers:
        - name: {{service}}
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
```

**Impact:** Aligns with Kyverno policies `require-run-as-non-root` and future `require-read-only-rootfs` (dk-alchemy/03).

### 1.2 Rolling Update Strategy

**Current:** No update strategy specified (Kubernetes defaults: maxSurge 25%, maxUnavailable 25%).

**Fix:** Add to deployment:
```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

### 1.3 Pod Anti-Affinity

**Current:** No affinity rules.

**Fix:** Add to production overlay:
```yaml
spec:
  template:
    spec:
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchLabels:
                    app.kubernetes.io/name: {{service}}
                topologyKey: kubernetes.io/hostname
```

### 1.4 NetworkPolicy Template

**Current:** Not included.

**Fix:** Add `k8s/apps/{{service}}/base/network-policy.yaml`:
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{service}}
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: {{service}}
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: traefik
  egress:
    - {} # Allow all egress by default, restrict per service
```

### 1.5 Container Port Flexibility

**Current:** Hardcoded to port 3000 in deployment and service.

**Fix:** Add port as init.sh parameter: `--port <N>` (default 3000). Replace `{{port}}` in deployment.yaml and service.yaml.

---

## Gap Category 2: Implementation Code

**Onboarding refs:** Step 5 (Observability), Step 6 (Health Checks)

### 2.1 Health Endpoint Implementation

**Current:** Deployment references `/health` and `/ready` but no code provided.

**Fix:** Add `src/health.ts` template:
```typescript
// src/health.ts — Health check endpoints
// Liveness: /health — returns 200 if process is running
// Readiness: /ready — returns 200 if dependencies are reachable

export async function healthHandler() {
  return { status: 'ok', timestamp: new Date().toISOString() };
}

export async function readyHandler() {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
  };
  const healthy = Object.values(checks).every(c => c.status === 'ok');
  return { status: healthy ? 'ok' : 'degraded', checks };
}
```

### 2.2 OTel Instrumentation (Replace Stub)

**Current:** `src/instrumentation.ts` is a placeholder with comments.

**Fix:** Replace with working instrumentation that:
- Initializes OpenTelemetry Node SDK
- Configures OTLP exporters (traces, metrics, logs)
- Sets resource attributes (service name, version, product, team)
- Registers auto-instrumentations (HTTP, Express/Fastify, Prisma, pg, redis)
- Handles graceful shutdown

### 2.3 `@datakinetic/observability` Auto-Installation

**Current:** Referenced but not installed.

**Fix:** Add to init.sh:
```bash
# After placeholder replacement, install observability package
if command -v pnpm &> /dev/null; then
  pnpm add @datakinetic/observability
fi
```

---

## Gap Category 3: CI/CD Integration

**Onboarding refs:** Step 3 (CI/CD Pipeline)

### 3.1 Webhook Notification Step

**Current:** Workflow template delegates to shared workflow but doesn't include webhook step.

**Fix:** The shared workflow (`data-kinetic/.github:build-deploy.yaml`) should include the webhook step. If it doesn't, add to template workflow:
```yaml
- name: Notify dk-alchemy
  run: |
    PAYLOAD='{"event":"image-built","image":"ghcr.io/data-kinetic/${{ github.event.repository.name }}/${{ matrix.service }}","tag":"${{ steps.meta.outputs.version }}"}'
    SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "${{ secrets.DK_WEBHOOK_SECRET }}" | cut -d' ' -f2)
    curl -s -X POST "https://webhooks.datakinetic.com/webhooks/${{ github.event.repository.name }}" \
      -H "Content-Type: application/json" \
      -H "X-Webhook-Signature: sha256=$SIGNATURE" \
      -d "$PAYLOAD"
```

### 3.2 SBOM & Provenance

**Current:** Not included in Docker build step.

**Fix:** Add to Dockerfile build args or CI workflow:
```yaml
- name: Build and push
  uses: docker/build-push-action@v5
  with:
    sbom: true
    provenance: true
```

### 3.3 Manifest Validation

**Current:** No kubeconform/yamllint step.

**Fix:** Add to standards.yaml or build-deploy.yaml:
```yaml
- name: Validate manifests
  run: |
    kubeconform -strict -summary k8s/
    yamllint k8s/
```

### 3.4 Image Tag Strategy

**Current:** Deployment hardcodes `:latest`. Overlays don't override.

**Fix:** Add image tag patches in overlays:
```yaml
# k8s/apps/{{service}}/overlays/prod/kustomization.yaml
images:
  - name: ghcr.io/data-kinetic/{{repo-name}}/{{service}}
    newTag: latest  # Overridden by ArgoCD Image Updater
```

---

## Gap Category 4: Onboarding Automation

**Onboarding refs:** Steps 2, 4, 8

### 4.1 dk-alchemy PR Automation

**Current:** `_dk-alchemy-pr/` generated with README instructions.

**Fix:** Add `scripts/submit-dk-alchemy-pr.sh`:
```bash
#!/bin/bash
# Copies _dk-alchemy-pr/ content to dk-alchemy checkout and creates PR
DK_ALCHEMY_PATH="${DK_ALCHEMY_PATH:-../dk-alchemy}"
# ... copy files, create branch, gh pr create
```

### 4.2 Doppler Project Creation

**Current:** Manual.

**Fix:** Add to `scripts/doppler/setup-doppler-project.sh`:
```bash
doppler projects create {{product}}-applications
doppler configs create dev --project {{product}}-applications
doppler configs create stg --project {{product}}-applications
doppler configs create prd --project {{product}}-applications
```

### 4.3 Pre-Commit Hooks

**Current:** Not provided.

**Fix:** Add `.husky/pre-commit` or equivalent:
- Secret detection (grep for API keys, tokens, passwords)
- `.env` file detection (prevent committing)

---

## Gap Category 5: dk-cli / Platform API Integration

**Onboarding refs:** dk-cli.md, platform-api.md

### 5.1 SLO Dashboard Template

**Current:** Not included. Onboarding step 8 requires it.

**Fix:** Add `monitoring/dashboards/{{service}}-slo.json`:
- Availability SLO panel (error budget, burn rate)
- Latency SLO panel (P95 vs target)
- SLO status (within budget / at risk / exhausted)

### 5.2 `.dk-standards.yaml` Enhancement

**Current:** Basic template without all options.

**Fix:** Include all supported fields:
```yaml
product: "{{product}}"
team: "{{team}}"
tiers: [1, 2]
grace_period_until: ""  # Optional: YYYY-MM-DD for warn-only period
skip_checks: []         # Optional: list of specific check IDs to skip
services:
  - name: "{{service}}"
    port: 3000
```

### 5.3 dk-cli Hook Integration

**Current:** No dk-cli hooks generated.

**Fix:** Add `.dk/hooks/` directory with:
- `pre-deploy.sh` — Run `dk check` before deploy
- `post-scaffold.sh` — Validate scaffold after `dk init`

---

## Gap Category 6: Multi-Language Support

**Context:** DK-OS agent-mesh (Python FastAPI)

### 6.1 Python Service Variant

**Current:** Template assumes Node.js/TypeScript only.

**Fix:** Create variant templates in init.sh:
```bash
--service-type <node|python>  # New flag
```

For Python services:
- `Dockerfile.python` — Python base image, pip install, uvicorn
- `k8s/apps/{{service}}/` — Same structure, different health check paths
- `monitoring/` — Same dashboard/alert format
- No Turbo/pnpm build pipeline (separate CI matrix entry)

### 6.2 Mixed-Language Documentation

**Fix:** Add guidance in template README:
- How to add a Python service to a Node.js monorepo
- Separate Dockerfile pattern
- Separate CI matrix entry
- Shared Kustomize/ArgoCD patterns

---

## Implementation Phases

### Phase 1: Critical (Immediate)

| Item | Gap | Effort |
|------|-----|--------|
| 1.1 | SecurityContext in deployment | Small |
| 1.2 | Rolling update strategy | Small |
| 2.1 | Health endpoint code | Small |
| 3.4 | Image tag overlay fix | Small |
| 5.2 | `.dk-standards.yaml` enhancement | Small |

### Phase 2: Important (Next Sprint)

| Item | Gap | Effort |
|------|-----|--------|
| 1.4 | NetworkPolicy template | Medium |
| 2.2 | OTel instrumentation code | Medium |
| 3.1 | Webhook notification step | Small |
| 3.2 | SBOM/provenance flags | Small |
| 3.3 | Manifest validation step | Small |
| 4.3 | Pre-commit hooks | Small |

### Phase 3: Enhancement (Backlog)

| Item | Gap | Effort |
|------|-----|--------|
| 1.3 | Pod anti-affinity | Small |
| 1.5 | Port flexibility in init.sh | Medium |
| 2.3 | Auto-install observability package | Small |
| 4.1 | dk-alchemy PR automation script | Medium |
| 4.2 | Doppler project creation script | Small |
| 5.1 | SLO dashboard template | Medium |
| 5.3 | dk-cli hook integration | Medium |
| 6.1 | Python service variant | Large |
| 6.2 | Mixed-language documentation | Small |

---

## Verification

- [ ] `securityContext` present in generated deployment.yaml
- [ ] `src/health.ts` generates working health endpoints
- [ ] `src/instrumentation.ts` generates working OTel setup (not a stub)
- [ ] Production overlay includes image tag patch
- [ ] `.dk-standards.yaml` includes all supported fields
- [ ] `validate-scaffold.sh` checks for security context, health code, instrumentation
- [ ] kubeconform validates generated manifests
- [ ] No remaining `{{...}}` placeholders after init.sh (existing check)

## Files to Modify

```
k8s/apps/{{service}}/base/deployment.yaml (securityContext, rolling update)
k8s/apps/{{service}}/base/network-policy.yaml (new)
k8s/apps/{{service}}/overlays/prod/kustomization.yaml (anti-affinity, image tag)
src/health.ts (new — health endpoint implementation)
src/instrumentation.ts (replace stub with working code)
.dk-standards.yaml (enhance with all fields)
.github/workflows/build-deploy.yaml (webhook step, SBOM)
scripts/init.sh (--port flag, --service-type flag, package installation)
scripts/validate-scaffold.sh (add security checks)
scripts/submit-dk-alchemy-pr.sh (new)
scripts/doppler/setup-doppler-project.sh (new)
monitoring/dashboards/{{service}}-slo.json (new)
```
