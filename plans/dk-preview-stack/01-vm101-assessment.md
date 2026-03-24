# VM101 Preview Stack — Current State Assessment

## Date

2026-03-23

## System Overview

| Property | Value |
|----------|-------|
| **Hostname** | preview-stack |
| **OS** | Ubuntu 22.04.5 LTS (Jammy Jellyfish) |
| **Kernel** | 6.8.0-101-generic (x86_64) |
| **CPUs** | 16 |
| **RAM** | 125 GiB total, ~12 GiB used, ~111 GiB buff/cache, ~2 GiB free |
| **Swap** | None configured |
| **Root Disk** | 485 GB total, 398 GB used (83%), 88 GB available |
| **Docker Version** | 29.2.1 |
| **Uptime** | 17 days, 21 hours |
| **Load Average** | 111.03 / 36.36 / 13.79 (severely elevated at time of audit) |

### Critical Observations

- **Disk is at 83% utilization** — approaching the danger zone (90%+). With 88 GB free across 60+ containers, volumes, and 10 GitHub Actions runners, this will become a problem.
- **Load average of 111.03** is extremely high for a 16-core machine (7x over-saturated). Likely caused by heavy container workloads or runaway processes.
- **No swap configured** — any memory pressure event will trigger OOM kills with no buffer.

## Running Services

### Active Containers (59 total, 58 running, 1 exited)

