# Data Model: Preview Stack Validation & Migration

**Feature**: `001-preview-stack-validation`
**Date**: 2026-03-25

## Entities

### Preview Project

Represents a Docker Compose deployment on VM101 associated with a branch of a product repo.

| Field | Type | Description | Source |
|-------|------|-------------|--------|
| name | string (DNS-safe, max 63 chars) | Unique preview identifier | Derived from repo+branch or user-specified |
| repo | string | GitHub org/repo (e.g., `data-kinetic-projects/ghost-cal`) | API request or git remote |
| branch | string | Git branch deployed | API request or git context |
| status | enum | `starting`, `running`, `stopping`, `error`, `archived` | Platform API lifecycle |
| ttl_hours | integer (1-720) | Time-to-live before auto-cleanup | API request (default: 72) |
| host_port | integer (10000-10999) | Allocated host port for NPM routing | Platform API port allocator |
| doppler_project | string | Doppler project name | `doppler.yaml` in repo or API request |
| doppler_config | string | Doppler config environment | `doppler.yaml` in repo or API request (default: `dev`) |
| domain | string | Preview domain suffix | API request (default: `preview.datakinetic.com`) |
| url | string | Full preview URL | Computed: `https://{name}.{domain}` |
| created_at | ISO 8601 datetime | Creation timestamp | Platform API |
| managed | boolean | Whether project is API-managed | Migration metadata |
| containers | integer | Count of running containers | Docker inspect |
| compose_file | string | Active compose filename | Always `docker-compose.preview.yaml` post-migration |

**Identity**: `name` is unique across all previews. DNS-safe: lowercase alphanumeric + hyphens.

**State transitions**:
```
(none) → starting → running → stopping → archived
                  ↘ error
```

**Persistence**: `/opt/dk-previews/active/{name}/.preview-meta.json` on VM101.

---

### Drift Report

A point-in-time comparison between committed repo state and deployed VM101 state for a preview project.

| Field | Type | Description |
|-------|------|-------------|
| project_name | string | Preview project name |
| repo | string | GitHub org/repo |
| check_time | ISO 8601 datetime | When the drift check ran |
| status | enum | `in-sync`, `drifted`, `missing-repo-file`, `missing-vm-file` |
| compose_diff | string (optional) | Unified diff of compose files if drifted |
| image_drift | list of {service, repo_image, vm_image} | Per-service image tag comparison |
| volume_drift | list of {volume, repo_defined, vm_defined} | Volume name comparison |
| network_drift | list of {network, repo_defined, vm_defined} | Network configuration comparison |

**Lifecycle**: Created on each drift check run (daily cron or on-demand). Not persisted long-term — latest report overwrites previous.

**Persistence**: Report file at `/opt/dk-previews/logs/drift-report.json` (daily cron) or returned inline via API/CLI.

---

### Migration Wave

Logical grouping of projects by complexity for ordered migration.

| Field | Type | Description |
|-------|------|-------------|
| wave_number | integer (1-4) | Migration order |
| label | string | Human-readable description |
| projects | list of string | Project names in this wave |
| criteria | string | What defines this wave |
| has_database | boolean | Whether projects in wave have persistent data |

**Static definition** (not persisted — defined in plan):

| Wave | Label | Projects | Has Database |
|------|-------|----------|:---:|
| 1 | Simple single-container | stryker-intro, durva, cms-121, ut-san-antonio-oncology | No |
| 2 | App + database (2-3 containers) | surgeo, tavr-insight-and-profiler, va, the-real-apex | Yes |
| 3 | Multi-service (4-6 containers) | ghost-cal, rose-and-berg, dayone-rili-synthetics, ground-truth-charlie | Yes |
| 4 | Production apps (separate track) | Platform-Core (enercore), abts-surgeo | Yes (not migrated) |

---

### Adoption Tracker

Per-project checklist tracking migration completion across all required artifacts.

| Field | Type | Description |
|-------|------|-------------|
| project | string | Project name |
| preview_yaml | boolean | `docker-compose.preview.yaml` committed to repo |
| doppler_yaml | boolean | `doppler.yaml` committed to repo |
| dk_standards_yaml | boolean | `.dk-standards.yaml` committed to repo |
| ghcr_images | boolean | CI/CD pushes images to GHCR |
| dk_preview_topic | boolean | `dk-preview` GitHub topic added |
| webhook | boolean | GitHub webhook registered |
| dk_cli_tested | boolean | Full dk-cli loop validated |
| data_audit_passed | boolean | Pre/post migration row counts match (database projects only) |
| vm101_switched | boolean | Running from `docker-compose.preview.yaml` on VM101 |

**Persistence**: Tracked in the requirements doc Section 14 table. Updated as each project completes.

## Relationships

```
Migration Wave (1) ──contains──> (N) Preview Project
Preview Project (1) ──has──> (1) Preview Metadata (.preview-meta.json)
Preview Project (1) ──has──> (1) Adoption Tracker row
Preview Project (1) ──checked-by──> (N) Drift Report
```
