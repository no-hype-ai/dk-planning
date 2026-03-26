# Feature Specification: Preview Stack Validation & Migration

**Feature Branch**: `001-preview-stack-validation`
**Created**: 2026-03-25
**Status**: Draft
**Input**: Standardize VM101 preview environments across 12 projects with zero data loss, ensure no drift between repos and running services, and validate the full Platform API → dk-cli → VM101 pipeline end-to-end.

## Clarifications

### Session 2026-03-25

- Q: When should drift detection run — on-demand only, scheduled, CI-triggered, or via API? → A: Scheduled daily plus on-demand via CLI command.
- Q: How should "zero data loss" be verified after migration — app loads, basic data presence, or full audit? → A: Full data audit — row counts or checksums compared before and after migration.
- Q: How should multi-org GitHub access work for cloning repos and posting PR comments across 4 orgs? → A: GitHub App installation (dk-alchemy GitHub App) with per-org installs and repo-level permissions.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Safe In-Place Migration of Running Preview Services (Priority: P1)

As a platform operator, I need to migrate each of the 12 running preview projects on VM101 from ad-hoc compose configurations to the standardized `docker-compose.preview.yaml` format — without losing any existing data (databases, volumes, application state).

**Why this priority**: Data loss is the highest-risk outcome. Several projects have production-like data in Postgres volumes. A migration that destroys a database volume is unrecoverable and blocks the entire initiative.

**Independent Test**: Can be fully tested by migrating a single Wave 1 project (e.g., stryker-intro), verifying it starts with the new compose file, and confirming the application is accessible at its preview URL. Delivers value by proving the migration path works.

**Acceptance Scenarios**:

1. **Given** a running project with existing Docker volumes (e.g., Postgres data), **When** the compose file is switched from the old configuration to `docker-compose.preview.yaml`, **Then** all named volumes are preserved, the application starts with existing data intact, and a pre/post migration data audit (row counts or checksums per table) confirms no data loss.
2. **Given** a project using custom Docker networks (e.g., `gtc-network`, `sniper-network`), **When** migrated to use the default Compose project network, **Then** all inter-service communication continues to work (app can reach its database, cache, etc.).
3. **Given** a project running from a non-standard compose file (e.g., `docker-compose.prod.yml`, `docker-compose.dev.yml`), **When** switched to `docker-compose.preview.yaml`, **Then** the same services are running, accessible at the same preview URL, and the old compose file is retained as `.bak` until migration is confirmed.
4. **Given** the migration of any project, **When** the new compose file is applied, **Then** the project's preview URL returns a successful HTTP response within 2 minutes of startup.

---

### User Story 2 - Repo-to-VM101 Drift Prevention (Priority: P1)

As a platform operator, I need a validation mechanism that ensures what is committed in each product repo's `docker-compose.preview.yaml` matches what is actually running on VM101 — preventing silent configuration drift over time.

**Why this priority**: Without drift detection, manual edits on VM101 or stale repo code will cause the preview system to diverge from its documented state. This makes debugging failures unpredictable and undermines the "API-managed" architecture.

**Independent Test**: Can be tested by comparing the committed `docker-compose.preview.yaml` in a repo against what is deployed on VM101 for that project. Delivers value by catching any divergence immediately.

**Acceptance Scenarios**:

1. **Given** a product repo with a committed `docker-compose.preview.yaml`, **When** a drift check is run, **Then** the system reports whether the file on VM101 matches the repo version (same image tags, same service definitions, same volume names).
2. **Given** a project where someone manually edited the compose file on VM101 without committing to the repo, **When** a drift check is run, **Then** the divergence is flagged with specific differences listed.
3. **Given** a repo that has updated its `docker-compose.preview.yaml` but VM101 has not been redeployed, **When** a drift check is run, **Then** the report identifies the stale deployment and the specific changes that have not been applied.
4. **Given** all 12 preview projects, **When** a cross-project drift report is generated, **Then** it produces a summary showing which projects are in sync, which have drift, and the nature of each drift.

---

### User Story 3 - End-to-End Platform API Validation (Priority: P1)

As a platform operator, I need to validate that the full preview pipeline works end-to-end: Platform API receives a request, SSHes to VM101, clones the repo, injects secrets via Doppler, starts compose services, registers the NPM proxy, and returns a working URL.