| Container | Status | Exposed Ports | Image |
|-----------|--------|---------------|-------|
| **npm** | Up 10 days (healthy) | 80, 81, 443 | jc21/nginx-proxy-manager:2.13.7 |
| **rili-app-dev** | Up 2 weeks | 3000 (host-mapped) | dayone-rili-synthetics-app |
| **rili-worker-dev** | Up 11 days | 3000 (internal) | dayone-rili-synthetics-worker |
| **rili-postgres** | Up 2 weeks (healthy) | 5432 (host-mapped) | postgres:16-alpine |
| **rili-redis** | Up 11 days (healthy) | 6379 (host-mapped) | redis:7-alpine |
| **rili-minio** | Up 2 weeks (healthy) | 9000-9001 (host-mapped) | minio/minio:latest |
| **enercore-app** | Up 2 weeks | 3000 (internal) | platform-core image |
| **enercore-api** | Up 2 weeks | 3002 (internal) | platform-core image |
| **enercore-web** | Up 2 weeks | 3001 (internal) | platform-core-web |
| **enercore-db** | Up 2 weeks (healthy) | 5434 (host-mapped) | postgres:17-alpine |
| **enercore-redis** | Up 2 weeks (healthy) | 6381 (host-mapped) | redis:7-alpine |
| **enercore-mongo** | Up 2 weeks | 27018 (host-mapped) | mongo:7 |
| **enercore-seaweedfs-master** | Up 2 weeks | 9334, 19334 (host-mapped) | chrislusf/seaweedfs:latest |
| **enercore-seaweedfs-volume** | Up 2 weeks | 8081, 18081 (host-mapped) | chrislusf/seaweedfs:latest |
| **enercore-seaweedfs-filer** | Up 2 weeks | 8334, 8889, 18889 (host-mapped) | chrislusf/seaweedfs:latest |
| **enercore-grafana** | Up 2 weeks | 3301 (host-mapped) | grafana/grafana:11.5.2 |
| **enercore-loki** | Up 2 weeks | 3101 (host-mapped) | grafana/loki:3.4.2 |
| **enercore-tempo** | Up 2 weeks | 3201 (host-mapped) | grafana/tempo:2.7.2 |
| **enercore-alloy** | Up 2 weeks | 4319, 4320, 12346 (host-mapped) | grafana/alloy:latest |
| **enercore-unleash** | Up 2 weeks | 4243 (host-mapped) | unleashorg/unleash-server:latest |
| **enercore-route53-updater** | Up 2 weeks | — | platform-core-route53-updater |
| **abts-api** | Up 2 weeks (healthy) | 8000 (internal) | abts-surgeo-api |
| **abts-web-app** | Up 2 weeks (healthy) | 3000 (internal) | abts-surgeo-web-app |
| **abts-postgres** | Up 2 weeks (healthy) | 5433 (host-mapped) | pgvector/pgvector:pg16 |
| **abts-minio** | Up 2 weeks (healthy) | 9002, 9003 (host-mapped) | minio/minio:latest |
| **abts-surgeo-redis-1** | Up 2 weeks (healthy) | 6380 (host-mapped) | redis:7-alpine |
| **abts-surgeo-celery-worker-1** | Up 2 weeks | — | abts-surgeo-celery-worker |
| **abts-surgeo-celery-beat-1** | Up 2 weeks | — | abts-surgeo-celery-beat |
| **carbon-app** | Up 10 days | 3000 (internal) | carbon-5-app |
| **carbon-api** | Up 10 days | 3001 (internal) | carbon-5-api |
| **carbon-db** | Up 12 days (healthy) | 5442 (host-mapped) | postgres:17-alpine |
| **carbon-redis** | Up 12 days (healthy) | — (internal) | redis:7-alpine |
| **carbon-prefect-server** | Up 12 days | — | prefecthq/prefect:3-latest |
| **carbon-prefect-worker** | Up 12 days | — | prefecthq/prefect:3-latest |
| **carbon-seaweedfs-master** | Up 12 days (healthy) | — (internal) | chrislusf/seaweedfs |
| **carbon-seaweedfs-volume** | Up 12 days | — (internal) | chrislusf/seaweedfs |
| **carbon-seaweedfs-filer** | Up 12 days | — (internal) | chrislusf/seaweedfs |
| **carbon-seaweedfs-s3** | Up 10 days | — (internal) | chrislusf/seaweedfs |
| **sniper-app** | Up 2 weeks | 3000 (internal) | rose-and-berg-app |
| **sniper-api** | Up 2 weeks | 3002 (internal) | rose-and-berg-api |
| **sniper-db** | Up 2 weeks (healthy) | 5435 (host-mapped) | postgres:17-alpine |
| **sniper-redis** | Up 2 weeks (healthy) | 6382 (host-mapped) | redis:7-alpine |
| **va-app** | Up 2 weeks (healthy) | 3000 (internal) | va-app |
| **va-postgres** | Up 2 weeks (healthy) | — (internal) | pgvector/pgvector:0.8.0-pg17 |
| **meadow-app** | Up 12 days | 3000 (internal) | tavr-insight-and-profiler-app |
| **meadow-db** | Up 2 weeks (healthy) | 5436 (host-mapped) | postgres:17-alpine |
| **surgeo-app-1** | Up 9 days (healthy) | 3000 (internal) | surgeo-app |
| **surgeo-db-1** | Up 11 days (healthy) | — (internal) | postgres:17-alpine |
| **the-real-apex-web-1** | Up 15 hours (healthy) | 3000 (internal) | the-real-apex-web |
| **the-real-apex-worker-1** | Up 15 hours | — | the-real-apex-worker |
| **the-real-apex-db-1** | Up 2 weeks (healthy) | — (internal) | postgres:16-alpine |
| **groundtruth-signals-app** | Up 4 days | 3000 (internal) | ground-truth-charlie-app |
| **groundtruth-signals-worker** | Up 4 days | — | ground-truth-charlie worker |
| **ground-truth-charlie-postgres-1** | Up 4 days | 5437 (host-mapped to 192.168.10.51) | postgres:16-alpine |
| **groundtruth-signals-redis** | Up 12 days (healthy) | — (internal) | redis:7-alpine |
| **groundtruth-signals-minio** | Up 12 days | — (internal) | minio/minio |
| **groundtruth-signals-mailpit** | Up 12 days (healthy) | — (internal) | axllent/mailpit |
| **groundtruth-signals-minio-init** | Exited (0) 3 days ago | — | minio/mc |
| **ut-sanantonio-mays-app** | Up 12 days | 3000 (internal) | ut-san-antonio-oncology-app |
| **stryker-intro-app** | Up 12 days | 3000 (internal) | stryker-intro-app |
| **durva-app** | Up 2 weeks | 3000 (internal) | durva-app |
| **origincv-app** | Up 2 weeks | 3000 (internal) | cms-121-app |

## Docker Compose Projects

