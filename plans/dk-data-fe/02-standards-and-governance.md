# Plan 02: Standards & Governance

## Goal

Add `.dk-standards.yaml`, the standards check CI workflow, and issue governance labels to dk-data-fe, making it visible to automated platform compliance checks.

## Current State

| Area | Current | Target |
|------|---------|--------|
| Standards config | No `.dk-standards.yaml` | Tier 1+2 compliance config with grace period |
| Standards CI | No `standards.yaml` workflow | Shared workflow from `data-kinetic/.github` |
| Issue labels | Default GitHub labels only | Full governance taxonomy (status/, priority/, team/) |
| CI runners | `ubuntu-latest` | ARC v2 self-hosted (when ready) |
| Dependency management | None configured | Renovate (when applicable) |

## Dependencies

| Dependency | Plan | Status | Blocking |
|-----------|------|--------|----------|
| Shared `standards-check.yaml` workflow | [dk-alchemy/04](../dk-alchemy/04-cicd-modernization.md) | Not started | Standards workflow |
| Org-level governance workflows | [dk-alchemy/09](../dk-alchemy/09-governance-extraction.md) | Not started | Label sync automation |
| ARC v2 runner classes | [dk-alchemy/04](../dk-alchemy/04-cicd-modernization.md) Phase 3 | Complete | CI runner migration |
| Plan 01 audit complete | [01-platform-alignment-audit.md](01-platform-alignment-audit.md) | Not started | Gap verification |

---

## Workstream 1: Standards Compliance Config

### Step 1: Create `.dk-standards.yaml`

```yaml
# dk-data-fe standards compliance configuration
product: dk-data
team: data-platform
tier: 2                           # Tier 3 deferred — complex CronJob topology
grace_period_until: "2026-06-30"  # Warn-only during initial alignment
```

Tier rationale:
- **Tier 1** (structure): `.gitops/`, `k8s/`, Kustomize overlays, health endpoints — all present
- **Tier 2** (operations): CI/CD, Doppler, OTel, probes — all present; standards workflow + labels are gaps being closed here
- **Tier 3** (advanced): SLO dashboards, Grafana provisioned dashboards, Kustomize components — deferred to Plan 04 and carbon-5 migration

### Step 2: Add `standards.yaml` Workflow

```yaml
# .github/workflows/standards.yaml
name: Standards Check
on:
  pull_request:
    branches: [main, staging]

jobs:
  standards:
    uses: data-kinetic/.github/.github/workflows/standards-check.yaml@main
    with:
      product-name: dk-data
```

If the shared workflow is not yet available (dk-alchemy/04 dependency), add a stub that validates:
- `.dk-standards.yaml` exists and is valid YAML
- `kubectl kustomize k8s/overlays/prod` renders without errors
- `kubectl kustomize k8s/overlays/staging` renders without errors

---

## Workstream 2: Issue Governance Labels

### Step 3: Create Label Taxonomy

Add the full governance label set matching [docs/issue-governance.md](../../docs/issue-governance.md):

**Status labels:**
- `status/triage` (color: #d4c5f9)
- `status/in-progress` (color: #0e8a16)
- `status/in-review` (color: #fbca04)
- `status/done` (color: #006b75)
- `status/blocked` (color: #e11d48)

**Priority labels:**
- `priority/P0` (color: #b60205) — production down
- `priority/P1` (color: #d93f0b) — major impact
- `priority/P2` (color: #e99695) — moderate impact
- `priority/P3` (color: #c2e0c6) — minor impact
- `priority/P4` (color: #bfdadc) — nice to have

**Team labels:**
- `team/data-platform` (color: #1d76db)

**Category labels:**
- `platform-alignment` (color: #5319e7) — platform standardization work

```bash
# Batch creation
for label in "status/triage:#d4c5f9" "status/in-progress:#0e8a16" "status/in-review:#fbca04" \
  "status/done:#006b75" "status/blocked:#e11d48" "priority/P0:#b60205" "priority/P1:#d93f0b" \
  "priority/P2:#e99695" "priority/P3:#c2e0c6" "priority/P4:#bfdadc" \
  "team/data-platform:#1d76db" "platform-alignment:#5319e7"; do
  name="${label%%:*}"
  color="${label##*:#}"
  gh label create "$name" --color "$color" --repo data-kinetic/dk-data-fe 2>/dev/null || \
    echo "Label $name already exists"
done
```

---

## Workstream 3: CI Runner Evaluation

### Step 4: Evaluate ARC v2 Migration

Current CI requirements:
- PostgreSQL service container (pgvector:pg16) for tests
- Docker-in-Docker for container builds
- `kubectl` for manifest validation

Decision criteria:
- If ARC v2 runners support Docker service containers → migrate `runs-on` to `[self-hosted, linux, standard]`
- If not → defer to carbon-5 migration and document as known gap

No changes needed if ARC v2 doesn't support service containers yet.

---

## Files to Create/Modify

```
dk-data-fe/
├── .dk-standards.yaml                    (new)
└── .github/workflows/standards.yaml      (new)
```

## Verification

- [ ] `.dk-standards.yaml` exists and `yq` parses it successfully
- [ ] `standards.yaml` workflow runs on PR and reports results
- [ ] All governance labels present: `gh label list --repo data-kinetic/dk-data-fe | grep -c 'status\|priority\|team'` returns 12+
- [ ] Decision documented for CI runner migration

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Shared workflow not yet available | Stub workflow validates manifests locally |
| Grace period expires before hardening complete | Set generous grace period (3 months); extend if needed |
| Label conflicts with existing labels | `gh label create` is idempotent — skips existing labels |
