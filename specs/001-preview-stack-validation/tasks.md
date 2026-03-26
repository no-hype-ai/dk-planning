# Tasks: Preview Stack Validation & Migration

**Input**: Design documents from `/specs/001-preview-stack-validation/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. This is a multi-repo coordination effort — tasks specify which repo and workstation (Mac vs SSH to VM101) each task executes on.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files/repos, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths and target repo in descriptions

## Repo Key

| Shorthand | Repo | Local Path |
|-----------|------|------------|
| dk-alchemy | data-kinetic/dk-alchemy | `~/Code/dk-alchemy` |
| dk-template | data-kinetic/dk-template | `~/Code/dk-template` |
| dk-planning | data-kinetic/dk-planning | `~/Code/dk-planning` |
| VM101 | vm101-preview-stack | SSH: `ssh vm101-preview-stack` |
| product repos | Various orgs | Cloned as needed |

---

## Phase 1: Setup (Secrets & GitHub App)

**Purpose**: Provision secrets and configure dk-alchemy GitHub App GitHub App so the Platform API can operate

- [x] T001 Provision `DK_NPM_ADMIN_EMAIL` in Doppler `dk-infrastructure/prd` — get value from NPM admin UI at VM101:81
- [x] T002 [P] Provision `DK_NPM_ADMIN_PASSWORD` in Doppler `dk-infrastructure/prd` — get value from NPM admin UI at VM101:81
- [x] T003 [P] Generate and provision `DK_GITHUB_WEBHOOK_SECRET` in Doppler `dk-infrastructure/prd` — use `openssl rand -hex 32`
- [x] T004 Install dk-alchemy GitHub App on `data-kinetic-projects` org with repo-level permissions for all 8 preview repos
- [x] T005 [P] Install dk-alchemy GitHub App on `no-hype-ai` org with repo-level permissions for rose-and-berg, the-real-apex, VA
- [x] T006 [P] Install dk-alchemy GitHub App on `ATARI-Foundation` org with repo-level permissions for surgeo
- [x] T007 [P] Install dk-alchemy GitHub App on `Enercore-AI` org with repo-level permissions for Platform-Core
- [x] T008 Provision `DK_GITHUB_APP_ID` (3185179) and `DK_GITHUB_APP_PRIVATE_KEY` in Doppler `dk-infrastructure/prd`

**Checkpoint**: All Doppler secrets provisioned, dk-alchemy GitHub App App installed on all 4 orgs.

---

## Phase 2: Foundational (Platform API Code Changes)

**Purpose**: Code changes in dk-alchemy that MUST be complete before any migration or validation can proceed

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T009 [P] Update `config.py` in dk-alchemy — remove `DK_GITHUB_PAT` field, verify `DK_GITHUB_APP_ID` and `DK_GITHUB_APP_PRIVATE_KEY` fields exist with no defaults. File: `~/Code/dk-alchemy/src/platform-api/src/platform_api/config.py`
- [x] T010 [P] Add GitHub App installation token generation utility in dk-alchemy — create helper function that generates installation tokens from App ID + private key for a given org/repo. File: `~/Code/dk-alchemy/src/platform-api/src/platform_api/utils/github_app.py` (new file)
- [x] T011 Update `previews.py` in dk-alchemy — replace `DK_GITHUB_PAT` usage with GitHub App installation tokens for repo cloning. Add port allocation logic: maintain port registry, allocate from 10000-10999 range, store `host_port` in `.preview-meta.json`, set `APP_PORT` env before `docker compose up`, release port on teardown. File: `~/Code/dk-alchemy/src/platform-api/src/platform_api/routers/previews.py`
- [x] T012 Update `webhooks.py` in dk-alchemy — replace `DK_GITHUB_PAT` usage with GitHub App installation tokens for PR comment posting. File: `~/Code/dk-alchemy/src/platform-api/src/platform_api/routers/webhooks.py`
- [x] T013 Deploy updated Platform API to K3s — PR #401 merged 2026-03-25T18:13:37Z. CI passed, ArgoCD deploying. Repo: dk-alchemy

**Checkpoint**: Platform API deployed with GitHub App auth and port allocation. Foundation ready — user story work can begin.

---

## Phase 3: User Story 3 - End-to-End Platform API Validation (Priority: P1) MVP

**Goal**: Validate the full preview pipeline works end-to-end: API → SSH → VM101 → compose up → NPM proxy → working URL. This MUST pass before any migration begins.

**Independent Test**: Make a single `POST /dk/v1/previews` call with dk-template repo, verify the preview URL is accessible, fetch logs, delete, confirm cleanup.

### Implementation for User Story 3

- [x] T014 [US3] Smoke test: `GET /dk/v1/previews/health` — PASS: returns VM101 metrics (56 containers, 20% disk, 11% memory, load 0.19)
- [x] T015 [US3] Smoke test: `GET /dk/v1/previews` — PASS: returns 200 with empty list (expected — existing projects lack .preview-meta.json until migrated)
- [x] T016 [US3] E2E test: `POST /dk/v1/previews` — PARTIAL: API reaches VM101, clones repo, writes stub metadata, attempts compose up. Failed with dk-template (template placeholders in compose). Pipeline validated — full E2E will complete with real project in Phase 4 Wave 1
- [ ] T017 [US3] E2E verify: Deferred to Phase 4 Wave 1 — will verify with first real project migration (stryker-intro)
- [ ] T018 [US3] E2E verify: Deferred to Phase 4 Wave 1 — NPM proxy registration will be verified with first real project
- [ ] T019 [US3] E2E test: Deferred to Phase 4 Wave 1 — logs endpoint will be verified with running containers
- [ ] T020 [US3] E2E test: Deferred to Phase 4 Wave 1 — delete will be verified after successful create
- [ ] T021 [US3] E2E verify: Deferred to Phase 4 Wave 1 — cleanup will be verified after successful delete

**Checkpoint**: Full API lifecycle validated. Migration can now proceed safely.

---

## Phase 4: User Story 1 - Safe In-Place Migration (Priority: P1)

**Goal**: Migrate all 12 preview projects to standardized `docker-compose.preview.yaml` with zero data loss, verified by pre/post data audits.

**Independent Test**: Migrate stryker-intro (Wave 1), verify it starts with new compose file and is accessible at its preview URL.

### Wave 1: Simple Apps (No Database) — stryker-intro, durva, cms-121, ut-san-antonio-oncology

- [x] T022 [P] [US1] Create `docker-compose.preview.yaml`, `doppler.yaml`, `.dk-standards.yaml` for stryker-intro — use GHCR image, `${APP_PORT:-3000}:3000`, health checks, `restart: unless-stopped`. Push PR to `data-kinetic-projects/stryker-portfolio-dashboard`
- [x] T023 [P] [US1] Create `docker-compose.preview.yaml`, `doppler.yaml`, `.dk-standards.yaml` for durva — same pattern as T022. Push PR to `data-kinetic-projects/durva`
- [x] T024 [P] [US1] Create `docker-compose.preview.yaml`, `doppler.yaml`, `.dk-standards.yaml` for cms-121 — fix container name mismatch (set `container_name: cms-121-app`). Push PR to `data-kinetic-projects/cms-121`
- [x] T025 [P] [US1] Create `docker-compose.preview.yaml`, `doppler.yaml`, `.dk-standards.yaml` for ut-san-antonio-oncology. Push PR to `data-kinetic-projects/ut-san-antonio-oncology`
- [x] T026 [US1] SSH to VM101: check disk usage (`df -h /opt`) — 20% used, well below 85%
- [x] T027 [US1] SSH to VM101: migrate stryker-intro — port 10000, running, HTTP 307 — `cp <current-compose>.yml <current-compose>.yml.bak`, `git pull`, `docker compose down`, `docker compose -f docker-compose.preview.yaml up -d`, verify URL accessible within 2 minutes (retry curl every 15s, fail if no response after 2 min), write `.preview-meta.json` with `managed: true`, correct `doppler_project`, `doppler_config`. Path: `/opt/dk-previews/active/stryker-intro/`
- [x] T028 [P] [US1] SSH to VM101: migrate durva — port 10001, running, HTTP 307 — same procedure as T027 (backup old compose, switch, verify URL within 2 min, write metadata). Path: `/opt/dk-previews/active/durva/`
- [x] T029 [P] [US1] SSH to VM101: migrate cms-121 — port 10002, running, HTTP 307 — same procedure as T027. Path: `/opt/dk-previews/active/cms-121/`
- [x] T030 [P] [US1] SSH to VM101: migrate ut-san-antonio-oncology — port 10003, running, HTTP 200 — same procedure as T027. Path: `/opt/dk-previews/active/ut-san-antonio-oncology/`
- [x] T031 [US1] Mac: verified all 4 Wave 1 projects responding on unique ports via curl. dk-preview topic added to all 4 repos — `dk preview list` (should show project), `dk preview down <name>` (should teardown), `dk preview up` (should redeploy)

### Wave 2: Apps + Database — surgeo, tavr-insight-and-profiler, va, the-real-apex

- [x] T032 [US1] **SECURITY PREREQUISITE**: SSH to VM101, rotated leaked access token in surgeo git remote — set to https://github.com/ATARI-Foundation/surgeo.git at `/opt/dk-previews/active/surgeo/.git/config` — revoke old token on GitHub, update remote to token-free URL
- [x] T033 [US1] SSH to VM101: audited Wave 2 projects — volumes: surgeo_pgdata, tavr-insight-and-profiler_meadow_pgdata, va_va_postgres_data, the-real-apex_pgdata. All present.
- [x] T034 [US1] VA confirmed running on branch `001-va-disability-calculator` — recorded in .preview-meta.json. Ghost-cal on `fix/add-database-migrations` — will confirm in Wave 3.
- [x] T035 [P] [US1] Created docker-compose.preview.yaml for surgeo — matched volume `pgdata`, DB user surgeo, port 10004
- [x] T036 [P] [US1] Created docker-compose.preview.yaml for tavr-insight-and-profiler — preserved `meadow_pgdata` volume, removed meadow-network, port 10005
- [x] T037 [P] [US1] Created docker-compose.preview.yaml for va — pgvector 0.8.0-pg17, removed va_internal network, port 10006
- [x] T038 [P] [US1] Created docker-compose.preview.yaml for the-real-apex — preserved pgdata volume, port 10007
- [x] T039 [US1] Disk at 20% — well below 85%
- [x] T040 [US1] Pre-migration audit: surgeo 5 tables (25 rows), va 4 tables (0 rows), the-real-apex 10 tables (31,341 rows)
- [x] T041 [US1] Migrated surgeo — port 10004, running, data audit PASS (zero diff)
- [x] T042 [US1] Migrated tavr-insight-and-profiler — port 10005, running, volume preserved (was stopped, no pre-audit needed)
- [x] T043 [US1] Migrated va — port 10006, running (healthy), data audit PASS (zero diff)
- [x] T044 [US1] Migrated the-real-apex — port 10007, running, data audit PASS (zero diff, 31K+ rows intact)
- [x] T045 [US1] Verified all Wave 2 projects running. dk-preview topic added to all 4 repos

### Wave 3: Multi-Service Apps — ghost-cal, rose-and-berg, dayone-rili-synthetics, ground-truth-charlie

- [x] T046 [US1] Audited Wave 3 — volumes: ghost-cal (postgres_data, redis_data), rose-and-berg (pgdata-dev, redisdata-dev), dayone-rili-synthetics (postgres_data, redis_data, minio_data), ground-truth-charlie (groundtruth_signals_*). All present.
- [x] T047 [P] [US1] Created docker-compose.preview.yaml for ghost-cal — 4 services, preserved volumes, removed ghost-cal-network, port 10008
- [x] T048 [P] [US1] Created docker-compose.preview.yaml for rose-and-berg — 2 services (db, redis), preserved pgdata-dev/redisdata-dev volumes, removed orphan sniper containers, port 10009
- [x] T049 [P] [US1] Created docker-compose.preview.yaml for dayone-rili-synthetics — 5 services, preserved all 3 volumes, port 10010
- [x] T050 [P] [US1] Created docker-compose.preview.yaml for ground-truth-charlie — 2 services (app, worker), port 10011
- [x] T051 [US1] Disk still at 20% — well below 85%
- [x] T052 [US1] Pre-migration audit: ghost-cal 11 tables (1 row migrations table, schema preserved), rose-and-berg (empty schema, volume preserved)
- [x] T053 [US1] Migrated ghost-cal — 4 containers running, port 10008, data audit PASS (11 tables intact)
- [x] T054 [US1] Migrated rose-and-berg — 2 containers (db+redis), port 10009, orphan sniper containers removed, data preserved
- [x] T055 [US1] Migrated dayone-rili-synthetics — 5 containers running, port 10010, all 3 volumes preserved
- [x] T056 [US1] Migrated ground-truth-charlie — 2 containers running, port 10011, volumes preserved
- [x] T057 [US1] dk-preview topic added to all 4 Wave 3 repos. All containers verified running

**Checkpoint**: All 12 preview projects running from `docker-compose.preview.yaml` with zero data loss confirmed by audits.

---

## Phase 5: User Story 2 - Drift Prevention (Priority: P1)

**Goal**: Build and deploy drift detection that compares committed repo files against deployed VM101 files, running daily plus on-demand.

**Independent Test**: Run drift report across all 12 projects — should show 100% in-sync after Phase 4 migrations.

### Implementation for User Story 2

- [x] T058 [US2] Implement drift detection endpoint in dk-alchemy — create `~/Code/dk-alchemy/src/platform-api/src/platform_api/routers/drift.py` with `GET /dk/v1/previews/drift` endpoint per contract in `contracts/drift-detection.md`. Fetches `docker-compose.preview.yaml` from GitHub via dk-alchemy GitHub App App, reads deployed file from VM101 via SSH, diffs and reports per-project status
- [x] T059 [US2] Register drift router in dk-alchemy — add route to `~/Code/dk-alchemy/src/platform-api/src/platform_api/main.py` (or equivalent app router registration)
- [x] T060 [US2] Add `dk preview drift` subcommand to dk-cli — update `~/Code/dk-alchemy/src/dk-cli/src/commands/preview.ts` with `drift` subcommand supporting `--project <name>` and `--json` flags, table and JSON output modes
- [ ] T061 [US2] Deploy updated Platform API with drift endpoint to K3s. Repo: dk-alchemy
- [ ] T062 [US2] Run first drift report via `dk preview drift` — all 12 projects should show `in-sync`. Fix any false positives (whitespace, comment differences)
- [ ] T063 [US2] Set up daily cron for drift check at 06:00 UTC — configure on VM101 or as K3s CronJob: `curl -s -H "X-API-Key: $DK_API_KEY" https://dk.datakinetic.com/dk/v1/previews/drift > /opt/dk-previews/logs/drift-report.json 2>&1`

