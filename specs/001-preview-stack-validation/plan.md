# Implementation Plan: Preview Stack Validation & Migration

**Branch**: `001-preview-stack-validation` | **Date**: 2026-03-25 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-preview-stack-validation/spec.md`

## Summary

Standardize all 12 preview projects on VM101 to use `docker-compose.preview.yaml`, validate the Platform API → dk-cli → VM101 pipeline end-to-end, build drift detection, harden security, and align dk-template — all with zero data loss. This is a multi-repo coordination effort spanning dk-alchemy (API + CLI code), dk-template (scaffolding), 12 product repos (compose files), and VM101 (in-place migration).

## Technical Context

**Language/Version**: Python 3.11 (Platform API), TypeScript/Node 20 (dk-cli), Bash (migration scripts, drift detection)
**Primary Dependencies**: FastAPI, asyncssh, Commander.js, Docker Compose, Doppler CLI, NPM API
**Storage**: Docker volumes (Postgres, Redis, MinIO) on VM101; `.preview-meta.json` metadata files
**Testing**: Manual E2E validation (API smoke tests, dk-cli commands, webhook lifecycle); pre/post migration data audits (row counts via psql)
**Target Platform**: VM101 (Ubuntu 22.04, Docker 29.2.1), K3s cluster (Platform API pod), macOS (developer workstations)
**Project Type**: Multi-repo infrastructure coordination (not a single application)
**Performance Goals**: Preview creation < 3 minutes, preview URL accessible within 2 minutes of compose start
**Constraints**: Max 15 concurrent previews, VM101 resources (16 vCPU, 64 GiB RAM, 485 GB disk at 20% usage)
**Scale/Scope**: 12 preview projects, 2 production apps, 55 containers, 4 GitHub orgs

## Constitution Check

*No constitution file found. Proceeding without gate checks.*

## Project Structure

### Documentation (this feature)

```text
specs/001-preview-stack-validation/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research findings
├── data-model.md        # Entity definitions
├── quickstart.md        # Execution guide
├── contracts/
│   ├── drift-detection.md   # Drift API + CLI contract
│   └── migration-audit.md   # Data audit procedure
├── checklists/
│   └── requirements.md      # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (across repos)

```text
dk-alchemy (Platform API + dk-cli)
├── src/platform-api/src/platform_api/
│   ├── routers/previews.py      # MODIFY: Add port allocation, GitHub App auth
│   ├── routers/webhooks.py      # MODIFY: Switch PAT → GitHub App tokens
│   ├── routers/drift.py         # NEW: Drift detection endpoint
│   └── config.py                # MODIFY: Remove DK_GITHUB_PAT, ensure App fields
└── src/dk-cli/src/commands/
    ├── preview.ts               # MODIFY: Add `drift` subcommand
    └── promote.ts               # No changes (out of scope)

dk-template (scaffolding)
├── docker-compose.preview.yaml  # MODIFY: ${APP_PORT:-{{port}}} binding
├── doppler.yaml                 # NEW: project/config template
└── scripts/init.sh              # MODIFY: Add dk-preview topic step

12 product repos (each gets):
├── docker-compose.preview.yaml  # NEW per repo
├── doppler.yaml                 # NEW per repo
└── .dk-standards.yaml           # NEW or UPDATE per repo

VM101 (in-place operations)
└── /opt/dk-previews/active/*/   # Switch compose files, update metadata
```

**Structure Decision**: This is a multi-repo coordination effort. No new project structure is created — changes are distributed across existing repos following established patterns.

## Implementation Phases

### Phase A: Unblock the API (dk-alchemy + Doppler)

**Workstream**: Code session on Mac (dk-alchemy repo)
**Dependency**: None — this phase unblocks everything else