15 active compose projects:

| Project | Containers | Config Path |
|---------|------------|-------------|
| abts-surgeo | 7 | `/home/ubuntu/code/abts-surgeo/docker-compose.yml` |
| carbon-5 | 10 | `/home/ubuntu/code/carbon-5/docker-compose-preview.yaml` + actions-runner |
| cms-121 | 1 | `/home/ubuntu/actions-runner-cms121/_work/cms-121/cms-121/docker-compose.yml` |
| dayone-rili-synthetics | 5 | `/home/ubuntu/code/dayone-rili-synthetics/docker-compose.yml` |
| durva | 1 | `/home/ubuntu/code/durva/docker-compose.yml` |
| ground-truth-charlie | 6 | `/home/ubuntu/code/ground-truth-charlie/docker-compose.yml` + actions-runner + preview |
| nginx-proxy-manager | 1 | `/home/ubuntu/code/nginx-proxy-manager/stacks/nginx-proxy-manager/docker-compose.yml` |
| platform-core (enercore) | 15 | `/home/ubuntu/code/Platform-Core/docker-compose.yml` |
| rose-and-berg (sniper) | 4 | `/home/ubuntu/code/rose-and-berg/docker-compose.yml` + actions-runner |
| stryker-intro | 1 | `/home/ubuntu/code/stryker-intro/docker-compose.yml` |
| surgeo | 2 | `/home/ubuntu/code/surgeo/docker-compose.yml` |
| tavr-insight-and-profiler (meadow) | 2 | `/home/ubuntu/code/tavr-insight-and-profiler/docker-compose.yml` |
| the-real-apex | 3 | `/home/ubuntu/actions-runner-apex/_work/the-real-apex/the-real-apex/docker-compose.yml` |
| ut-san-antonio-oncology | 1 | `/home/nick/code/ut-san-antonio-oncology/docker-compose.yml` |
| va | 2 | `/home/ubuntu/code/va/docker-compose.yml` |

### Additional Compose Files Not Currently Active

- `/home/ubuntu/code/insights/docker-compose.yml`
- `/home/ubuntu/code/ghost-cal/docker-compose.yml` and `docker-compose.prod.yml`

## Nginx Proxy Manager

- **Container:** `npm` — Up 10 days, healthy
- **Image:** jc21/nginx-proxy-manager:2.13.7
- **Ports:** 80 (HTTP), 81 (admin UI), 443 (HTTPS) — all bound on 0.0.0.0
- **Network:** `proxy_net` bridge — all app containers route through NPM for external access
- **Memory:** 220.8 MiB
- **Network I/O:** 2.13 GB in / 2.06 GB out (high throughput, acting as sole ingress)

NPM serves as the single reverse proxy for all preview applications. App containers expose port 3000 internally and NPM routes external HTTPS traffic to them. Admin UI accessible on port 81.

## Preview Environments

### Architecture

There is no automated preview environment lifecycle. Each project is manually deployed via:

1. Git clone/pull into `/home/ubuntu/code/<project>/`
2. `docker compose up -d` (or triggered by GitHub Actions self-hosted runners)
3. NPM proxy host configured manually for each project's subdomain

### Directory Structure

```
/home/ubuntu/code/
├── Platform-Core/          (enercore — 15 containers)
├── abts-surgeo/
├── carbon-5/
├── cms-121/
├── dayone-rili-synthetics/
├── durva/
├── ghost-cal/              (not running)
├── ground-truth-charlie/
├── insights/               (not running)
├── nginx-proxy-manager/
├── rose-and-berg/
├── stryker-intro/
├── surgeo/
├── tavr-insight-and-profiler/
├── the-real-apex/
└── va/

/home/nick/code/
└── ut-san-antonio-oncology/   (separate user home)
```

No `/opt/previews/` directory exists. No metadata files, no preview registry, no automated cleanup.

### GitHub Actions Self-Hosted Runners (10 total)