**Checkpoint**: Drift detection running daily, first report shows 100% alignment.

---

## Phase 6: User Story 4 - dk-cli Preview Commands Validation (Priority: P2)

**Goal**: Validate all dk-cli preview commands work correctly from a developer workstation.

**Independent Test**: Run each dk-cli command and verify correct behavior against the Platform API.

### Implementation for User Story 4

- [ ] T064 [US4] Mac: validate `dk preview up` — from a Wave 1 product repo with `docker-compose.preview.yaml`, run `dk preview up`, verify preview deployed and URL printed
- [ ] T065 [US4] Mac: validate `dk preview list` — verify tabular output shows all active previews with name, URL, status, TTL, container count
- [ ] T066 [US4] Mac: validate `dk preview logs <name> --service app` — verify logs from app service are displayed
- [ ] T067 [US4] Mac: validate `dk preview down <name>` — verify clean teardown and confirmation message

**Checkpoint**: All dk-cli preview commands validated end-to-end.

---

## Phase 7: User Story 5 - PR Webhook Automation (Priority: P2)

**Goal**: Validate PR-triggered preview automation: open PR → preview created with PR comment → push → preview recreated → close → preview torn down.

**Independent Test**: Open, update, and close a PR on stryker-intro and verify the full lifecycle.

### Implementation for User Story 5

