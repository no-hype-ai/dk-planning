# Standards Compliance

## Overview

A tiered CI/CD standards compliance system that enforces platform conventions across all product repos. Standards are defined in a shared YAML spec in `data-kinetic/.github`, enforced via a reusable [GitHub Actions](https://docs.github.com/en/actions) workflow, and consumed by both CI checks and the [PR Review Service](pr-review-service.md).

## Architecture

```
data-kinetic/.github/
  standards/
    manifests.yaml        # Tier 1: Label, resource, probe requirements
    observability.yaml    # Tier 2: Dashboard/alert requirements
    ci-cd.yaml            # Tier 3: Workflow, SBOM, attestation requirements
    security.yaml         # Tier 4: Secret patterns, dependency rules
    documentation.yaml    # TODO policy, gap tracking
  .github/workflows/
    standards-check.yaml  # Reusable workflow (workflow_call)
```

All three capabilities (doc-gap scanner, standards checks, PR critic) read from this single source of truth.

## Standards Tiers

### Tier 1 — Manifest Validation

Required for all repos with a `k8s/` directory.

| Check | Tool | Failure Mode |
|-------|------|-------------|
| [Kubernetes](https://kubernetes.io/docs/) schema validation | [`kubeconform`](https://github.com/yannh/kubeconform) | Error |
| [Kustomize](https://kubectl.docs.kubernetes.io/references/kustomize/) build succeeds for all overlays | `kustomize build` | Error |
| YAML lint for `.gitops/` and `k8s/` | `yamllint` | Warning |
| Required labels on Deployments | Custom check | Error |
| No `:latest` tag in prod overlays | Custom check | Error |
| Resource requests and limits on all containers | Custom check | Error |
| Liveness and readiness probes defined | Custom check | Error |

**Required labels:**
- `app.kubernetes.io/name` — service name
- `team` — owning team (routes alerts, filters dashboards)
- `service` — service identifier (used in observability queries)

### Tier 2 — Observability Compliance

Required for repos that have opted into Tier 2.

| Check | Criteria | Failure Mode |
|-------|----------|-------------|
| Dashboard directory exists | `monitoring/dashboards/` with at least one valid JSON file | Warning |
| Dashboard JSON validity | Correct `uid` format (`<product>-<service>-<name>`), required `tags` array | Error |
| Alert directory exists | `monitoring/alerts/` with at least one valid YAML file | Warning |
| Alert labels | Required: `team`, `service`, `product`, `severity` | Error |
| OTLP collector referenced | `otlp-collector` component in kustomization files | Warning |

### Tier 3 — CI/CD Compliance

Required for repos that have opted into Tier 3.

| Check | Criteria | Failure Mode |
|-------|----------|-------------|
| SBOM generation enabled | `sbom: true` in [Docker](https://docs.docker.com/) build step | Warning |
| Provenance attestation enabled | `provenance: true` in Docker build step | Warning |
| GitHub Action versions pinned to SHA | No `@v*` tags, only `@sha256:...` | Warning |
| Webhook notification step present | `webhooks.datakinetic.com` call in build workflow | Error |
| No direct kustomize commits | No `update-gitops` job committing `newTag` | Error |

### Tier 4 — Code Patterns (Language-Specific)

Optional checks for application code quality.

| Check | Language | Criteria | Failure Mode |
|-------|----------|----------|-------------|
| Health endpoints | All | `/health` and `/ready` endpoints exist in source | Warning |
| Observability import | TypeScript | `@datakinetic/observability` or `@repo/observability` imported | Warning |
| No hardcoded secrets | All | No patterns matching API keys, tokens, passwords in source | Error |

## Per-Repo Configuration

Each product repo configures its standards via `.dk-standards.yaml` in the repo root. Note: [`dk-template`](https://github.com/data-kinetic/dk-template) generates this file pre-filled with the product name, team, and default tiers `[1, 2, 3]` — see [Template Repository](template-repo.md).

```yaml
# .dk-standards.yaml
product: carbon-5
team: data-platform
tiers: [1, 2, 3]
grace_period_until: "2026-06-01"  # warn-only until this date
skip_checks: []                    # specific checks to skip (e.g., "sbom-generation")
```

**Grace periods:** During the grace period, all checks run but failures are reported as warnings (non-blocking). After the grace period, failures are errors (blocking). This allows repos to adopt standards gradually.

## Reusable Workflow

The standards check runs as a reusable GitHub Actions workflow:

```yaml
# data-kinetic/.github/.github/workflows/standards-check.yaml
name: Standards Compliance Check
on:
  workflow_call:
    inputs:
      tiers:
        description: 'Comma-separated tier numbers to check'
        default: '1,2'
        type: string
      grace_period:
        description: 'Force grace period mode (warn-only)'
        default: false
        type: boolean

jobs:
  check:
    runs-on: [self-hosted, linux, standard]
    steps:
      - uses: actions/checkout@v4
      - name: Run standards checks
        uses: data-kinetic/.github/actions/standards-check@main
        with:
          tiers: ${{ inputs.tiers }}
          grace_period: ${{ inputs.grace_period }}
```

Product repos call this workflow:

```yaml
# .github/workflows/standards.yaml
name: Standards
on: [pull_request, push]
jobs:
  standards:
    uses: data-kinetic/.github/.github/workflows/standards-check.yaml@main
    with:
      tiers: '1,2,3'
```

## Integration with Other Capabilities

### Doc Gap Scanner (Capability A)

The doc-gap scanner in `dk-planning` uses the `documentation.yaml` standards definition to determine what constitutes a gap. When the scanner creates issues, they reference the relevant standard.

### PR Review Service (Capability C)

The PR critic's **Platform Standards** rubric is auto-generated from the same `standards/*.yaml` files. This ensures CI checks and PR reviews enforce identical rules. See [PR Review Service](pr-review-service.md#standards-rubric).

### [Kyverno](https://kyverno.io/docs/) (In-Cluster)

Many Tier 1 checks overlap with Kyverno admission policies (resource limits, image registries, required labels). The standards check provides shift-left enforcement in CI; Kyverno provides runtime enforcement. See [Security & Compliance](security-and-compliance.md#1-deploy-kyverno-admission-controller).

## Shared Standards Definitions

Standards are defined in YAML files that serve as the single source of truth:

```yaml
# standards/manifests.yaml
version: 1
checks:
  require-resource-limits:
    description: All containers must have CPU and memory requests and limits
    tier: 1
    severity: error
    selector:
      kind: [Deployment, StatefulSet, DaemonSet]
    rule:
      path: spec.template.spec.containers[*]
      required: [resources.requests.cpu, resources.requests.memory, resources.limits.cpu, resources.limits.memory]

  require-labels:
    description: Required labels on all Deployments
    tier: 1
    severity: error
    selector:
      kind: [Deployment]
    rule:
      path: metadata.labels
      required: [app.kubernetes.io/name, team, service]

  disallow-latest-tag:
    description: No :latest tag in production overlays
    tier: 1
    severity: error
    selector:
      path: "overlays/prod/**"
    rule:
      pattern_absent: "newTag: latest"
```

## Related Documentation

- [CI/CD Pipelines](ci-cd-pipelines.md) — where standards checks run in the CI pipeline
- [PR Review Service](pr-review-service.md) — consumes standards definitions for automated review
- [Security & Compliance](security-and-compliance.md) — Kyverno admission control (runtime enforcement)
- [Observability](observability.md) — Tier 2 observability requirements
- [Template Repository](template-repo.md) — pre-generates `.dk-standards.yaml` and standards workflow
- [Onboarding](onboarding.md) — standards check setup for new repos
- [Issue Governance](issue-governance.md) — doc-gap scanner integration