| Runner Name | Repo |
|-------------|------|
| vm101-apex-deployer | no-hype-ai/the-real-apex |
| vm101-carbon5-deployer | data-kinetic-projects/carbon-5 |
| vm101-cms121-deployer | data-kinetic-projects/cms-121 |
| vm101-durva-deployer | data-kinetic-projects/durva (inferred) |
| vm101-ghost-cal-deployer | (inferred) |
| vm101-groundtruth-signals-deployer | (inferred) |
| vm101-rnb-deployer | (inferred from actions-runner-rnb) |
| vm101-stryker-deployer | (inferred from actions-runner-stryker) |
| vm101-tavr-deployer | (inferred from actions-runner-tavr) |
| vm101-default (actions-runner) | (inferred) |

Each runner occupies 1.1-2.3 GB on disk. Total runner disk: ~19.3 GB.

## Resource Utilization

### Memory Per Container (Top Consumers)

| Container | Memory | % of Total |
|-----------|--------|------------|
| rili-app-dev | 1.86 GiB | 1.48% |
| the-real-apex-worker-1 | 841.7 MiB | 0.65% |
| enercore-alloy | 261.6 MiB | 0.20% |
| enercore-grafana | 237.8 MiB | 0.18% |
| npm | 220.8 MiB | 0.17% |
| carbon-prefect-server | 212.5 MiB | 0.16% |
| rili-minio | 205.6 MiB | 0.16% |
| abts-api | 187.4 MiB | 0.15% |
| enercore-mongo | 180.7 MiB | 0.14% |
| enercore-web | 177.6 MiB | 0.14% |

Total container memory: ~5.5 GiB (system shows 12 GiB used — the rest is OS, runners, and build artifacts in page cache).

### Disk Usage Breakdown

| Path | Size | Notes |
|------|------|-------|
| `/var/lib/docker/` | ~370 GB (inferred) | Images, volumes, container layers |
| `/home/ubuntu/code/` | 11 GB | Source code checkouts |
| `/home/ubuntu/actions-runner*` | ~19.3 GB | 10 self-hosted runners + work dirs |
| `/home/ubuntu/setup-pnpm/` | 1.1 GB | pnpm cache |
| `/opt/az/` | 639 MB | Azure CLI |
| **Root filesystem total** | 398 GB used / 485 GB | **83% full** |

### Docker Images

52 unique images stored locally. Notable large images:

| Image | Size |
|-------|------|
| the-real-apex-worker | 3.57 GB |
| platform-core-api | 2.95 GB |
| ground-truth-charlie-setup | 2.79 GB |
| ground-truth-charlie-worker | 2.53 GB |
| surgeo-migrator | 2.0 GB |
| dayone-rili-synthetics-app/worker | 1.57 GB each |
| metabase/metabase | 1.56 GB |
| abts-surgeo-api | 1.46 GB |
| abts-surgeo-celery-beat/worker | 1.17 GB each |
| prefecthq/prefect | 1.16 GB |
| mongo:7 | 1.15 GB |
| rose-and-berg-api | 1.02 GB |

No dangling images found (0).

### Docker Volumes

43 named volumes + 7 anonymous volumes. Key volume groups:

- **platform-core (enercore):** pgdata, redis, mongo, grafana, loki, tempo, seaweedfs (master/volume/filer) — 9 volumes
- **carbon-5:** pgdata, redis, prefect, seaweed (master/volume/filer) — 6 volumes
- **abts-surgeo:** postgres, redis, minio, celery_beat — 4 volumes
- **dayone-rili-synthetics:** postgres, redis, minio — 3 volumes
- **ground-truth-charlie:** pgdata, redis, minio, gtc-postgres — 4 volumes
- **rose-and-berg (sniper):** pgdata, redis — 2 volumes
- **Others:** surgeo, tavr/meadow, the-real-apex, va, insights (orphaned) — 5 volumes

## Network Configuration

### Interfaces

| Interface | IP Address | Purpose |
|-----------|------------|---------|
| eth0 | 192.168.10.51/24 | Primary LAN (cluster network) |
| eth1 | 10.0.0.51/24 | Secondary network (DMZ or management) |
| lo | 127.0.0.1/8 | Loopback |
| docker0 | 172.17.0.1/16 | Default Docker bridge (no containers) |

### Docker Bridge Networks (13)

Each compose project gets its own isolated bridge network:

