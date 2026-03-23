# Security Hardening

## Context

No admission controller is deployed, production NetworkPolicies do not exist, images are not signed, and there are no centralized audit logs. Security is convention-based only — nothing prevents deploying a `:latest` image, running as root, or omitting resource limits. The compliance program (`dk-compliance-v2`) requires demonstrable technical controls for SOC 2, HIPAA, and NIST 800-171. Without these controls, compliance evidence is manual and incomplete.

See `../../docs/security-and-compliance.md` for the full security design including policy definitions and `../../docs/standards-compliance.md` for the standards tiers that map to Kyverno policies.

## Scope

- Deploy Kyverno in 3-phase rollout (audit -> staging enforce -> prod enforce)
- Extend NetworkPolicies from staging to production
- Implement image signing with cosign in CI
- Centralize audit logs (ArgoCD, Doppler, GitHub, K8s API server) into Loki
- Pin all GitHub Action versions to SHA across the org

## Dependencies

- **Plan 04 (CI/CD Modernization):** Standards compliance checks should be in CI before Kyverno enforces at runtime. This creates a shift-left pattern where developers get CI feedback before admission blocks their deployment. Kyverno audit mode (Phase 1) can proceed independently.

## Existing Work

- **dk-alchemy issues:** #29 (Kyverno admission controller), #28 (image signing with cosign)
- **dk-alchemy:** `k8s/infrastructure/staging-isolation/` has NetworkPolicies for staging namespace
- **dk-alchemy specs:** `002-k3s-infra-hardening` references security baseline requirements
- **dk-planning docs:** `../../docs/security-and-compliance.md` (full design with policy list)

## Implementation Steps

### Phase 1: Kyverno Audit Mode (Week 1-2)

1. Add Kyverno Helm chart to `dk-alchemy/k8s/infrastructure/kyverno/`:
   - `base/kustomization.yaml` — HelmRelease referencing Kyverno Helm chart
   - `base/values.yaml` — replicas=3, resource limits, admission webhook config
   - `overlays/prod/kustomization.yaml` — production overrides

2. Deploy Kyverno in **audit mode** (`validationFailureAction: Audit` on all policies)

3. Create cluster policies in `dk-alchemy/k8s/infrastructure/kyverno/policies/`:

   | Policy File | Rule | Description |
   |------------|------|-------------|
   | `require-resource-limits.yaml` | All containers must have CPU and memory limits | Prevents noisy-neighbor resource exhaustion |
   | `restrict-image-registries.yaml` | Images must come from `ghcr.io/data-kinetic/*` | Prevents pulling from untrusted registries |
   | `require-labels.yaml` | Pods must have `team`, `service`, `product` labels | Required for alert routing and cost attribution |
   | `disallow-latest-tag.yaml` | Image tag `:latest` is prohibited | Ensures reproducible deployments |
   | `require-run-as-non-root.yaml` | `runAsNonRoot: true` required | CIS benchmark 5.2.6 |
   | `require-read-only-rootfs.yaml` | `readOnlyRootFilesystem: true` required | Prevents runtime filesystem modification |
   | `require-probes.yaml` | Liveness and readiness probes required | Ensures K8s can health-check workloads |

4. Add namespace exclusions:
   - `arc-system` — ARC DinD sidecar requires root and writable rootfs
   - `kube-system` — system components managed by K3s
   - `kyverno` — Kyverno's own namespace

5. Create PolicyReport dashboard in Grafana: `dk-alchemy/grafana/dashboards/infrastructure/kyverno.json`
   - Violations by policy, namespace, and severity
   - Trend of violations over time (should decrease as workloads are fixed)
   - Top offending workloads

6. Monitor violations for 2 weeks:
   - Review PolicyReports daily
   - Fix false positives by adjusting policy rules or adding targeted exceptions
   - Track workloads that need remediation before enforcement

### Phase 2: Staging Enforcement (Week 3-4)

7. Switch to `Enforce` on staging namespaces:
   - Update policy `match` to target staging namespaces with `validationFailureAction: Enforce`
   - Keep audit mode on production namespaces
   - This validates that all staging workloads comply before touching production

8. Verify all staging workloads deploy successfully under enforcement

9. Add policy exception mechanism:
   - `PolicyException` resources for legitimate cases (e.g., init containers needing root)
   - Exceptions require `team` label and expiration date
   - Exceptions are tracked in PolicyReport dashboard

### Phase 3: Production Enforcement (Week 5)

10. Switch to `Enforce` on production namespaces:
    - Gradual rollout: one namespace at a time, starting with lowest-risk
    - Monitor for blocked deployments
    - Rollback plan: switch back to Audit if critical deployment is blocked

11. Add Kyverno to DR bootstrap sequence:
    - After cert-manager, before application workloads
    - Ensures security baseline is established before any workload deploys during recovery

### Phase 4: Production NetworkPolicies (Week 6-7)

12. Create production NetworkPolicies in `dk-alchemy/k8s/infrastructure/network-policies/`:

    **Default deny for all production namespaces:**
    ```
    # default-deny-ingress.yaml — applied to each production namespace
    kind: NetworkPolicy
    spec:
      podSelector: {}
      policyTypes: [Ingress]
    ```

    **Allow rules:**
    | Rule | From | To | Port |
    |------|------|----|------|
    | Traefik to apps | `traefik` namespace | app pods (label selector) | 8080 |
    | Apps to PostgreSQL | app pods | `cnpg-system` pods | 5432 |
    | Apps to Redis | app pods | Redis pods | 6379 |
    | Apps to OTLP | app pods | `otlp-collector` pods | 4317, 4318 |
    | Apps to LiteLLM | app pods | LiteLLM ExternalName service | 4000 |
    | Grafana to Mimir | Grafana pods | Mimir pods | 9009 |
    | Alloy to Loki | Alloy pods | Loki pods | 3100 |

