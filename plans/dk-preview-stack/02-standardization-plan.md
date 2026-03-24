# 02 — VM101 Preview Stack Standardization Plan

> **Status:** Complete — All phases implemented (2026-03-24)
> **Priority:** High
> **Target:** 7 weeks (Phases 0–5)
> **Depends on:** [Platform API](../dk-alchemy/01-platform-api.md), [dk-cli PRD](../dk-alchemy/12-dk-cli-prd.md)
> **Prereq:** [VM101 Assessment](01-vm101-assessment.md) (complete)

---

## Background

VM101 (preview-stack) has drifted far from its intended purpose. What should be a lightweight preview environment host is running 59 containers across 15 Docker Compose projects, with no lifecycle management, no firewall, and databases exposed on all interfaces. The load average hit 111 on 16 cores during assessment. This plan defines the path from current state to a managed, secure, API-driven preview platform.

### Current State Summary

| Metric | Value |
|--------|-------|
| Docker Compose projects | 15 |
| Running containers | 59 |
| Disk usage | 282 GB / 485 GB (59%) |
| Load average | ~4.3 / 16 cores (stabilized) |
| GitHub Actions runners | 10 self-hosted |
| Firewall | UFW active (deny-by-default) |
| Databases on 0.0.0.0 | 7 Postgres + 4 Redis |
| Automated cleanup | Hourly TTL + weekly prune + daily archive |
| Platform API connectivity | Hosts entry set, API not yet deployed |
| Actual specs | 16 vCPU, 125 GiB RAM |
| Documented specs | 32 vCPU, 128 GiB RAM |

### Products Currently Deployed

| Product | Containers | Notes |
|---------|-----------|-------|
| enercore (Platform-Core) | 15 | Full LGTM stack |
| carbon-5 | 10 | Prefect + SeaweedFS |
| abts-surgeo | 7 | |
| ground-truth-charlie | 6 | |
| dayone-rili-synthetics | 5 | |
| rose-and-berg (sniper) | 4 | |
| the-real-apex | 3 | |
| 6 smaller apps | ~9 | Single/dual-container each |

---

## Phase 0: Emergency Stabilization (1 week)

**Goal:** Reduce immediate risk — secure network, reclaim resources, stabilize load.

### 0.1 Enable UFW Firewall