- proxy_net (172.19.0.0/16) — NPM and routed services
- abts-surgeo_abts-network (172.20.0.0/16)
- carbon-5_carbon-network (172.25.0.0/16)
- dayone-rili-synthetics_rili-network (172.18.0.0/16)
- ground-truth-charlie_default (172.29.0.0/16)
- ground-truth-charlie_gtc-network (172.27.0.0/16)
- platform-core_enercore-network (172.21.0.0/16)
- rose-and-berg_sniper-network (172.22.0.0/16)
- surgeo_default (172.28.0.0/16)
- tavr-insight-and-profiler_meadow-network (172.23.0.0/16)
- the-real-apex_default (172.26.0.0/16)
- va_va_internal (172.24.0.0/16)

### Host-Bound Listening Ports

| Port | Service | Binding |
|------|---------|---------|
| 22 | SSH | 0.0.0.0 |
| 53 | systemd-resolved | 127.0.0.53 |
| 80 | NPM (HTTP) | 0.0.0.0 |
| 81 | NPM (Admin UI) | 0.0.0.0 |
| 443 | NPM (HTTPS) | 0.0.0.0 |
| 3000 | rili-app-dev | 0.0.0.0 |
| 3101 | enercore-loki | 0.0.0.0 |
| 3201 | enercore-tempo | 0.0.0.0 |
| 3301 | enercore-grafana | 0.0.0.0 |
| 4243 | enercore-unleash | 0.0.0.0 |
| 4319-4320 | enercore-alloy (OTLP) | 0.0.0.0 |
| 5432 | rili-postgres | 0.0.0.0 |
| 5433 | abts-postgres | 0.0.0.0 |
| 5434 | enercore-db | 0.0.0.0 |
| 5435 | sniper-db | 0.0.0.0 |
| 5436 | meadow-db | 0.0.0.0 |
| 5437 | groundtruth-charlie-postgres | 192.168.10.51 only |
| 5442 | carbon-db | 0.0.0.0 |
| 6379 | rili-redis | 0.0.0.0 |
| 6380 | abts-redis | 0.0.0.0 |
| 6381 | enercore-redis | 0.0.0.0 |
| 6382 | sniper-redis | 0.0.0.0 |
| 8081 | enercore-seaweedfs-volume | 0.0.0.0 |
| 8334 | enercore-seaweedfs-filer | 0.0.0.0 |
| 8889 | enercore-seaweedfs-filer | 0.0.0.0 |
| 9000-9001 | rili-minio | 0.0.0.0 |
| 9002-9003 | abts-minio | 0.0.0.0 |
| 9334 | enercore-seaweedfs-master | 0.0.0.0 |
| 12346 | enercore-alloy | 0.0.0.0 |
| 18081 | enercore-seaweedfs-volume | 0.0.0.0 |
| 18889 | enercore-seaweedfs-filer | 0.0.0.0 |
| 19334 | enercore-seaweedfs-master | 0.0.0.0 |
| 27018 | enercore-mongo | 0.0.0.0 |

### Connectivity

- **Platform API (dk.datakinetic.com):** Cannot reach — connection failed. DNS resolution or outbound HTTPS may be blocked, or the Platform API is down.

## Security Posture

### Firewall

- **UFW:** Installed but **inactive** (Status: inactive)
- **No firewall rules in effect.** All host-bound ports above are accessible from the entire LAN (192.168.10.0/24) and potentially beyond.

### SSH

- SSH on port 22, bound on all interfaces
- Key-based authentication via `~/.ssh/id_rsa_penguin`

### Exposed Services — Risk Assessment

| Risk Level | Issue |
|------------|-------|
| **HIGH** | 7 PostgreSQL instances bound on 0.0.0.0 — accessible from any network host without firewall |
| **HIGH** | 4 Redis instances bound on 0.0.0.0 — Redis has no default authentication |
| **HIGH** | 2 MinIO instances bound on 0.0.0.0 — object storage consoles exposed |
| **HIGH** | MongoDB bound on 0.0.0.0:27018 — no firewall protection |
| **MEDIUM** | NPM admin UI on port 81 accessible from LAN without restriction |
| **MEDIUM** | Grafana, Loki, Tempo, Unleash all bound on 0.0.0.0 |
| **MEDIUM** | No swap configured — OOM risk with 59 containers |
| **LOW** | SeaweedFS management ports exposed but low-risk data |