| # | Task | Repo | Type | Risk |
|---|------|------|------|------|
| A1 | Provision Doppler secrets: `DK_NPM_ADMIN_EMAIL`, `DK_NPM_ADMIN_PASSWORD`, `DK_GITHUB_WEBHOOK_SECRET` in `dk-infrastructure/prd` | Doppler | Config | Low |
| A2 | Install dk-alchemy GitHub App on all 4 orgs (`data-kinetic-projects`, `no-hype-ai`, `ATARI-Foundation`, `Enercore-AI`) with repo permissions | GitHub | Config | Low |
| A3 | Provision `DK_GITHUB_APP_ID` and `DK_GITHUB_APP_PRIVATE_KEY` in `dk-infrastructure/prd` | Doppler | Config | Low |
| A4 | Update `previews.py`: add port allocation logic (10000-10999 range), store `host_port` in `.preview-meta.json`, set `APP_PORT` env before compose up | dk-alchemy | Code | Medium |
| A5 | Update `webhooks.py` and `previews.py`: replace `DK_GITHUB_PAT` usage with GitHub App installation token generation | dk-alchemy | Code | Medium |
| A6 | Update `config.py`: remove `DK_GITHUB_PAT` field, verify `DK_GITHUB_APP_ID` and `DK_GITHUB_APP_PRIVATE_KEY` fields exist with no defaults | dk-alchemy | Code | Low |
| A7 | Deploy updated Platform API to K3s | dk-alchemy | Deploy | Medium |
| A8 | Smoke test: `GET /dk/v1/previews/health` returns VM101 metrics | — | Validation | Low |
| A9 | Smoke test: `GET /dk/v1/previews` returns list of existing previews | — | Validation | Low |
| A10 | E2E test: Create test preview via `POST /dk/v1/previews` with dk-template repo, verify URL accessible, fetch logs, delete, confirm cleanup | — | Validation | High |

**Exit criteria**: A10 passes — full preview lifecycle works via API.

---

### Phase B: Wave 1 Migration — Simple Apps (Mac + SSH)

**Workstream**: Mixed — code session (Mac) + migration session (SSH)
**Dependency**: Phase A complete

**Projects**: stryker-intro, durva, cms-121, ut-san-antonio-oncology
**Risk**: Low — no databases, no persistent data

| # | Task | Where | Notes |
|---|------|-------|-------|
| B1 | Create `docker-compose.preview.yaml`, `doppler.yaml`, `.dk-standards.yaml` for stryker-intro | Mac (repo PR) | Use GHCR image, `${APP_PORT:-3000}`, health checks |
| B2 | SSH: Switch stryker-intro to new compose file | VM101 | `docker compose down` → `docker compose -f docker-compose.preview.yaml up -d` |
| B3 | Verify stryker-intro preview URL accessible | Mac | `curl -sf https://stryker-intro.preview.datakinetic.com` |
| B4 | Write `.preview-meta.json` for stryker-intro with `managed: true` | VM101 | |
| B5 | Test dk-cli loop: `dk preview list`, `dk preview down stryker-intro`, `dk preview up` | Mac | |
| B6 | Repeat B1-B5 for durva | Both | |
| B7 | Repeat B1-B5 for cms-121 (fix container name mismatch) | Both | Set `container_name: cms-121-app` |
| B8 | Repeat B1-B5 for ut-san-antonio-oncology | Both | Clean up stale `/home/nick/code/ut-san-antonio-oncology/` after |

**Exit criteria**: All 4 Wave 1 projects running from `docker-compose.preview.yaml`, dk-cli loop works for each.

---

### Phase C: Wave 2 Migration — Apps with Databases (Mac + SSH, careful)

**Workstream**: Migration session (Mac + SSH side-by-side)
**Dependency**: Phase B complete (migration process validated on simple apps)

**Projects**: surgeo, tavr-insight-and-profiler, va, the-real-apex
**Risk**: High — databases with data. Volume names must be preserved.

