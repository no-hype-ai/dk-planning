# CI/CD Workflows & Standards Configuration

**Status:** Complete

## Context

Every product repo needs CI/CD workflows for building, deploying, and validating. Rather than maintaining pipeline logic in each repo, dk-template generates thin wrappers that call shared reusable workflows from `data-kinetic/.github`. Standards compliance configuration is also generated.

See [standards tiers](../../docs/standards-tiers.md) and [dk-alchemy CI/CD plan](../dk-alchemy/04-shared-workflows.md) for related context.

## Scope

- GitHub Actions workflows (build-deploy, standards check)
- `.dk-standards.yaml` configuration
- `renovate.json` for dependency automation
- `CODEOWNERS` file
- `.gitignore`

## Dependencies

- [Plan 01 (Core Scaffold)](./01-core-scaffold.md) -- these files add to the scaffold
- `data-kinetic/.github` shared workflows should exist (see [dk-alchemy plan 04](../dk-alchemy/04-shared-workflows.md))
- If shared workflows don't exist yet, templates include fallback inline steps

## Implementation Steps

### Step 1: Create `.github/workflows/build-deploy.yaml`

```yaml
name: Build & Deploy

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main, staging]

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      services: ${{ steps.filter.outputs.changes }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            {{service}}:
              - 'src/{{service}}/**'
              - 'k8s/apps/{{service}}/**'
              - 'Dockerfile'

  build:
    needs: detect-changes
    if: needs.detect-changes.outputs.services != '[]'
    strategy:
      matrix:
        service: ${{ fromJson(needs.detect-changes.outputs.services) }}
    uses: data-kinetic/.github/.github/workflows/build-deploy.yaml@main
    with:
      service_name: ${{ matrix.service }}
      product: {{product}}
    secrets: inherit
```

Note: The `detect-changes` job uses `dorny/paths-filter` to determine which services have changed. The `filters` block must be updated by `init.sh` to list each service. When multiple services are provided, `init.sh` should append filter entries for each service rather than replacing the `{{service}}` placeholder once.

### Step 2: Create `.github/workflows/standards.yaml`

```yaml
name: Standards Compliance

on:
  pull_request:
    branches: [main, staging]

jobs:
  standards:
    uses: data-kinetic/.github/.github/workflows/standards-check.yaml@main
    with:
      tiers: '1,2,3'
    secrets: inherit
```

This calls the shared standards-check workflow which validates against the tiers defined in `.dk-standards.yaml`. The shared workflow is defined in [dk-alchemy plan 04](../dk-alchemy/04-shared-workflows.md).

### Step 3: Create `.dk-standards.yaml`

```yaml
product: {{product}}
team: {{team}}
tiers: [1, 2, 3]
# grace_period_until: "2026-06-01"  # Uncomment for new repos needing ramp-up time
services:
  - name: {{service}}
    port: 3000
doppler:
  project: {{product}}-applications
```

After `init.sh` runs, the `services` list should contain one entry per `--service` argument. The init script should expand the services list accordingly rather than leaving a single `{{service}}` entry.

### Step 4: Create `renovate.json`

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["local>data-kinetic/.github:renovate-config"]
}
```

This extends the organization-wide Renovate configuration from `data-kinetic/.github`. The shared config handles:
- Auto-merging minor/patch updates
- Grouping Kubernetes-related updates
- Scheduling updates for off-peak hours

### Step 5: Create `.github/CODEOWNERS`

```
* @data-kinetic/{{team}}
k8s/ @data-kinetic/platform
.gitops/ @data-kinetic/platform
```

This ensures:
- The product team owns all files by default
- The platform team must review changes to Kubernetes manifests and GitOps configuration

### Step 6: Create `.gitignore`

```gitignore
# Dependencies
node_modules/
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/sdks

# Build output
dist/
build/
.next/
out/

# Environment & secrets
.env
.env.local
.env.*.local
.doppler/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Testing
coverage/
.nyc_output/

# Temporary
*.tmp
*.log

# dk-alchemy PR instructions (after submission)
_dk-alchemy-pr/
```

## dk-template Files Created

- `.github/workflows/build-deploy.yaml`
- `.github/workflows/standards.yaml`
- `.dk-standards.yaml`
- `renovate.json`
- `.github/CODEOWNERS`
- `.gitignore`

## Verification

- GitHub Actions workflows are valid YAML (use `actionlint` or `yamllint`)
- Standards check workflow references correct shared workflow path: `data-kinetic/.github/.github/workflows/standards-check.yaml@main`
- `.dk-standards.yaml` has correct product/team after `init.sh` runs
- `renovate.json` extends org config correctly
- `CODEOWNERS` references correct team after `init.sh` placeholder replacement
- `build-deploy.yaml` has filter entries for every service after `init.sh`