### Scheduled Tasks

- **No crontabs** configured for either `ubuntu` or `root` users.
- No automated cleanup, no log rotation beyond defaults, no health check scripts.

## Recommendations

### P0 — Immediate Action Required

1. **Investigate load average spike (111.03 on 16 cores).** This is 7x CPU capacity. Identify and remediate the runaway process(es). Likely candidates: `the-real-apex-worker-1` (841 MiB, 3.57 GB image), `carbon-prefect-server` (3.48% CPU sustained), or a GitHub Actions runner build.

2. **Enable UFW or equivalent firewall.** At minimum, restrict database ports (5432-5442, 27018) and Redis ports (6379-6382) to localhost only. Only ports 22, 80, and 443 should be reachable from the network.

3. **Address disk usage (83%).** With 88 GB free and 15 active projects generating container data, this will hit 90%+ within weeks. Immediate actions:
   - Remove unused images (e.g., `metabase/metabase` — 1.56 GB, `surgeo-migrator` — 2.0 GB if not needed)
   - `docker system prune` to clean build cache and stopped containers
   - Audit orphaned volumes (`insights_*` volumes exist but no `insights` compose project is running)
   - Clean GitHub Actions runner `_work` directories for completed jobs

### P1 — Short-Term Improvements

4. **Standardize port binding.** All databases and caches should bind to `127.0.0.1` only. NPM should be the sole externally-accessible service (besides SSH). Update all `docker-compose.yml` files to use `127.0.0.1:PORT:PORT` instead of `0.0.0.0:PORT:PORT`.

5. **Add swap space (4-8 GB).** With 59 containers and no swap, a memory spike will cause hard OOM kills. Even a small swap file provides a safety buffer.

6. **Consolidate runner deployment.** 10 separate GitHub Actions runners (19.3 GB) is inefficient. Consider:
   - A single runner with labels, or
   - Ephemeral runners via the `actions-runner-controller` pattern, or
   - Moving to the platform K3s cluster for preview deploys (aligning with the dk-planning standardization goals)

7. **Implement automated cleanup.** Add a cron job to:
   - `docker system prune -f --filter "until=168h"` weekly
   - Clean old build artifacts from runner `_work` directories
   - Alert when disk usage exceeds 85%

### P2 — Standardization Prerequisites

8. **Establish a preview environment registry.** Currently there is no metadata tracking which previews are active, when they were deployed, or which PR/branch they correspond to. This is prerequisite to any automated lifecycle management.

9. **Consolidate code directories.** Two users (`ubuntu` and `nick`) have code checkouts. `ut-san-antonio-oncology` is deployed from `/home/nick/code/` while everything else is under `/home/ubuntu/code/`. Standardize to a single path.

10. **Migrate to NPM-only ingress model.** Ensure all app containers only expose ports on internal Docker networks, never on the host. NPM handles all external routing.

11. **Separate concerns.** Platform-Core (enercore) runs 15 containers including a full observability stack (Grafana, Loki, Tempo, Alloy). This should either:
    - Be the shared observability stack for all previews (and renamed/documented as such), or
    - Be stripped down to just the app containers, with observability handled by the central K3s LGTM stack

12. **Define resource limits.** No container has CPU or memory limits set. Add `deploy.resources.limits` to all compose files to prevent any single project from starving others.

### P3 — Migration Path

13. **Target architecture:** Replace ad-hoc Docker Compose deployments with a standardized preview system managed by the Platform API, where:
    - Preview creation is triggered by PR events via GitHub webhooks
    - Each preview gets an isolated namespace with resource quotas
    - NPM proxy hosts are configured automatically via API
    - Previews are automatically cleaned up when PRs are merged/closed
    - This VM serves as the compute backend, managed by the platform rather than manually

14. **Decommission candidates:** Projects that are inactive or have no recent container restarts should be evaluated for removal:
    - `insights` — volumes exist but no running containers
    - `ghost-cal` — compose file exists but no running containers
    - `groundtruth-signals-minio-init` — exited, can be removed