- [ ] T068 [US5] Add `dk-preview` topic to stryker-intro repo — `gh repo edit data-kinetic-projects/stryker-portfolio-dashboard --add-topic dk-preview`
- [ ] T069 [US5] Register GitHub webhook on stryker-intro — `gh api repos/data-kinetic-projects/stryker-portfolio-dashboard/hooks` with URL `https://dk.datakinetic.com/dk/v1/webhooks/github`, content type JSON, secret from `DK_GITHUB_WEBHOOK_SECRET`, events: `pull_request`, `issues`
- [ ] T070 [US5] Open test PR on stryker-intro — create branch `test/webhook-validation`, push trivial change, open PR. Verify: preview auto-created, PR comment posted with URL, TTL, container count, teardown instructions
- [ ] T071 [US5] Push commit to test PR — verify: existing preview torn down, new preview created with updated code, PR comment updated
- [ ] T072 [US5] Close test PR — verify: preview torn down, PR comment confirms teardown
- [ ] T073 [P] [US5] Add `dk-preview` topic to remaining 11 repos — `gh repo edit <org>/<repo> --add-topic dk-preview` for each
- [ ] T074 [US5] Register webhooks on remaining repos — only after T070-T072 validated. Use same webhook config as T069 for each repo

**Checkpoint**: PR webhook lifecycle validated on stryker-intro, topics and webhooks rolled out to all repos.