13. Test with traffic validation before enforcing:
    - Deploy NetworkPolicies in a test namespace first
    - Run integration tests to verify all expected traffic flows
    - Check for broken connections in application logs
    - Deploy to production namespace-by-namespace

### Phase 5: Image Signing with cosign (Week 8)

14. Add cosign sign step to all build workflows in `dk-alchemy/.github/workflows/`:
    - After Docker build and GHCR push
    - Use keyless signing (Fulcio + Rekor) tied to GitHub OIDC identity
    - Signatures stored in GHCR alongside images (OCI artifact)

15. Sign all existing production images:
    - One-time script to pull, sign, and push signatures for current images
    - Verify signatures with `cosign verify`

16. Add Kyverno image verification policy: `dk-alchemy/k8s/infrastructure/kyverno/policies/verify-image-signatures.yaml`
    - Verify cosign signature on all images in production namespaces
    - Key: GitHub OIDC issuer for `data-kinetic` org
    - Start in **Audit** mode, move to Enforce after all images are signed

17. Move to Enforce once all production images have valid signatures

### Phase 6: Audit Log Aggregation (Week 9-10)

18. Configure ArgoCD audit event forwarding to Loki:
    - Modify ArgoCD ConfigMap to enable audit logging
    - Alloy pipeline to scrape ArgoCD audit logs and ship to Loki
    - Structured labels: `event_type`, `user`, `application`, `action`

19. Set up Doppler audit log polling:
    - Alloy plugin or CronJob: poll Doppler Audit API every 5 minutes
    - Ship events to Loki with labels: `event_type`, `user`, `project`, `config`
    - Track: secret access, secret changes, config changes, user access

20. Configure K3s API server audit policy:
    - `--audit-policy-file` with rules for sensitive resources (Secrets, RBAC, Namespaces)
    - Audit log shipped to Loki via Alloy
    - Track: who accessed which secrets, RBAC changes, namespace operations

21. Create security events dashboard: `dk-alchemy/grafana/dashboards/infrastructure/security-events.json`
    - Unified view across all audit sources
    - Filters: time range, source (ArgoCD/Doppler/K8s), user, action type
    - Anomaly detection: unusual access patterns, off-hours activity
    - Compliance evidence: exportable audit trails for SOC 2 auditors

### Phase 7: GitHub Action SHA Pinning (Week 10)

22. Audit all GitHub Actions workflows across the `data-kinetic` org:
    - Identify all `uses:` directives with `@v*` version tags
    - Map each to the corresponding commit SHA for the current version

23. Replace `@v*` tags with commit SHA pins:
    - Example: `actions/checkout@v4` -> `actions/checkout@<sha>`
    - Add inline comment with version for readability: `# v4.1.1`

24. Add Renovate rule to auto-PR on new Action versions:
    - Track SHA-pinned actions
    - Auto-create PR when new version is released
    - PR includes changelog and diff for security review

## dk-alchemy Changes

| Action | Path | Description |
|--------|------|-------------|
| CREATE | `k8s/infrastructure/kyverno/base/` | Helm chart, values, kustomization |
| CREATE | `k8s/infrastructure/kyverno/policies/` | 7+ ClusterPolicy YAML files |
| CREATE | `k8s/infrastructure/kyverno/overlays/prod/` | Production overrides |
| CREATE | `k8s/infrastructure/network-policies/` | Production NetworkPolicy manifests per namespace |
| CREATE | `grafana/dashboards/infrastructure/kyverno.json` | Policy violations dashboard |
| CREATE | `grafana/dashboards/infrastructure/security-events.json` | Unified audit log dashboard |
| MODIFY | `.github/workflows/*.yaml` | Add cosign sign step after GHCR push |
| MODIFY | `.github/workflows/*.yaml` | Pin all Action `uses:` to commit SHA |
| MODIFY | `k8s/infrastructure/argocd/` | Enable audit log forwarding to Loki |

## Verification

- Kyverno PolicyReports show zero violations in production namespaces
- Deploying a `:latest` image to production is **blocked** with clear error message
- Deploying a container without resource limits is **blocked**
- Deploying a container running as root is **blocked** (except in excluded namespaces)
- Production namespaces have default-deny ingress NetworkPolicy
- Application traffic still flows correctly (Traefik -> apps -> databases)
- `cosign verify` passes for all production images in GHCR
- Security events dashboard shows audit trails from ArgoCD, Doppler, and K8s API server
- All GitHub Actions across the org are pinned to commit SHA
- Compliance audit can pull 90-day audit trail from Loki for SOC 2 evidence

## Options/Recommendations

### Admission Controller

**Option A (Recommended): Kyverno**
Kubernetes-native policies written in YAML, no Rego learning curve. Supports image verification natively (cosign integration built-in). Generate and mutate policies in addition to validate. Active community and CNCF incubating project.

**Option B: OPA Gatekeeper**
More mature project, policies written in Rego (general-purpose policy language). More flexible for complex logic but steeper learning curve. Does not natively support image verification — requires separate admission webhook for cosign.

**Option C: Kubewarden**
Policies as WebAssembly modules. Very flexible (write policies in any language that compiles to Wasm) but smaller community and less battle-tested.

**Recommendation:** Kyverno. It aligns with the existing docs, the YAML-based policies match the team's skill set, and the built-in cosign image verification eliminates the need for a separate admission controller for image signing. The audit-to-enforce rollout pattern is well-documented in Kyverno's own guides.