**Why this priority**: The Platform API code exists but has never been tested against the real VM101 environment. Until this validation passes, the automated preview system is theoretical — all deployments remain manual.

**Independent Test**: Can be tested by making a single `POST /dk/v1/previews` call with a known-good repo and verifying the preview is accessible. Delivers value by proving the automation pipeline works.

**Acceptance Scenarios**:

1. **Given** the Platform API is deployed and Doppler secrets are configured (`DK_PREVIEW_SSH_KEY`, `DK_NPM_ADMIN_EMAIL`, `DK_NPM_ADMIN_PASSWORD`), **When** a health check is requested (`GET /dk/v1/previews/health`), **Then** VM101 disk, memory, load, and container count metrics are returned.
2. **Given** a product repo with a valid `docker-compose.preview.yaml`, **When** a preview is created via the API (`POST /dk/v1/previews`), **Then** the preview URL is accessible, containers are running, `.preview-meta.json` is written, and NPM proxy is registered.
3. **Given** a running preview, **When** it is deleted via the API (`DELETE /dk/v1/previews/{name}`), **Then** all containers are stopped, the NPM proxy entry is removed, and the project directory is moved to the archive.
4. **Given** a running preview, **When** logs are requested (`GET /dk/v1/previews/{name}/logs`), **Then** container logs from the specified service are returned.

---

### User Story 4 - dk-cli Preview Commands Validation (Priority: P2)

As a developer, I need the dk-cli preview commands (`dk preview up`, `dk preview list`, `dk preview logs`, `dk preview down`) to work correctly against the Platform API so I can manage preview environments from my workstation.

**Why this priority**: The CLI is the developer-facing interface. Once the API is validated (P1), the CLI validation is straightforward but required before developers can adopt the workflow.

**Independent Test**: Can be tested by running each dk-cli command from a developer workstation and verifying correct behavior. Delivers value by enabling the self-service preview workflow.

**Acceptance Scenarios**:

1. **Given** a developer in a product repo with `docker-compose.preview.yaml`, **When** they run `dk preview up`, **Then** a preview is deployed and the URL is printed.
2. **Given** active previews on VM101, **When** a developer runs `dk preview list`, **Then** all previews are listed with name, URL, status, TTL, and container count.
3. **Given** a running preview, **When** a developer runs `dk preview logs <name> --service app`, **Then** logs from the app service are displayed.
4. **Given** a running preview, **When** a developer runs `dk preview down <name>`, **Then** the preview is torn down and confirmation is shown.

---

### User Story 5 - PR Webhook Automation Validation (Priority: P2)

As a developer, I need PR-triggered preview automation to work: opening a PR creates a preview, pushing updates recreates it, and closing the PR tears it down — all with PR comments showing status.

**Why this priority**: This is the "zero-touch" developer experience. It depends on the API being validated (Story 3) and at least one repo being fully migrated (Story 1).

**Independent Test**: Can be tested on a single repo by opening, updating, and closing a PR. Delivers value by proving the automated preview lifecycle.

**Acceptance Scenarios**:

1. **Given** a repo with the `dk-preview` GitHub topic and a registered webhook, **When** a PR is opened, **Then** a preview is created and a PR comment is posted with the preview URL.
2. **Given** an open PR with an active preview, **When** a new commit is pushed to the PR branch, **Then** the existing preview is torn down and recreated with the updated code.
3. **Given** an open PR with an active preview, **When** the PR is closed or merged, **Then** the preview is torn down and a PR comment confirms the teardown.

---

### User Story 6 - Production App Security Hardening (Priority: P2)

As a platform operator, I need the two production applications on VM101 (Enercore Platform-Core and ABTS Surgeo) to have their security issues resolved — specifically binding all service ports to 127.0.0.1 instead of 0.0.0.0 and rotating the leaked access token in surgeo's git remote.

**Why this priority**: These are active security issues. The leaked token is high severity. While UFW mitigates the open ports, defense-in-depth requires binding to localhost.

**Independent Test**: Can be tested by auditing `docker ps` output for 0.0.0.0 bindings and verifying the git remote URL no longer contains a token. Delivers value by closing known security gaps.