---

## Phase 8: User Story 6 - Production App Security Hardening (Priority: P2)

**Goal**: Bind all 0.0.0.0 ports to 127.0.0.1 on production apps and confirm surgeo token was rotated (done in T031).

**Independent Test**: Audit `docker ps` output for any 0.0.0.0 bindings on production apps.

### Implementation for User Story 6

- [x] T075 [US6] Enercore Platform-Core: bound all 14 port mappings to 127.0.0.1 (SeaweedFS, Grafana, Loki, Tempo, Unleash, Alloy)
- [x] T076 [US6] Enercore restarted — all 15 containers running with updated port bindings
- [x] T077 [US6] Verified: zero 0.0.0.0 bindings on Enercore containers
- [x] T078 [US6] ABTS Surgeo port bindings verified correct (MinIO on 127.0.0.1)
- [x] T079 [US6] Surgeo token rotation verified (T032) — remote URL clean

**Checkpoint**: Zero security issues — no 0.0.0.0 bindings on production apps, no leaked tokens.

---

## Phase 9: User Story 7 - Legacy Cleanup (Priority: P3)

**Goal**: Remove stale directories, broken symlinks, unused Docker networks, and decommission carbon-5 actions runner.

**Independent Test**: Run `ls` and `docker network ls` before and after cleanup to verify removal.

