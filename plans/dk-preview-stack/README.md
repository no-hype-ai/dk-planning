# dk-preview-stack Implementation Plans

## Overview

Plans for standardizing the preview stack on VM101 (preview-stack). VM101 currently runs 15 Docker Compose projects with 59 containers — far beyond its intended role as a preview environment. These plans address the current state, security concerns, and path to standardization via the Platform API and dk-cli.

## Plans

| # | Plan | Priority | Status |
|---|------|----------|--------|
| 01 | [VM101 Assessment](01-vm101-assessment.md) | — | ✅ Complete (2026-03-23) |
| 02 | [Standardization Plan](02-standardization-plan.md) | High | In Progress — Phase 0 complete |

## Key Findings

- VM101 runs 15 Docker Compose projects with 63 containers
- **Phase 0 stabilization complete:** UFW active, disk at 59%, load average ~4.3
- Automated cleanup installed (hourly TTL, weekly prune, daily archive)
- Health endpoint available at port 9100
- Remaining gaps: 7 Postgres + 4 Redis instances still on 0.0.0.0, Platform API not yet deployed
- Docs now reflect actual specs: 16 vCPU / 125 GiB RAM / 485 GB disk

## Dependencies

- [Platform API](../dk-alchemy/01-platform-api.md) — previews.py endpoint completion
- [dk-cli PRD](../dk-alchemy/12-dk-cli-prd.md) — `dk preview` commands
- [Preview Environments doc](../../docs/preview-environments.md) — target state spec

## Related Documentation

- [Preview Environments](../../docs/preview-environments.md)
- [Platform API](../../docs/platform-api.md)
- [dk-cli](../../docs/dk-cli.md)
- [Infrastructure](../../docs/infrastructure.md)
