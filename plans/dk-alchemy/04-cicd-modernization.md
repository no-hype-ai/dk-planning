# CI/CD Modernization

## Context

Each repository maintains its own CI pipeline with duplicated build-deploy logic. No shared reusable workflow exists, so changes to the build process (e.g., adding SBOM generation or image signing) must be replicated across every repo manually. Standards compliance is defined in planning docs but not enforced via CI. Self-hosted runners are planned but not deployed — all workflows run on GitHub-hosted runners with limited resources. No automated dependency update system exists.

See `../../docs/ci-cd-pipelines.md` for the pipeline design, `../../docs/standards-compliance.md` for the 4-tier compliance framework, and `../../docs/self-hosted-runners-and-webhooks.md` for the ARC runner specification.

## Scope

- Create shared reusable build-deploy workflow in `data-kinetic/.github`
- Implement standards compliance CI checks (4 tiers)
- Deploy ARC v2 self-hosted runners (3 runner classes)
- Set up Renovate for automated dependency updates
- Standardize kubeconform/kustomize validation across all repos

## Dependencies

- None (independent workstream, but unlocks Plan 03 shift-left: CI catches violations before Kyverno blocks them at admission time)

## Current State (audited 2026-03-23)

> **Phase 3 (ARC runners) is COMPLETE.** All 3 runner classes deployed with correct specs.
> Note: Implementation went runners-first (Option A), not shared-workflows-first (Option B recommended).
> Before executing remaining phases, verify current state.

**Implemented (on main as of `07e5c6a`):**
- `k8s/infrastructure/arc-controller/base/` + `overlays/prod/` — ARC controller Helm chart v0.9.3
- `k8s/infrastructure/arc-runners/base/` — All 3 runner classes (standard, large, gpu)
- `grafana/dashboards/infrastructure/arc-runners.json` — Runner metrics dashboard

**Validation findings:**
- VALIDATED: runner-standard: 2-4 CPU, 4-8 Gi, max 10 replicas, penguin node affinity
- VALIDATED: runner-large: 8-16 CPU, 32-64 Gi, max 5 replicas, penguin node affinity
- VALIDATED: runner-gpu: 4-8 CPU, 16-32 Gi + 1 GPU, max 4 replicas, krang node affinity
- VALIDATED: DinD sidecars configured on all runners with shared Docker socket volumes
- VALIDATED: Dashboard exists with runner metrics
- GAP: `grafana/alerts/arc-runners.yaml` NOT created (plan step 16)
- GAP: Shared org-level workflows NOT created (Phase 1-2)
- GAP: Renovate NOT configured (Phase 4)

## Existing Work

- **dk-alchemy specs:** `001-argocd-lifecycle-scripts` (operational scripts pattern)
- **dk-alchemy:** `.github/workflows/` has 12 workflows (validation, builds, Grafana sync)
- **dk-alchemy issues:** #27 (CI/CD gaps), #28 (image signing in CI)
- **dk-planning docs:** `../../docs/ci-cd-pipelines.md`, `../../docs/standards-compliance.md`, `../../docs/self-hosted-runners-and-webhooks.md`

## Implementation Steps

### Phase 1: Shared Reusable Workflows (Week 1-3)

1. Create `data-kinetic/.github` repository (if not already exists):
   - This is GitHub's org-level shared repository for workflows, templates, and configs
   - Must be public or the org must have GitHub Enterprise for private shared workflows