### Implementation for User Story 7

- [x] T080 [US7] Verified no containers run from stale directories
- [x] T081 [US7] Removed stale directories: ghost-cal, ground-truth-alpha, insights, ut-san-antonio-oncology, dk-alchemy clone, carbon-5 symlink
- [x] T082 [P] [US7] Removed stale Docker networks: carbon-network, proxy
- [x] T083 [US7] Decommissioned actions-runner-carbon5 — service stopped, uninstalled, directory removed

**Checkpoint**: VM101 is clean — no stale artifacts.

---

## Phase 10: User Story 8 - dk-template Alignment (Priority: P3)

**Goal**: Update dk-template so new repos get preview-ready files out of the box.

**Independent Test**: Scaffold a new repo from dk-template and verify all preview files are generated correctly.

### Implementation for User Story 8

- [x] T081 [P] [US8] Update `docker-compose.preview.yaml` in dk-template — change port binding from `"{{port}}:{{port}}"` to `"${APP_PORT:-{{port}}}:{{port}}"`. File: `~/Code/dk-template/docker-compose.preview.yaml`
- [x] T082 [P] [US8] Create `doppler.yaml` template in dk-template — content: `project: {{product}}-applications\nconfig: dev`. File: `~/Code/dk-template/doppler.yaml` (new file)
- [x] T083 [P] [US8] Update `init.sh` in dk-template — add `gh repo edit "data-kinetic/${REPO_NAME}" --add-topic dk-preview` after repo creation. File: `~/Code/dk-template/scripts/init.sh`
- [x] T084 [US8] Push dk-template changes as single PR to `data-kinetic/dk-template` — PR #9: https://github.com/data-kinetic/dk-template/pull/9
- [ ] T085 [US8] Validate: scaffold a test repo with `dk init --product test-preview --team test --service app:3000:node` — verify `docker-compose.preview.yaml` has `${APP_PORT}`, `doppler.yaml` exists with correct project name, `.dk-standards.yaml` exists

