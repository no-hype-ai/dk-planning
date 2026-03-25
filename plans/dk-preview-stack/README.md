# dk-preview-stack Implementation Plans

## Overview

Plans for standardizing the preview stack on VM101 (preview-stack). VM101 runs 15 Docker Compose projects with 56 containers across standard (`/opt/dk-previews/active/`, `/opt/dk-production/`) and legacy directories. These plans address the current state, security concerns, and path to standardization via the Platform API and dk-cli.

## Plans

| # | Plan | Priority | Status |
|---|------|----------|--------|
| 01 | [VM101 Assessment](01-vm101-assessment.md) | — | Complete (2026-03-23) |
| 02 | [Standardization Plan](02-standardization-plan.md) | High | In Progress — Phases 0-2 complete, 3-5 partial/pending |
| 03 | [Migration Status & Gaps](03-migration-status-and-gaps.md) | High | Active (2026-03-24) |

## Current State (Live Audit 2026-03-24)

| Metric | Value |
|--------|-------|
| Compose projects | 15 |
| Running containers | 56 |
| RAM | 64 GiB allocated / 62 GiB usable (balloon 32 GiB). Was never 125 GiB — docs were wrong. |
| Disk | 53% (257 GB / 485 GB) |
| Load average | 0.19 / 16 cores |
| API-managed previews | 0 (all `managed: false`) |
| Unmigrated projects | 2 (ghost-cal, ut-san-antonio-oncology) |
| Containers in restart loop | 2 (carbon-app, carbon-api) |
| Unhealthy containers | 1 (surgeo-app) |

## Key Findings

- VM101 runs 56 containers across 15 Compose projects (down from 59)
- **Phases 0-2 complete:** UFW active, disk at 53%, load 0.19, databases on 127.0.0.1, network isolation applied
- **Phase 3 partial:** Platform API endpoints merged (PR #342) but not end-to-end functional — missing NPM proxy automation, Doppler injection, and SSH key in Doppler
- **Phase 4 not started:** dk-cli preview commands
- **Phase 5 partial:** Grafana dashboard (PR #350) + alerts + cleanup cron done; webhook registration and PR comment bot not done
- Platform API connectivity verified (health check returns OK from VM101)
- RAM is 64 GiB (Proxmox `memory: 65536`, balloon 32 GiB) — original docs claiming 125 GiB were always wrong

## Dependencies

- [Platform API](../dk-alchemy/01-platform-api.md) — previews.py endpoint completion (NPM + Doppler gaps)
- [dk-cli PRD](../dk-alchemy/12-dk-cli-prd.md) — `dk preview` commands
- [Preview Environments doc](../../docs/preview-environments.md) — target state spec
- [Preview Standardization (dk-alchemy)](../dk-alchemy/08-preview-standardization.md) — cross-repo coordination

## Related Documentation

- [Preview Environments](../../docs/preview-environments.md)
- [Platform API](../../docs/platform-api.md)
- [dk-cli](../../docs/dk-cli.md)
- [Infrastructure](../../docs/infrastructure.md)