2. Create reusable build-deploy workflow: `.github/workflows/build-deploy.yaml`

   **Inputs:**
   - `service_name` (required) — name of the service being built
   - `dockerfile_path` (default: `./Dockerfile`) — path to Dockerfile
   - `context` (default: `.`) — Docker build context
   - `runner_class` (default: `runner-standard`) — which ARC runner class to use
   - `push` (default: `true`) — whether to push to GHCR
   - `sign` (default: `true`) — whether to cosign the image

   **Steps:**
   1. Checkout code
   2. Set up Docker buildx
   3. Authenticate to GHCR
   4. Inject Doppler secrets as build args (if `DOPPLER_TOKEN` secret exists)
   5. Docker build with cache (GitHub Actions cache backend)
   6. Tag with: `sha-<short>`, `branch-<name>`, semantic version (if tagged), `latest` (if main)
   7. Push to GHCR
   8. cosign sign (keyless, GitHub OIDC)
   9. Generate SBOM with syft, attach to image as OCI artifact
   10. Generate provenance attestation (SLSA Level 2)
   11. Notify Platform API webhook: `POST /dk/v1/webhooks/build-complete`

3. Create reusable standards-check workflow: `.github/workflows/standards-check.yaml`

   **Inputs:**
   - `tiers` (default: `1`) — comma-separated list of tiers to check (e.g., `1,2,3`)
   - `grace_period_until` (optional) — ISO date until which failures are warnings, not errors
   - `config_path` (default: `.dk-standards.yaml`) — path to repo's standards config

   **Tier 1 — Build & Deploy Standards:**
   - kubeconform validation of all K8s manifests
   - kustomize build succeeds for all overlays
   - YAML lint (yamllint with relaxed config)
   - Required labels present in K8s manifests: `app.kubernetes.io/name`, `team`, `product`
   - No `:latest` image tags in K8s manifests
   - Resource limits defined on all containers
   - Liveness and readiness probes defined

   **Tier 2 — Observability Standards:**
   - Grafana dashboard file exists for the service (`grafana/dashboards/`)
   - Alert rules file exists (`grafana/alerts/`)
   - Dashboard JSON and alert YAML are valid
   - OTLP tracing component referenced in deployment (env var or sidecar)

   **Tier 3 — Supply Chain Standards:**
   - SBOM generation succeeds
   - Provenance attestation generated
   - All GitHub Actions pinned to SHA (no `@v*` tags)
   - Webhook notification step present in build workflow

   **Tier 4 — Runtime Standards:**
   - Health endpoints (`/health`, `/ready`) exist in service code
   - OpenTelemetry SDK imported in application code
   - No hardcoded secrets (basic pattern matching: API keys, passwords, tokens)
   - Dockerfile uses non-root user

4. Create shared standards definitions in `.github/standards/`:
   - `tier-1.yaml` — build/deploy checks with kubeconform schemas
   - `tier-2.yaml` — observability checks with expected file patterns
   - `tier-3.yaml` — supply chain checks
   - `tier-4.yaml` — runtime checks with code patterns
   - These files are consumed by the standards-check workflow and can also be used by the PR review service

5. Migrate dk-alchemy workflows to use shared workflow:
   - Replace inline Docker build steps with `uses: data-kinetic/.github/.github/workflows/build-deploy.yaml@main`
   - Add `standards-check` job to PR workflows
   - Verify all existing builds still pass

6. Update dk-template to generate repos that call shared workflows:
   - New repos created from template automatically use `build-deploy.yaml`
   - `.dk-standards.yaml` included with Tier 1 enabled, grace period of 30 days

### Phase 2: Standards Enforcement (Week 4-5)

7. Add `.dk-standards.yaml` to all active repos (starting with `behavior-labs-ai`):
   ```yaml
   version: 1
   tiers: [1]
   grace_period_until: "2026-05-01"
   exclusions:
     - path: "legacy/**"
       reason: "Legacy code, scheduled for refactor"
   ```

8. Enable Tier 1 checks across all repos:
   - PR check: required status check (blocks merge if Tier 1 fails after grace period)
   - Grace period: existing repos get 30 days to come into compliance
   - New repos (from template): no grace period

9. Progressively enable Tier 2-4:
   - Tier 2 (observability): enable after SLO dashboards are built (Plan 02)
   - Tier 3 (supply chain): enable after cosign is in all build workflows (Plan 03)
   - Tier 4 (runtime): enable for new services, grace period for existing