**Acceptance Scenarios**:

1. **Given** Enercore Platform-Core has services bound to 0.0.0.0, **When** the compose file is updated to bind to 127.0.0.1, **Then** all services are accessible internally but not directly from the network.
2. **Given** surgeo's git remote contains a leaked access token, **When** the token is rotated and the remote URL is updated, **Then** the old token is revoked and the remote uses a token-free URL.

---

### User Story 7 - Legacy Cleanup (Priority: P3)

As a platform operator, I need stale directories, broken symlinks, unused Docker networks, and the decommissioned carbon-5 actions runner removed from VM101 to reduce confusion and free resources.

**Why this priority**: These are housekeeping items. They don't block functionality but create confusion during audits and consume minor disk space.

**Independent Test**: Can be tested by running `ls` and `docker network ls` before and after cleanup. Delivers value by establishing a clean baseline.

**Acceptance Scenarios**:

1. **Given** stale directories at `/home/ubuntu/code/ghost-cal`, `/home/ubuntu/code/ground-truth-alpha`, `/home/ubuntu/code/insights`, `/home/nick/code/ut-san-antonio-oncology`, **When** cleanup is performed (after verifying no containers run from these paths), **Then** the directories are removed.
2. **Given** broken symlink `/home/ubuntu/code/carbon-5` and stale networks `carbon-network` and `proxy`, **When** cleanup is performed, **Then** the symlink and networks are removed.
3. **Given** `actions-runner-carbon5` is no longer needed (carbon-5 decommissioned), **When** the runner is decommissioned, **Then** it is unregistered from GitHub and the directory is removed.

---

### User Story 8 - dk-template Alignment for New Projects (Priority: P3)

As a platform operator, I need dk-template to generate preview-ready repos out of the box — so new products get `docker-compose.preview.yaml`, `doppler.yaml`, `.dk-standards.yaml`, the `dk-preview` topic, and webhook registration without manual setup.

**Why this priority**: This prevents future drift by ensuring all new repos follow the standard from day one. However, the immediate priority is standardizing existing projects.

**Independent Test**: Can be tested by scaffolding a new repo from dk-template and verifying all preview files are generated correctly. Delivers value by closing the loop on new project onboarding.

**Acceptance Scenarios**:

1. **Given** a developer runs `dk init --product my-product --team my-team --service app:3000:node`, **When** the scaffolding completes, **Then** a `docker-compose.preview.yaml` using pre-built images with `${APP_PORT}` is generated.
2. **Given** a newly scaffolded repo, **When** the init process completes, **Then** `doppler.yaml`, `.dk-standards.yaml`, and the CI workflow for image publishing are all present.

---

### Edge Cases

- What happens when a migration is attempted on a project whose volumes have been manually deleted?
  - The migration proceeds, but the application starts with an empty database. A pre-migration audit step must verify volume existence.
- What happens when two previews try to bind the same host port?
  - The Platform API's port allocation strategy (range 10000-10999) prevents this. The `APP_PORT` env var is set before compose up.
- What happens when VM101 disk usage exceeds 85% during a migration wave?
  - The migration pauses. The operator addresses disk usage (prune images, remove archives) before continuing.
- What happens when a project's container registry image doesn't exist yet?
  - The migration uses the currently-running image tag. CI/CD setup for image publishing is a separate step per project.
- What happens when Doppler secrets are missing for a project during migration?
  - The compose startup fails. Pre-flight should verify Doppler project and config exist before attempting the compose switch.
- What happens if the Platform API pod restarts mid-deployment?
  - The SSH session to VM101 is interrupted. The preview may be in a partial state. The health endpoint should detect orphaned containers and the operator can clean up manually.
- What happens when a project running from a non-main branch (ghost-cal, VA) is migrated?
  - The migration preserves the current branch. A note is added to `.preview-meta.json` documenting the branch. The operator confirms whether the non-main branch is intentional before migrating.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The migration process MUST preserve all existing Docker volumes when switching compose files (no `--volumes` flag on teardown). For database-backed projects, a pre-migration snapshot of row counts (or checksums) per table MUST be captured and compared against post-migration counts to confirm zero data loss.