| # | Task | Where | Notes |
|---|------|-------|-------|
| C0 | **surgeo FIRST**: Rotate leaked access token in `.git/config`, revoke old token, update remote URL | VM101 + GitHub | **Security prerequisite** |
| C1 | Audit each project: volume names, database names, credentials, running images | VM101 | `docker volume ls`, `docker inspect` |
| C2 | Create `docker-compose.preview.yaml` for each repo — **match existing volume names exactly** | Mac (repo PR) | Critical: wrong volume name = empty database |
| C3 | Pre-migration data audit: capture row counts per table | VM101 | `psql -c "SELECT ... FROM pg_stat_user_tables"` → `pre-migration-audit.txt` |
| C4 | Switch compose file for surgeo | VM101 | `docker compose down` (NO `--volumes`) → compose up with new file |
| C5 | Post-migration data audit: compare row counts | VM101 | `diff pre-migration-audit.txt post-migration-audit.txt` — must show zero diff |
| C6 | Verify surgeo preview URL accessible with existing data | Mac | |
| C7 | Repeat C1-C6 for tavr-insight-and-profiler | Both | Preserve `meadow-db` volume, remove `meadow-network` |
| C8 | Confirm va branch (`001-va-disability-calculator`) is intentional | User decision | Record in `.preview-meta.json` |
| C9 | Repeat C1-C6 for va | Both | Uses pgvector 0.8.0-pg17, remove `va_internal` network |
| C10 | Repeat C1-C6 for the-real-apex | Both | Already uses default network, add health checks |

**Exit criteria**: All 4 Wave 2 projects running from `docker-compose.preview.yaml`, data audits show zero differences, dk-cli loop works for each.

---

### Phase D: Wave 3 Migration — Multi-Service Apps (Mac + SSH, most complex)

**Workstream**: Migration session (Mac + SSH side-by-side)
**Dependency**: Phase C complete

**Projects**: ghost-cal, rose-and-berg, dayone-rili-synthetics, ground-truth-charlie
**Risk**: High — multiple services, multiple volumes, custom networks

| # | Task | Where | Notes |
|---|------|-------|-------|
| D1 | Confirm ghost-cal branch (`fix/add-database-migrations`) is intentional | User decision | |
| D2 | Audit each project: all volumes, all services, all networks, all ports | VM101 | Thorough audit — these are complex |
| D3 | Create `docker-compose.preview.yaml` for each repo — match ALL volume names | Mac (repo PR) | Multiple volumes per project |
| D4 | Pre-migration data audit for each project | VM101 | Postgres tables + verify MinIO data accessible where applicable |
| D5 | Migrate ghost-cal: switch compose, verify all 4 services start | VM101 | Clean up stale `/home/ubuntu/code/ghost-cal/` after |
| D6 | Post-migration audit + URL verification for ghost-cal | Both | |
| D7 | Migrate rose-and-berg: switch from `docker-compose.dev.yml`, consolidate 2 networks | VM101 | Currently on `docker-compose.dev.yml` not `.yml` |
| D8 | Post-migration audit + URL verification for rose-and-berg | Both | |
| D9 | Migrate dayone-rili-synthetics: handle MinIO + Postgres + Redis volumes | VM101 | 5 containers, 2 custom networks |
| D10 | Post-migration audit + URL verification for dayone-rili-synthetics | Both | |
| D11 | Migrate ground-truth-charlie: rename `docker-compose-preview.yaml` → `docker-compose.preview.yaml` | VM101 + repo | Only project with existing preview yaml (hyphenated) |
| D12 | Post-migration audit + URL verification for ground-truth-charlie | Both | 6 containers — most complex migration |

**Exit criteria**: All 4 Wave 3 projects running from `docker-compose.preview.yaml`, data audits pass, dk-cli loop works for each.

---

### Phase E: Drift Detection + Webhook Validation (dk-alchemy + Mac)

**Workstream**: Code session (dk-alchemy) then validation session (Mac)
**Dependency**: Phases B-D complete (all 12 projects migrated)