10. Integrate standards results with PR review:
    - Standards check posts a summary comment on PRs
    - Non-compliant tiers listed with specific failures and remediation guidance
    - Links to relevant docs for each standard

### Phase 3: ARC v2 Self-Hosted Runners (Week 6-8)

11. Add ARC controller Helm chart: `dk-alchemy/k8s/infrastructure/arc-controller/`
    - `base/kustomization.yaml` — HelmRelease for `gha-runner-scale-set-controller`
    - `base/values.yaml` — controller config, resource limits
    - `overlays/prod/kustomization.yaml` — production overrides

12. Create AutoscalingRunnerSets: `dk-alchemy/k8s/infrastructure/arc-runners/`

    | Runner Class | Node | vCPU | Memory | Max Replicas | Use Case |
    |-------------|------|------|--------|--------------|----------|
    | `runner-standard` | penguin | 2-4 | 4-8 Gi | 10 | Lint, test, small builds |
    | `runner-large` | penguin | 8-16 | 32-64 Gi | 5 | Large Docker builds, integration tests |
    | `runner-gpu` | krang | 4-8 | 16-32 Gi + 1 GPU | 4 | ML training, model evaluation |

    Each runner set includes:
    - `autoscalingrunnerset.yaml` — scale-to-zero, min/max replicas
    - `runner-template.yaml` — pod spec with DinD sidecar, resource limits

13. Configure DinD (Docker-in-Docker) sidecar for Docker builds:
    - Sidecar container running `docker:dind`
    - Shared volume for Docker socket
    - Runner container mounts Docker socket
    - Note: DinD sidecar requires root — add Kyverno exception for `arc-system` namespace

14. Add NetworkPolicy for ARC runners:
    - Egress allowlist: GHCR (`ghcr.io`), npm registry, PyPI, GitHub API (`api.github.com`)
    - Deny egress to internal cluster services (runners should not access production workloads)
    - Allow egress to Doppler API for secret injection during builds

15. Create Grafana dashboard: `dk-alchemy/grafana/dashboards/infrastructure/arc-runners.json`
    - Active runners by class
    - Queue depth (pending workflow jobs)
    - Job duration distribution
    - Runner utilization (CPU/memory)
    - Scale-up/scale-down events
    - Cost attribution by repository/workflow

16. Create alert rules: `dk-alchemy/grafana/alerts/arc-runners.yaml`
    - Queue depth > 5 for > 10 minutes (runners not scaling fast enough)
    - Runner pod crash loop
    - Runner class at max capacity for > 30 minutes

17. Migration path (gradual, repo by repo):
    1. dk-alchemy — migrate validation and build workflows to `runner-standard`
    2. behavior-labs-ai — migrate builds to `runner-large`, ML jobs to `runner-gpu`
    3. Remaining repos — migrate to `runner-standard`
    4. GPU workflows — migrate to `runner-gpu` on krang node
    5. Decommission Megatron runners after all workflows are migrated

### Phase 4: Renovate (Week 9-10)

18. Deploy Renovate:
    - Option: self-hosted Renovate on ARC `runner-standard` (CronJob, runs every 6 hours)
    - Alternative: Mend Renovate GitHub App (SaaS, zero maintenance)
    - Install on all repos in `data-kinetic` org

19. Create org-level Renovate config: `data-kinetic/.github/renovate.json`

    | Dependency Type | Strategy | Frequency | Auto-merge |
    |----------------|----------|-----------|------------|
    | Docker base images | Auto-PR, pin digest | Weekly | No (manual review) |
    | npm minor/patch | Group into single PR | Weekly | Yes (if tests pass) |
    | npm major | Individual PR | Immediately | No |
    | Python minor/patch | Group into single PR | Weekly | Yes (if tests pass) |
    | Python major | Individual PR | Immediately | No |
    | GitHub Actions | Auto-PR, SHA-pinned | Immediately | No (security review) |
    | Helm charts | Auto-PR | Weekly | No |
    | K8s manifests | Auto-PR (image tags) | Immediately | No |