- **FR-002**: The migration process MUST create `docker-compose.preview.yaml` alongside (not replacing) the existing compose file until the new file is validated.
- **FR-003**: Each migrated project MUST be verified accessible at its preview URL within 2 minutes of compose restart before the migration is considered successful.
- **FR-004**: A drift detection mechanism MUST compare the committed `docker-compose.preview.yaml` in each product repo against the file deployed on VM101 and report differences. The check MUST run on a daily schedule and be invocable on-demand via a CLI command.
- **FR-005**: The drift check MUST cover all 12 preview projects and produce a summary report with per-project status (in-sync, drifted, or missing). The daily scheduled run MUST persist its report for operator review.
- **FR-006**: The Platform API MUST successfully complete an end-to-end preview lifecycle (create → verify → logs → delete) against VM101 before project migrations begin.
- **FR-007**: All required secrets MUST be provisioned in `dk-infrastructure/prd` before API validation begins: `DK_NPM_ADMIN_EMAIL`, `DK_NPM_ADMIN_PASSWORD`, `DK_GITHUB_WEBHOOK_SECRET`, `DK_GITHUB_APP_ID`, and `DK_GITHUB_APP_PRIVATE_KEY` (5 total). GitHub access (repo cloning, PR comments, webhook validation) MUST use the dk-alchemy GitHub App installation tokens rather than a personal access token. The dk-alchemy GitHub App MUST be installed on all 4 orgs (`data-kinetic-projects`, `no-hype-ai`, `ATARI-Foundation`, `Enercore-AI`) with repo-level permissions for the relevant preview repos.
- **FR-008**: The dk-cli preview commands (`up`, `down`, `list`, `logs`) MUST be validated against the Platform API after API end-to-end passes.
- **FR-009**: PR webhook automation MUST be validated on at least one repo before rolling out to remaining repos.
- **FR-010**: Production apps (Enercore, ABTS Surgeo) MUST have all service ports bound to 127.0.0.1, not 0.0.0.0.
- **FR-011**: The leaked access token in surgeo's git remote MUST be rotated and the remote URL updated to a token-free URL.
- **FR-012**: Each migrated project MUST have a `.preview-meta.json` with `managed: true`, correct `doppler_project`, `doppler_config`, and realistic TTL values.
- **FR-013**: The migration MUST proceed in wave order (Wave 1: no-database apps, Wave 2: app+database, Wave 3: multi-service) to reduce risk.
- **FR-014**: dk-template MUST generate `docker-compose.preview.yaml` files that use `${APP_PORT}` for host port mapping and do NOT reference `proxy_net`.
- **FR-015**: Each product repo MUST have `docker-compose.preview.yaml`, `doppler.yaml`, and `.dk-standards.yaml` committed after migration.
- **FR-016**: Legacy stale directories, broken symlinks, and unused Docker networks MUST be cleaned up after all projects are confirmed running from `/opt/`.
- **FR-017**: The `actions-runner-carbon5` MUST be decommissioned (unregistered from GitHub and directory removed).
- **FR-018**: Projects running from non-main branches (ghost-cal, VA) MUST have their branch status confirmed as intentional before migration.

### Key Entities

- **Preview Project**: A Docker Compose deployment on VM101 representing a branch of a product repo. Key attributes: name, repo, branch, compose file, preview URL, TTL, Doppler project/config, list of services, list of volumes.
- **Preview Metadata** (`.preview-meta.json`): Per-project state file on VM101 tracking name, repo, branch, status, TTL, creation time, URL, management flag, Doppler config, and allocated host port.
- **Migration Wave**: A grouping of projects by complexity (container count, database presence) that determines migration order. Waves 1-3 cover preview apps; Wave 4 covers production apps separately.
- **Drift Report**: A comparison artifact showing per-project alignment between committed repo state and deployed VM101 state, covering compose files, image tags, volume names, and network configuration.
- **Platform API Preview Endpoints**: The set of endpoints in dk-alchemy that orchestrate preview lifecycle (create, list, get, delete, extend, logs, health, webhooks).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 12 preview projects on VM101 are running from standardized `docker-compose.preview.yaml` files with zero data loss, verified by pre/post migration data audits (row counts or checksums per table) showing identical results for all database-backed projects.
- **SC-002**: A drift check across all 12 projects reports 100% alignment between committed repo files and deployed VM101 files after migration completes.
- **SC-003**: The Platform API successfully completes a full preview lifecycle (create → verify URL → fetch logs → delete → confirm cleanup) against VM101 with no manual intervention.
- **SC-004**: dk-cli preview commands (`up`, `down`, `list`, `logs`) all work correctly from a developer workstation against the validated Platform API.
- **SC-005**: PR webhook automation successfully creates, updates, and tears down a preview in response to PR lifecycle events on at least one repo.
- **SC-006**: Zero security issues remain: no services bound to 0.0.0.0 on production apps, no leaked tokens in git remotes.
- **SC-007**: All stale directories, broken symlinks, and unused Docker networks are removed from VM101.
- **SC-008**: New repos scaffolded from dk-template include all required preview files (`docker-compose.preview.yaml`, `doppler.yaml`, `.dk-standards.yaml`) without manual intervention.
- **SC-009**: Each project's adoption tracking row (Section 14 of requirements doc) is fully checked after migration — `preview.yaml`, `doppler.yaml`, `.dk-standards.yaml`, images, `dk-preview` topic, webhook, dk-cli tested.