| # | Task | Repo | Notes |
|---|------|------|-------|
| E1 | Implement `routers/drift.py`: `GET /dk/v1/previews/drift` endpoint | dk-alchemy | Fetch repo file via dk-alchemy GitHub App, compare to VM101 file, return diff |
| E2 | Add `dk preview drift` subcommand to `preview.ts` | dk-alchemy | Table + JSON output modes |
| E3 | Deploy updated Platform API | dk-alchemy | |
| E4 | Run first drift report — all 12 projects should show `in-sync` | Mac | Validates both the tool and the migrations |
| E5 | Set up daily cron for drift check (06:00 UTC) | VM101 or K3s | Cron calls API endpoint, saves report |
| E6 | Register webhook on stryker-intro (simplest repo for testing) | GitHub | Using `DK_GITHUB_WEBHOOK_SECRET` |
| E7 | Open test PR on stryker-intro → verify preview auto-created, PR comment posted | Mac | |
| E8 | Push commit to test PR → verify preview recreated | Mac | |
| E9 | Close test PR → verify preview torn down, PR comment posted | Mac | |
| E10 | Add `dk-preview` topic to remaining 11 repos | GitHub | `gh repo edit --add-topic dk-preview` |
| E11 | Register webhooks on remaining repos | GitHub | Only after E6-E9 validated |

**Exit criteria**: Drift report shows 100% in-sync, webhook lifecycle works on at least one repo, daily cron is running.

---

### Phase F: Security Hardening + Cleanup (VM101 + dk-template)

**Workstream**: SSH session (VM101) + code session (dk-template)
**Dependency**: Phase E complete

| # | Task | Where | Notes |
|---|------|-------|-------|
| F1 | Enercore Platform-Core: bind all 0.0.0.0 ports to 127.0.0.1 | VM101 | SeaweedFS, Grafana, Loki, Tempo, Unleash, Alloy |
| F2 | Verify Enercore services still accessible internally after port rebind | VM101 | |
| F3 | Remove stale directories: `/home/ubuntu/code/ghost-cal`, `ground-truth-alpha`, `insights`, broken `carbon-5` symlink, `/home/nick/code/ut-san-antonio-oncology` | VM101 | Verify no containers run from these paths first |
| F4 | Remove stale Docker networks: `carbon-network`, `proxy` | VM101 | `docker network rm` |
| F5 | Decommission `actions-runner-carbon5`: unregister from GitHub, remove directory | VM101 + GitHub | |
| F6 | Update all `.preview-meta.json` with `managed: true` and realistic TTLs | VM101 | |
| F7 | dk-template: change port binding to `${APP_PORT:-{{port}}}:{{port}}` | dk-template | PR |
| F8 | dk-template: add `doppler.yaml` template (`project: {{product}}-applications`, `config: dev`) | dk-template | Same PR |
| F9 | dk-template: add `gh repo edit --add-topic dk-preview` to `init.sh` | dk-template | Same PR |
| F10 | Validate dk-template: scaffold a test repo, verify all preview files generated correctly | Mac | `dk init --product test --team test --service app:3000:node` |
| F11 | Update adoption tracking table in `dk-preview-requirements.md` — all rows fully checked | dk-planning | |
| F12 | Run final drift report — confirm 100% in-sync | Mac | Final validation |

**Exit criteria**: Zero 0.0.0.0 bindings on production apps, no leaked tokens, all stale artifacts removed, dk-template generates correct preview files, adoption table complete.

## Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Volume name mismatch during migration destroys database | Critical | Medium | Audit existing volumes BEFORE creating compose files. Match names exactly. Test on Wave 1 (no data) first. |
| Platform API SSH to VM101 fails | High | Low | Test SSH connectivity in Phase A before any migrations. Verify key format (asyncssh compatibility). |
| NPM API authentication fails | High | Medium | Get credentials from NPM admin UI on VM101:81 manually. Test with curl before API integration. |
| Port collision when running multiple previews | Medium | Medium | Implement port allocation in Phase A. Test with 2+ concurrent previews. |
| dk-alchemy GitHub App installation rejected by external orgs | Medium | Low | Contact org admins in advance. Fallback: use fine-grained PATs for external orgs only. |
| Migration causes extended downtime for a project | Medium | Low | Keep old compose file as `.bak`. Rollback procedure: `docker compose down` → `docker compose -f <old>.yml up -d`. |
| Daily drift check report is noisy (false positives) | Low | Medium | Normalize compose file comparison (ignore whitespace, comment-only changes). |

## Complexity Tracking

No constitution violations to justify — no constitution file exists.