20. dk-template includes `renovate.json` pre-configured:
    - New repos automatically get Renovate config
    - Extends org-level config with repo-specific overrides

## dk-alchemy Changes

| Action | Path | Description |
|--------|------|-------------|
| ~~DONE~~ | `k8s/infrastructure/arc-controller/base/` | ✅ ARC controller Helm chart v0.9.3 |
| ~~DONE~~ | `k8s/infrastructure/arc-controller/overlays/prod/` | ✅ Production overrides |
| ~~DONE~~ | `k8s/infrastructure/arc-runners/base/` | ✅ All 3 runner classes (standard, large, gpu) |
| ~~DONE~~ | `k8s/infrastructure/arc-runners/overlays/prod/` | ✅ Production runner config |
| ~~DONE~~ | `grafana/dashboards/infrastructure/arc-runners.json` | ✅ Runner metrics dashboard |
| CREATE | `grafana/alerts/arc-runners.yaml` | Runner scaling and health alerts (NOT yet created) |
| MODIFY | `.github/workflows/*.yaml` | Migrate to shared reusable workflow |

## dk-org Changes (data-kinetic/.github)

| Action | Path | Description |
|--------|------|-------------|
| CREATE | `.github/workflows/build-deploy.yaml` | Reusable build-deploy workflow |
| CREATE | `.github/workflows/standards-check.yaml` | Reusable standards compliance check |
| CREATE | `standards/tier-1.yaml` | Build/deploy standards definitions |
| CREATE | `standards/tier-2.yaml` | Observability standards definitions |
| CREATE | `standards/tier-3.yaml` | Supply chain standards definitions |
| CREATE | `standards/tier-4.yaml` | Runtime standards definitions |
| CREATE | `renovate.json` | Org-level Renovate configuration |

## Verification

- `behavior-labs-ai` CI uses shared `build-deploy.yaml` workflow successfully
- Standards check runs on PR and reports tier compliance as PR comment
- Tier 1 failures block merge after grace period expires
- ARC runner pods scale up when workflow is dispatched
- ARC runner pods scale to zero within 5 minutes of last job completion
- `runner-gpu` pods schedule only on krang node (GPU nodeSelector)
- Runner NetworkPolicy blocks egress to internal cluster services
- Renovate creates weekly dependency update PRs with grouped minor/patch changes
- Renovate auto-merges npm/Python minor/patch PRs when tests pass
- kubeconform validates all K8s manifests in CI (catches invalid specs before apply)
- All repos created from dk-template automatically use shared workflows

## Options/Recommendations

### Runner Deployment Priority

**Option A: Runners first**
Deploy ARC before shared workflows. Unblocks GPU workflows and provides faster build times immediately. However, workflows still have duplicated logic.

**Option B (Recommended): Shared workflows first**
Standardize the pipeline first, then migrate to self-hosted runners. Shared workflows work on both GitHub-hosted and self-hosted runners — the `runner_class` input defaults to `ubuntu-latest` and can be switched to ARC runners later. This approach has broader impact (consistency across all repos) and is a prerequisite for consistent standards enforcement.

**Recommendation:** Option B. Pipeline standardization provides more value per effort and is the prerequisite for standards enforcement. Self-hosted runners are an optimization — the current GitHub-hosted runners work, they are just slower and more expensive for large builds. The shared workflow can be built and validated on GitHub-hosted runners, then the `runner_class` default is changed once ARC is ready.

### Renovate Deployment

**Option A (Recommended): Mend Renovate GitHub App**
Zero-maintenance SaaS. Free for open-source and reasonable pricing for private repos. No infrastructure to manage.

**Option B: Self-hosted Renovate**
Run on ARC runner as a CronJob. Full control, no external dependency. Requires maintenance and monitoring.

**Recommendation:** Start with Mend Renovate App for speed, migrate to self-hosted if cost or control becomes an issue. The config format is identical for both.