## Assumptions

- VM101 remains the preview host for the duration of this work. No infrastructure changes to the VM are planned.
- The Platform API code in dk-alchemy is functionally correct for core preview lifecycle but requires targeted code changes (port allocation from 10000-10999 range, GitHub App token generation replacing PAT auth) in addition to configuration and end-to-end testing.
- The dk-cli code in dk-alchemy is functionally correct for existing commands and requires end-to-end testing. A new `drift` subcommand must be added.
- Each product repo's CI/CD already pushes images to a container registry, or a CI workflow will be added as part of migration.
- Doppler projects and configs exist for each product repo, or will be created during migration.
- SSH access from the Platform API pod to VM101 works via the existing `DK_PREVIEW_SSH_KEY`.
- The NPM instance on VM101 is functional and its API is accessible on port 81 from localhost.
- Projects running from non-main branches are doing so intentionally unless the operator confirms otherwise.
- The weekly Docker prune cron job is sufficient for ongoing resource management and no additional cleanup automation is needed.
- IngressRoutes for `*.preview.datakinetic.com` and `*.preview.behaviorlabs.ai` are already deployed and working.

## Dependencies

- **dk-alchemy**: Contains Platform API and dk-cli code. Changes may be needed if end-to-end testing reveals bugs.
- **dk-clusters**: No changes expected. K3s cluster hosts the Platform API pod.
- **dk-template**: Requires updates to `docker-compose.preview.yaml` template (remove `proxy_net`, add `${APP_PORT}`).
- **12 product repos**: Each needs `docker-compose.preview.yaml`, `doppler.yaml`, `.dk-standards.yaml` committed.
- **Doppler**: `dk-infrastructure/prd` needs 3 missing secrets provisioned (`DK_NPM_ADMIN_EMAIL`, `DK_NPM_ADMIN_PASSWORD`, `DK_GITHUB_WEBHOOK_SECRET`).
- **dk-alchemy GitHub App**: Must be installed on all 4 orgs with repo-level permissions for preview repos. Replaces `DK_GITHUB_PAT` for repo cloning, PR comments, and webhook validation.
- **VM101**: SSH access required for in-place migration operations.
- **GitHub**: `dk-preview` topic and webhook registration for each repo.

## Scope Boundaries

### In Scope

- Migrating all 12 preview projects to standardized compose files
- Drift detection between repos and VM101
- End-to-end validation of Platform API, dk-cli, and PR webhooks
- Security hardening of production apps on VM101
- Legacy cleanup (stale dirs, networks, runners)
- dk-template alignment for new project scaffolding

### Out of Scope

- Migrating production apps (Enercore, ABTS Surgeo) to Kubernetes — these stay on VM101
- Promotion pipeline validation (staging → production via ArgoCD) — separate initiative
- VM101 hardware changes or resource scaling
- Replacing NPM with Caddy or Traefik
- Per-preview resource limits (CPU/memory) in Docker Compose
- Changes to the K3s cluster or ArgoCD configuration (except Platform API deployment)
- GitHub Actions runner migration to K3s (Actions Runner Controller)