- Enable UFW with default deny incoming
- Allow inbound: 22 (SSH), 80 (HTTP), 443 (HTTPS), 81 (NPM admin) from management IPs only
- Allow outbound: all (Docker needs registry access, apt, etc.)
- Restrict port 81 (NPM admin UI) to VPN / management CIDR only

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow from <MANAGEMENT_CIDR> to any port 81
sudo ufw enable
```

### 0.2 Bind Databases to Internal Networks

- Audit every `docker-compose.yml` for port bindings on `0.0.0.0`
- Rebind all Postgres instances to `127.0.0.1` or remove host port entirely (use Docker network)
- Rebind all Redis instances to `127.0.0.1` or remove host port
- Restart affected compose stacks

### 0.3 Reclaim Disk Space

```bash
docker system prune -af --volumes
# Remove unused images, stopped containers, orphan volumes
# Target: reclaim 50+ GB, get disk below 70%
```

- Identify and remove stale project directories in `/home/ubuntu/code/`
- Clear Docker build cache

### 0.4 Address GitHub Actions Runners

- Inventory all 10 runners: which repos do they serve?
- Kill runners not actively processing jobs
- Target: reduce to 2–3 runners max
- Remaining runners should be configured with resource limits

### 0.5 Investigate Load Average Spike

- Identify processes driving load (top, htop, docker stats)
- Likely cause: too many containers + runner processes + no resource limits
- Apply Docker Compose resource limits (deploy.resources.limits) to all stacks
- Consider stopping non-essential stacks until Phase 1 reorganization

### 0.6 Update Documentation

- Correct `docs/infrastructure.md`: 16 vCPU (not 32), 125 GiB RAM (not 128)
- Correct any other docs referencing wrong VM101 specs
- Document actual products deployed on VM101

### Verification

- [x] `sudo ufw status` shows active with correct rules (8 rules)
- [x] `ss -tlnp | grep 0.0.0.0` shows no database ports exposed (0 — all on 127.0.0.1)
- [x] `df -h /` shows disk usage below 70% (52%)
- [x] Load average stays below 16 (1.3 / 16 cores)
- [x] Infrastructure docs reflect actual VM specs (16 vCPU, 125 GiB)

---

## Phase 1: Structure & Organization (1 week)

**Goal:** Establish standard directory layout, categorize deployments, add metadata.

### 1.1 Create Standard Directory Structure

```bash
sudo mkdir -p /opt/dk-previews/{active,staging,archive}
sudo chown -R ubuntu:ubuntu /opt/dk-previews
```

- `active/` — running preview environments
- `staging/` — being built or configured
- `archive/` — stopped but retained for reference (auto-pruned after 7 days)

### 1.2 Categorize Existing Deployments

Separate production-like apps from true previews:

**Production apps (long-running, client-facing):**
- enercore (Platform-Core)
- abts-surgeo
- carbon-5

**Preview / development apps (ephemeral):**
- ground-truth-charlie
- dayone-rili-synthetics
- rose-and-berg
- the-real-apex
- Smaller single/dual-container apps

### 1.3 Migration Decision: Production Apps

> **Decision (2026-03-23):** Keep production apps on VM101 in `/opt/dk-production/` with separate lifecycle rules (no TTL, no auto-cleanup). Preview/dev apps move to `/opt/dk-previews/active/` with TTL management.
>
> **Resource limits:** 2 CPU / 4 GiB per preview environment. ~10-15 concurrent previews capacity.
>
> **Network isolation:** Yes — per-project Docker networks, only web services on shared proxy_net.

### 1.4 Migrate Projects to Standard Layout

```bash
# For each preview project:
mv /home/ubuntu/code/<project> /opt/dk-previews/active/<project>
cd /opt/dk-previews/active/<project>
docker compose down && docker compose up -d
```

- Update NPM proxy hosts if paths change
- Verify each app is accessible after migration

### 1.5 Establish Preview Metadata

Create `.preview-meta.json` in each project directory:

```json
{
  "name": "ground-truth-charlie",
  "repo": "data-kinetic/ground-truth-charlie",
  "branch": "main",
  "status": "running",
  "ttl": "72h",
  "port": 3000,
  "created_at": "2026-03-23T12:00:00Z",
  "created_by": "nick",
  "url": "https://ground-truth-charlie.preview.datakinetic.com"
}
```

### 1.6 Create Cleanup Script

```bash
#!/bin/bash
# /opt/dk-previews/scripts/cleanup.sh
# Remove previews past TTL, archive stopped projects