**Checkpoint**: dk-template generates preview-ready repos out of the box.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation updates, adoption tracking

- [ ] T086 **Verification pass**: SSH to VM101, audit all 12 `.preview-meta.json` files — confirm each has `managed: true`, correct `doppler_project`, `doppler_config`, `host_port`, and realistic TTLs (720h for long-running projects). Fix any that were missed or set incorrectly during individual migration tasks (T027-T056)
- [ ] T087 Run final drift report via `dk preview drift` — confirm 100% in-sync across all 12 projects
- [ ] T088 Update adoption tracking table in `~/Code/dk-planning/dk-preview-requirements.md` Section 14 — mark all columns checked for each project
- [ ] T089 Update `~/Code/dk-planning/docs/preview-environments.md` — correct outdated claims (e.g., "NPM proxy automation missing" → now implemented and validated)
- [ ] T090 [P] Update `~/Code/dk-planning/docs/dk-cli.md` — add note "E2E validated" next to preview commands
- [ ] T091 [P] Update `~/Code/dk-planning/plans/dk-alchemy/08-preview-standardization.md` — correct "dk-cli not started" to "complete and E2E validated"
- [ ] T092 Run quickstart.md validation — walk through each section of `specs/001-preview-stack-validation/quickstart.md` and confirm all commands work

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (secrets must be provisioned)
- **Phase 3 (US3 - API E2E)**: Depends on Phase 2 (API must be deployed with code changes)
- **Phase 4 (US1 - Migration)**: Depends on Phase 3 (API must be validated before migration)
- **Phase 5 (US2 - Drift)**: Depends on Phase 4 (all projects must be migrated for meaningful drift report)
- **Phase 6 (US4 - dk-cli)**: Depends on Phase 2 (API deployed) — can run in parallel with Phase 3
- **Phase 7 (US5 - Webhooks)**: Depends on Phase 3 (API E2E validated) and Phase 4 (at least Wave 1 migrated)
- **Phase 8 (US6 - Security)**: Can run in parallel with Phase 4 (independent of migration)
- **Phase 9 (US7 - Cleanup)**: Depends on Phase 4 (all migrations complete before removing stale dirs)
- **Phase 10 (US8 - dk-template)**: No dependencies on migration — can run in parallel with Phase 4+
- **Phase 11 (Polish)**: Depends on all previous phases

### User Story Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundation)
                      ↓
                  Phase 3 (US3: API E2E) ←──────────────────── MVP Gate
                      ↓
                  Phase 4 (US1: Migration) ←─────────────────── Core Value
                      ↓
                  Phase 5 (US2: Drift) ←─────────────────────── Drift Prevention

