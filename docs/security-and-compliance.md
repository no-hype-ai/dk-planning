# Security & Compliance

## Overview

This document covers the platform's security posture: RBAC, network policies, supply chain security, and compliance considerations. Much of this is currently implemented but not formally documented.

## Current State

### ArgoCD RBAC (AppProjects)

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
| Images from GHCR only | Convention (not enforced) |
| SBOM generation | Enabled in behavior-labs-ai CI |
| Provenance attestation | Enabled in behavior-labs-ai CI |
| Source map deletion post-upload | Done (Sentry) |
| No secrets in image layers | Doppler `--mount=type=secret` |
| Base image updates | <!-- TODO: Automated? --> |

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

<!-- TODO: Each gap needs investigation and a recommendation -->

### Policy Enforcement

- [ ] **No admission controller** — no OPA/Gatekeeper or Kyverno to enforce policies in-cluster
  - Should enforce: resource limits required, image source restrictions (GHCR only), required labels, no `latest` tags in prod
- [ ] **No image signing/verification** — images are not signed with cosign or Notation
- [ ] **No pod security standards** — no PodSecurityAdmission or equivalent restricting privileged containers

### Network

- [ ] **Staging isolation only** — production namespaces have no NetworkPolicies
- [ ] **No egress restrictions** — pods can reach any external endpoint
- [ ] **Edge LB hardening** — Traefik security headers, rate limiting not documented

### Supply Chain

- [ ] **GitHub Action versions unpinned** — should pin to SHA, not tag
- [ ] **No dependency audit workflow** — no automated CVE scanning of npm/Docker dependencies
- [ ] **SBOM not verified** — generated but not consumed (no SBOM-based policy enforcement)

### Compliance

- [ ] **No audit log aggregation** — Doppler, GitHub, ArgoCD audit logs not centralized
- [ ] **No access review process** — no scheduled review of who has access to what
- [ ] **No data classification** — no labeling of PII/PHI in data stores

## Recommendations

### 1. Deploy Kyverno or OPA/Gatekeeper

Add an admission controller to dk-alchemy's infrastructure:

```yaml
# Example Kyverno policies:
- require-resource-limits        # All pods must have CPU/memory limits
- restrict-image-registries      # Only ghcr.io/data-kinetic/* allowed
- require-labels                 # team, service, product labels required
- disallow-latest-tag           # No :latest in prod namespaces
- require-run-as-non-root       # No root containers
- require-read-only-rootfs      # Read-only root filesystem
```

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
- Allow only expected traffic (Traefik → app, app → database, app → Redis)
- Restrict egress to known external endpoints

### 5. Audit Log Centralization

Aggregate audit logs into Loki:
- ArgoCD audit events
- Doppler audit logs (via API polling or webhook)
- GitHub audit log (via API polling)
- Kubernetes audit log (K3s audit policy)

Create a Grafana dashboard for security-relevant events.

### 6. Compliance Framework

<!-- TODO: Determine applicable compliance frameworks (SOC 2, HIPAA, etc.) -->

If pursuing SOC 2 or similar:
- Document access control policies
- Schedule quarterly access reviews
- Enable MFA for all admin accounts (GitHub, Doppler, Grafana, Proxmox)
- Data classification for PII/PHI in PostgreSQL
- Encryption at rest for data stores

## Related Documentation

- [Secrets Management](secrets-management.md) — Doppler operator, rotation
- [Infrastructure](infrastructure.md) — namespace isolation, network setup
- [CI/CD Pipelines](ci-cd-pipelines.md) — supply chain, SBOM, image builds
- [Disaster Recovery](disaster-recovery.md) — backup and access controls