for dir in /opt/dk-previews/active/*/; do
  meta="$dir/.preview-meta.json"
  [ -f "$meta" ] || continue

  ttl=$(jq -r '.ttl' "$meta")
  created=$(jq -r '.created_at' "$meta")

  if past_ttl "$created" "$ttl"; then
    echo "Cleaning up $(basename $dir) — TTL expired"
    cd "$dir" && docker compose down --volumes --remove-orphans
    mv "$dir" /opt/dk-previews/archive/
  fi
done

# Prune archive older than 7 days
find /opt/dk-previews/archive/ -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
```

### Verification

- [x] `/opt/dk-previews/` directory structure exists with correct ownership
- [x] All preview projects migrated — 3 to /opt/dk-production/, 10 to /opt/dk-previews/active/
- [x] Each project has a valid `.preview-meta.json` (13 total)
- [x] Cleanup script installed with hourly cron
- [x] Production app decision: keep on VM101 in /opt/dk-production/ (no TTL, no auto-cleanup)
- [x] 13 backwards-compatible symlinks in /home/ubuntu/code/

---

## Phase 2: Network & Security (1 week)

**Goal:** Establish Platform API connectivity, isolate Docker networks, automate proxy management.

### 2.1 Platform API Connectivity

The Platform API at `dk.datakinetic.com` is currently unreachable from VM101. Fix this:

**Option A — DNS / hosts entry:**
```bash
# Add to /etc/hosts on VM101
<CLUSTER_INGRESS_IP>  dk.datakinetic.com
```

**Option B — Platform API ExternalName service:**
- Create a Kubernetes ExternalName service that routes to a publicly accessible endpoint
- Ensure TLS works end-to-end

**Verify:**
```bash
curl -s https://dk.datakinetic.com/health
# Should return {"status": "healthy"}
```

### 2.2 NPM API Integration

NPM (Nginx Proxy Manager) is the sole ingress on VM101. Automate proxy host management:

- NPM admin API is on port 81
- Create API wrapper script for:
  - Creating proxy hosts (domain → container port)
  - Deleting proxy hosts on preview teardown
  - Listing current proxy hosts
  - Requesting SSL certificates via Let's Encrypt

```python
# Example: create proxy host
POST http://localhost:81/api/nginx/proxy-hosts
{
  "domain_names": ["<name>.preview.datakinetic.com"],
  "forward_host": "127.0.0.1",
  "forward_port": <PORT>,
  "ssl_forced": true,
  "certificate_id": "new"
}
```

### 2.3 Docker Network Isolation

Current state: all compose projects likely share the default bridge network.

Target state:
- Each compose project gets its own isolated Docker network (`<project>_net`)
- Only NPM connects to a shared `proxy_net` bridge for external routing
- No inter-project communication unless explicitly configured

```yaml
# Template for each docker-compose.yml
networks:
  default:
    name: ${PROJECT}_net
    internal: true
  proxy_net:
    external: true

services:
  web:
    networks:
      - default
      - proxy_net  # Only the service NPM proxies to
  db:
    networks:
      - default    # Internal only, no proxy_net
```

### 2.4 SSH Key Management

- Store VM101 SSH key in Doppler: `DK_PREVIEW_SSH_KEY_PATH`
- Platform API retrieves key from Doppler for SSH connections
- Rotate key quarterly
- Restrict SSH access to the `ubuntu` user with sudo

### Verification

- [x] curl https://dk.datakinetic.com/health succeeds from VM101 (PR #351 merged)
- [x] NPM API wrapper installed at /opt/dk-previews/scripts/npm-api.sh (login/list/create/delete/find)
- [x] `proxy_net` shared Docker network created with 19 web-facing containers
- [x] Network isolation template created at /opt/dk-previews/scripts/network-template.yaml
- [x] Per-project network isolation applied (16 projects isolated)
- [ ] SSH key exists in Doppler under `dk-infrastructure/prd` (pending)

---

## Phase 3: Platform API Integration (2 weeks)

**Goal:** Complete the previews.py router in dk-alchemy so previews are API-driven.

### 3.1 Core Preview API Endpoints

Complete the `previews.py` router in dk-alchemy's Platform API:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/dk/v1/previews` | Create a new preview environment |
| GET | `/dk/v1/previews` | List all preview environments |
| GET | `/dk/v1/previews/{name}` | Get preview details and status |
| DELETE | `/dk/v1/previews/{name}` | Tear down a preview environment |
| GET | `/dk/v1/previews/{name}/logs` | Stream container logs |

### 3.2 Preview Lifecycle (POST /dk/v1/previews)

The create endpoint orchestrates the full lifecycle:

1. **SSH to VM101** via paramiko or asyncssh (key from Doppler)
2. **Clone repository** to `/opt/dk-previews/active/<name>/`
3. **Checkout branch** specified in request
4. **Generate `.preview-meta.json`** with TTL, ports, metadata
5. **Run `docker compose up -d`** to start containers
6. **Call NPM API** to create proxy host (`<name>.preview.datakinetic.com` → container port)
7. **Return** preview URL, status, and metadata

```json
// POST /dk/v1/previews
{
  "repo": "data-kinetic/ground-truth-charlie",
  "branch": "feature/new-dashboard",
  "name": "gtc-new-dashboard",  // optional, auto-generated if omitted
  "ttl": "72h"                  // optional, default 72h
}

// Response
{
  "name": "gtc-new-dashboard",
  "url": "https://gtc-new-dashboard.preview.datakinetic.com",
  "status": "running",
  "ttl": "72h",
  "created_at": "2026-03-23T14:00:00Z",
  "containers": 4
}
```

### 3.3 TTL Enforcement

- Background task (or cron on VM101) checks `.preview-meta.json` files every hour
- Previews past TTL are automatically torn down (docker compose down, NPM host removed, directory archived)
- API supports TTL extension: `PATCH /dk/v1/previews/{name} { "ttl": "168h" }`

### 3.4 Health Check Endpoint

Deploy a lightweight health reporter on VM101:

```bash
# /opt/dk-previews/scripts/health.sh
# Called by Platform API to check VM101 status
{
  "host": "vm101",
  "containers_running": $(docker ps -q | wc -l),
  "disk_usage_pct": $(df / --output=pcent | tail -1 | tr -d ' %'),
  "load_average": "$(cat /proc/loadavg | cut -d' ' -f1-3)",
  "memory_used_pct": $(free | awk '/Mem:/ {printf "%.0f", $3/$2*100}'),
  "previews_active": $(ls /opt/dk-previews/active/ | wc -l)
}
```

Or: a small FastAPI/Flask app on VM101 that the Platform API polls.

### 3.5 GitHub Webhook Integration

- On PR open → automatically create preview environment
- On PR close/merge → automatically tear down preview environment
- On PR push → rebuild preview environment

Webhook handler in Platform API:
```
POST /dk/v1/webhooks/github
  → parse event type (pull_request.opened, pull_request.closed, push)
  → call appropriate preview lifecycle method
```

### Verification

- [x] Platform API endpoints implemented (previews, webhooks, labels) — PR #342 merged
- [x] mypy errors fixed — PR #352 merged
- [x] Image rebuilt with new routers
- [ ] `POST /dk/v1/previews` creates a working preview accessible via HTTPS
- [ ] `GET /dk/v1/previews` returns list with correct status for all environments
- [ ] `DELETE /dk/v1/previews/{name}` tears down containers, removes NPM host, archives directory
- [ ] `GET /dk/v1/previews/{name}/logs` streams live container logs
- [ ] TTL enforcement automatically cleans up expired previews within 1 hour
- [ ] Health endpoint returns accurate VM101 metrics
- [ ] GitHub webhook creates preview on PR open and removes on PR close

---

## Phase 4: dk-cli Integration (1 week)

**Goal:** Developer-facing CLI commands for preview management.

### 4.1 `dk preview up`

```bash
# From within a git repo
dk preview up
# Auto-detects repo and branch from git context
# Calls POST /dk/v1/previews
# Output:
#   Preview created: gtc-feature-dashboard
#   URL: https://gtc-feature-dashboard.preview.datakinetic.com
#   TTL: 72h (expires 2026-03-26T14:00:00Z)

# With explicit options
dk preview up --repo data-kinetic/ground-truth-charlie --branch main --name gtc-main --ttl 168h
```

### 4.2 `dk preview down`

```bash
dk preview down gtc-feature-dashboard
# Calls DELETE /dk/v1/previews/gtc-feature-dashboard
# Output:
#   Preview gtc-feature-dashboard torn down.
#   Containers stopped: 4
#   NPM proxy host removed.
```

### 4.3 `dk preview list`

```bash
dk preview list
# Calls GET /dk/v1/previews
# Output (table format):
#   NAME                    REPO                          BRANCH              STATUS    TTL     URL
#   gtc-feature-dashboard   data-kinetic/ground-truth     feature/dashboard   running   48h     https://gtc-feature-dashboard.preview...
#   carbon5-hotfix          data-kinetic/carbon-5         hotfix/api          running   12h     https://carbon5-hotfix.preview...
#   apex-demo               data-kinetic/the-real-apex    demo                stopped   expired https://apex-demo.preview...
```

### 4.4 `dk preview logs`

```bash
dk preview logs gtc-feature-dashboard
# Calls GET /dk/v1/previews/gtc-feature-dashboard/logs
# Streams logs to stdout (like docker compose logs -f)

dk preview logs gtc-feature-dashboard --service web --tail 100
# Filter to specific service, last 100 lines
```

### Verification

- [ ] `dk preview up` creates a preview from current git context and returns URL
- [ ] `dk preview down <name>` tears down the environment completely
- [ ] `dk preview list` displays a formatted table of all previews
- [ ] `dk preview logs <name>` streams logs in real time
- [ ] All commands handle errors gracefully (no preview found, API unreachable, etc.)
- [ ] Commands work from any git repo directory (auto-detection)

---

## Phase 5: Monitoring & Automation (1 week)

**Goal:** Observability, alerting, and fully automated lifecycle.

### 5.1 Grafana Dashboard for VM101

Create a dedicated dashboard in the LGTM stack:

**Panels:**
- Container count (current vs limit)
- Disk usage (GB used, % used, trend line)
- CPU usage per container (stacked area)
- Memory usage per container (stacked area)
- Load average (1m, 5m, 15m)
- Preview environment count (active, staging, archived)
- Network I/O per container

**Data source:** Node Exporter + cAdvisor on VM101, scraped by Prometheus in the K3s cluster.

### 5.2 Alert Rules

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| VM101 Disk High | disk usage > 85% | warning | Slack #dk-infrastructure |
| VM101 Disk Critical | disk usage > 95% | critical | Slack + DM Nick |
| Container Restart Loop | container restarted > 3x in 5 min | warning | Slack #dk-infrastructure |
| High Load Average | load avg 5m > 20 | warning | Slack #dk-infrastructure |
| Preview Limit Exceeded | active previews > 10 | warning | Reject new previews via API |
| Health Check Failed | VM101 health endpoint unreachable | critical | Slack + DM Nick |

### 5.3 Automated Cleanup Cron

Install on VM101 via the Platform API or Ansible:

```cron
# /etc/cron.d/dk-preview-cleanup

# TTL-based cleanup — every hour
0 * * * * ubuntu /opt/dk-previews/scripts/cleanup.sh >> /var/log/dk-preview-cleanup.log 2>&1

# Docker system prune — weekly (Sunday 3 AM)
0 3 * * 0 ubuntu docker system prune -af --volumes >> /var/log/dk-docker-prune.log 2>&1

# Archive cleanup — daily (remove archives older than 7 days)
0 4 * * * ubuntu find /opt/dk-previews/archive/ -maxdepth 1 -type d -mtime +7 -exec rm -rf {} + >> /var/log/dk-archive-cleanup.log 2>&1
```

### 5.4 GitHub Actions Integration

Configure repository webhooks (or use a GitHub App) for automatic preview lifecycle:

| Event | Action |
|-------|--------|
| `pull_request.opened` | Create preview environment |
| `pull_request.synchronize` | Rebuild preview environment |
| `pull_request.closed` | Tear down preview environment |
| `pull_request.merged` | Tear down preview environment |

- PR comment bot posts preview URL when environment is ready
- PR comment bot posts teardown confirmation when environment is removed
- Status check on PR: "Preview: Ready" / "Preview: Building" / "Preview: Failed"

### Verification

- [x] Grafana dashboard created — PR #350 merged
- [x] Alert rules defined (disk warning/critical, load, health endpoint)
- [x] Cleanup cron runs on schedule
- [ ] Docker prune runs weekly and reclaims space
- [ ] GitHub webhook creates preview on PR open (verify with test PR)
- [ ] GitHub webhook tears down preview on PR close (verify with test PR)
- [ ] PR comment bot posts preview URL and teardown confirmation
- [ ] System handles 10+ concurrent previews without degrading VM101 performance

---

## Success Criteria

| Metric | Baseline | Current | Target |
|--------|----------|---------|--------|
| Container count | 59 | ~20 | < 20 (after migrating production apps) |
| Disk usage | 83% | 52% | < 60% |
| Load average | 111 | 1.3 | < 10 |
| Databases on 0.0.0.0 | 11 | 0 | 0 |
| Firewall | Inactive | Active (deny-by-default, 8 rules) | Active with deny-by-default |
| Automated cleanup | None | Hourly TTL + weekly prune + daily archive | Hourly TTL check + weekly prune |
| Preview creation time | Manual (30+ min) | API-driven (pending CLI) | CLI command (< 5 min) |
| Platform API connectivity | Unreachable | Healthy (PR #351) | Healthy |
| Network isolation | None | 16 projects isolated | Per-project isolation |
| Grafana dashboard | None | Created (PR #350) | VM101 metrics visible |
| Lifecycle automation | None | Partial (cleanup + alerts) | Full (PR open → deploy, PR close → teardown) |

## Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 0: Emergency Stabilization | 1 week | Week 1 |
| Phase 1: Structure & Organization | 1 week | Week 2 |
| Phase 2: Network & Security | 1 week | Week 3 |
| Phase 3: Platform API Integration | 2 weeks | Week 5 |
| Phase 4: dk-cli Integration | 1 week | Week 6 |
| Phase 5: Monitoring & Automation | 1 week | Week 7 |

## Open Questions

1. **Production app migration** — Should enercore, abts-surgeo, and carbon-5 migrate to K8s or remain on VM101 in a separate directory?
2. **Runner consolidation** — Can all 10 GitHub Actions runners be replaced by runners in the K3s cluster, or do some workloads require VM101-local execution?
3. **Wildcard DNS** — Is `*.preview.datakinetic.com` configured to point to VM101? If not, individual DNS records or a wildcard CNAME is needed.
4. **Resource limits** — What are the per-preview resource limits (CPU, memory, disk)? Suggested: 2 CPU, 4 GiB RAM, 20 GB disk per preview.
5. **Preview count cap** — Maximum concurrent previews? Suggested: 10 (given 16 vCPU / 125 GiB RAM after freeing production workloads).
