# Security & Compliance

## Overview

This document covers the platform's security posture: RBAC, network policies, supply chain security, and compliance considerations. Much of this is currently implemented but not formally documented.

## Current State

### [ArgoCD](https://argo-cd.readthedocs.io/) RBAC (AppProjects)

Each product gets an ArgoCD **AppProject** that constrains:
- **Allowed source repos** — only the product's own GitHub repo
- **Allowed namespaces** — only the product's own namespaces (e.g., `behaviorlabs-prod`, `behaviorlabs-staging`)
- **Allowed cluster resources** — limited set (no cluster-wide resources like ClusterRoles)

This prevents one product from modifying another's resources.

### Namespace Isolation

- Each product deploys to dedicated namespaces (`<product>-prod`, `<product>-staging`)
- Staging environments have **NetworkPolicies** restricting cross-namespace communication
- **ResourceQuotas** cap total CPU/memory per staging namespace
- **LimitRanges** enforce per-pod resource defaults and maximums

### Image Security

| Practice | Status |
|----------|--------|
| Images from [GHCR](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) only | Convention (not enforced) |
| SBOM generation | Enabled in behavior-labs-ai CI |
| Provenance attestation | Enabled in behavior-labs-ai CI |
| Source map deletion post-upload | Done ([Sentry](https://docs.sentry.io/)) |
| No secrets in image layers | [Doppler](https://docs.doppler.com/) `--mount=type=secret` |
| Base image updates | Renovate auto-PRs (see [CI/CD Pipelines](ci-cd-pipelines.md#4-dependency-update-automation)) |

### Self-Hosted Runner Isolation

ARC v2 runners enforce security through multiple layers:
- **Ephemeral pods** — destroyed after each job, no persistent state or credential leakage
- **NetworkPolicy** — default-deny ingress, explicit egress allowlist (GitHub, GHCR, Doppler, Alloy, npm)
- **Minimal RBAC** — per-runner-class ServiceAccount, no cluster-level permissions
- **Runner groups** — GitHub org-level groups restrict which repos can use gpu runners
- **DinD sidecar** — [Docker](https://docs.docker.com/)-in-Docker runs as a privileged sidecar; ephemeral pod lifecycle mitigates privilege risk

See [Self-Hosted Runners & Webhook Service](self-hosted-runners-and-webhooks.md) for full details.

### Webhook Signature Validation

The webhook service validates all incoming requests via HMAC-SHA256:
- Each product repo has its own webhook secret stored in Doppler (`dk-alchemy-webhooks` project)
- Webhook URL includes repo name for secret lookup: `POST /webhooks/{repo}`
- Requests without valid `X-Webhook-Signature` header are rejected
- [Traefik](https://doc.traefik.io/traefik/) rate-limiting (30 req/min burst 50) + app-level per-repo limits protect against abuse

### Secrets

- No secrets in Git (Doppler Operator syncs from SaaS)
- Build-time secrets via Docker `--mount=type=secret`
- See [Secrets Management](secrets-management.md) for full details

### TLS

- **cert-manager** manages TLS certificates with ClusterIssuers
- Wildcard certificates for `*.behaviorlabs.ai` and `*.staging.behaviorlabs.ai`
- **Reflector** mirrors TLS secrets across namespaces
- **sentinel-probe** monitors TLS certificate expiry from outside the network

## Gaps

### Policy Enforcement

- [ ] **No admission controller** — no OPA/[Gatekeeper](https://open-policy-agent.github.io/gatekeeper/) or [Kyverno](https://kyverno.io/docs/) to enforce policies in-cluster
  - Should enforce: resource limits required, image source restrictions (GHCR only), required labels, no `latest` tags in prod
- [ ] **No image signing/verification** — images are not signed with [cosign](https://docs.sigstore.dev/cosign/overview/) or Notation
- [ ] **No pod security standards** — no PodSecurityAdmission or equivalent restricting privileged containers

### Network

- [ ] **Staging isolation only** — production namespaces have no NetworkPolicies
- [ ] **No egress restrictions** — pods can reach any external endpoint
- [ ] **Edge LB hardening** — Traefik security headers, rate limiting not documented

### Supply Chain

- [ ] **[GitHub Actions](https://docs.github.com/en/actions) versions unpinned** — should pin to SHA, not tag
- [ ] **No dependency audit workflow** — no automated CVE scanning of npm/Docker dependencies
- [ ] **SBOM not verified** — generated but not consumed (no SBOM-based policy enforcement)

### Compliance

- [ ] **No audit log aggregation** — Doppler, GitHub, ArgoCD audit logs not centralized
- [ ] **No access review process** — no scheduled review of who has access to what
- [ ] **No data classification** — no labeling of PII/PHI in data stores

## Recommendations

### 1. Deploy Kyverno (Admission Controller)

Add **Kyverno** to dk-alchemy's infrastructure as the admission controller. Kyverno was chosen over OPA/Gatekeeper for its Kubernetes-native policy syntax (no Rego) and simpler operations model.

#### Implementation Plan

**Phase 1 — Audit mode** (no enforcement, report-only):
1. Deploy Kyverno in `audit` mode via dk-alchemy `k8s/infrastructure/kyverno/`
2. Add policies in `audit` mode — they report violations but do not block
3. Review PolicyReport CRDs to assess current non-compliance
4. Fix violations across dk-alchemy and product repos

**Phase 2 — Enforce on staging**:
1. Switch staging policies to `enforce` mode
2. Validate that CI/CD pipelines pass admission checks
3. Monitor for false positives over 2 weeks

**Phase 3 — Enforce on production**:
1. Switch production policies to `enforce` mode
2. Add Kyverno to DR bootstrap order (step 4c, after cert-manager)
3. Monitor PolicyReport metrics in [Grafana](https://grafana.com/docs/grafana/latest/)

#### Policies

```yaml
# k8s/infrastructure/kyverno/policies/
require-resource-limits.yaml       # All pods must have CPU/memory requests and limits
restrict-image-registries.yaml     # Only ghcr.io/data-kinetic/* images allowed
require-labels.yaml                # team, service, product labels required on Deployments
disallow-latest-tag.yaml           # No :latest in prod namespaces
require-run-as-non-root.yaml       # No root containers (except DinD sidecar in ARC runners)
require-read-only-rootfs.yaml      # Read-only root filesystem
require-probes.yaml                # Liveness and readiness probes on all Deployments
```

**Exclusions:** ARC runner pods require privileged DinD sidecar — create a Kyverno exception for pods in the `arc-system` namespace with `dind` container name.

These policies are also enforced at CI time via the [Standards Compliance](standards-compliance.md) checks (Tier 1: Manifest Validation), providing shift-left enforcement before admission control.

### 2. Image Signing

- Sign images with **cosign** in CI after GHCR push
- Verify signatures with Kyverno `verifyImages` policy in-cluster
- Store signatures in GHCR alongside images

### 3. Dependency Scanning

- Add `npm audit` / `trivy` scanning in CI for all product repos
- Add Dependabot or Renovate for automated dependency updates
- Pin GitHub Action versions to commit SHA

### 4. Production Network Policies

Extend NetworkPolicies from staging to production:
- Default-deny ingress per namespace
- Allow only expected traffic (Traefik → app, app → database, app → [Redis](https://redis.io/docs/))
- Restrict egress to known external endpoints

### 5. Audit Log Centralization

Aggregate audit logs into [Loki](https://grafana.com/docs/loki/latest/):
- ArgoCD audit events
- Doppler audit logs (via API polling or webhook)
- GitHub audit log (via API polling)
- Kubernetes audit log ([K3s](https://docs.k3s.io/) audit policy)

Create a Grafana dashboard for security-relevant events.

### 6. Compliance Framework

Compliance management is centralized in [`dk-compliance-v2`](https://github.com/data-kinetic/dk-compliance-v2), covering five frameworks across two entities:

| Entity | Frameworks | Status |
|--------|-----------|--------|
| BehaviorLabs.ai | SOC 2 Type II, HIPAA, ISO 27001 | SOC 2 in progress (Phase 02 — migration from Drata to [CISO Assistant](https://github.com/intuitem/ciso-assistant-community)) |
| Data Kinetic Corporation | NIST 800-171 rev3, CMMC Level 2 | Not started (Phase 04) |

**Platform controls that satisfy compliance requirements:**
- **Access control:** [ArgoCD](https://argo-cd.readthedocs.io/) AppProject RBAC, namespace isolation, [Doppler](https://docs.doppler.com/) role-based access
- **Audit logging:** [Kubernetes](https://kubernetes.io/docs/) audit logs, GitHub audit log (API polling), [Grafana](https://grafana.com/docs/grafana/latest/) security dashboard (planned)
- **Change management:** GitOps-only deployments, PR review gates, standards compliance CI checks
- **Encryption at rest:** [PostgreSQL](https://www.postgresql.org/docs/) volume encryption, [SeaweedFS](https://github.com/seaweedfs/seaweedfs) server-side encryption, [Redis](https://redis.io/docs/) AOF on encrypted volumes
- **MFA:** Required for GitHub, Doppler, Grafana, [Proxmox](https://pve.proxmox.com/pve-docs/) admin accounts
- **Supply chain:** SBOM generation, provenance attestation, image scanning via CI

See [Compliance & Attestation](compliance-and-attestation/) for the full program overview, phase plan, and ownership matrix.

## Related Documentation

- [Secrets Management](secrets-management.md) — Doppler operator, rotation
- [Infrastructure](infrastructure.md) — namespace isolation, network setup
- [CI/CD Pipelines](ci-cd-pipelines.md) — supply chain, SBOM, image builds
- [Standards Compliance](standards-compliance.md) — CI/CD standards enforcement (shift-left for Kyverno policies)
- [PR Review Service](pr-review-service.md) — automated PR security review
- [Disaster Recovery](disaster-recovery.md) — backup and access controls