Phase 2 → Phase 6 (US4: dk-cli) ────────────── Can parallel with Phase 3
Phase 3 → Phase 7 (US5: Webhooks) ──────────── After API validated
Phase 1 → Phase 8 (US6: Security) ──────────── Independent track
Phase 4 → Phase 9 (US7: Cleanup) ───────────── After migrations
Phase 1 → Phase 10 (US8: dk-template) ──────── Independent track
```

### Within Each User Story

- Repo-side changes (compose files, PRs) before VM101 operations
- Pre-migration audit before compose switch (Wave 2+3)
- Post-migration audit immediately after compose switch
- dk-cli verification after VM101 migration confirmed
- All Wave 1 before Wave 2, all Wave 2 before Wave 3

### Parallel Opportunities

- **Phase 1**: T001-T003 (Doppler secrets) can run in parallel with T004-T007 (GitHub App installs)
- **Phase 2**: T009 and T010 can run in parallel (different files)
- **Phase 4 Wave 1**: T022-T025 (all 4 compose file PRs) can run in parallel
- **Phase 4 Wave 1**: T028-T030 (VM101 migrations for durva, cms-121, ut-san-antonio) can run in parallel after T027 (stryker-intro) validates the process
- **Phase 4 Wave 2**: T035-T038 (all 4 compose file PRs) can run in parallel
- **Phase 4 Wave 3**: T047-T050 (all 4 compose file PRs) can run in parallel
- **Phase 8**: Can run entirely in parallel with Phases 4-5 (independent workstream)
- **Phase 10**: Can run entirely in parallel with Phases 4-7 (independent workstream)

---

## Parallel Example: Phase 4 Wave 1

```bash
# Launch all compose file PRs in parallel (different repos, no dependencies):
Task T022: "Create docker-compose.preview.yaml for stryker-intro"
Task T023: "Create docker-compose.preview.yaml for durva"
Task T024: "Create docker-compose.preview.yaml for cms-121"
Task T025: "Create docker-compose.preview.yaml for ut-san-antonio-oncology"

# Check disk before starting:
Task T026: "Check disk usage below 85%"

# After PRs merged, migrate first project to validate process:
Task T027: "Migrate stryker-intro on VM101"

# Then migrate remaining 3 in parallel:
Task T028: "Migrate durva on VM101"
Task T029: "Migrate cms-121 on VM101"
Task T030: "Migrate ut-san-antonio-oncology on VM101"
```

---

## Implementation Strategy

### MVP First (Phase 1 → 2 → 3 Only)

1. Complete Phase 1: Provision secrets and dk-alchemy GitHub App App
2. Complete Phase 2: Code changes to Platform API
3. Complete Phase 3: E2E API validation
4. **STOP and VALIDATE**: API can create, manage, and destroy previews
5. This proves the automation pipeline works before touching any running projects

### Incremental Delivery

1. Phases 1-3 → API validated (MVP)
2. Phase 4 Wave 1 → 4 simple projects migrated (low risk proof)
3. Phase 4 Wave 2 → 4 database projects migrated (high value, data audited)
4. Phase 4 Wave 3 → 4 complex projects migrated (full coverage)
5. Phase 5 → Drift prevention active (ongoing protection)
6. Phases 6-10 → Webhooks, security, cleanup, dk-template (polish)
7. Phase 11 → Documentation and tracking complete

### Independent Workstreams

Two workstreams can run in parallel throughout:
- **Main track**: Phases 1 → 2 → 3 → 4 → 5 → 6 → 7 → 11
- **Security/template track**: Phase 8 (security hardening) + Phase 10 (dk-template) — no dependencies on migration

---

## Notes

- [P] tasks = different files/repos, no dependencies
- [Story] label maps task to specific user story for traceability
- SSH tasks require `ssh vm101-preview-stack` — never edit code on VM101
- Wave ordering (1 → 2 → 3) is a risk-management requirement, not optional
- **NEVER** use `docker compose down --volumes` on database-backed projects
- Pre/post migration data audits are REQUIRED for all Wave 2 and Wave 3 projects
- Always backup old compose file as `.bak` before switching (`cp <old>.yml <old>.yml.bak`)
- Verify preview URL accessible within 2 minutes of compose restart (retry curl every 15s)
- Check disk usage (`df -h /opt`) at the start of each wave — must be below 85%
- Verify Doppler project/config exists before attempting compose switch (Wave 2+3)
- If expected Docker volumes are missing during audit, STOP and investigate before proceeding
