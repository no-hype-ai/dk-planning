# Preview Environments

## Overview

Preview environments allow product repos to deploy branch-based previews accessible at `*.preview.behaviorlabs.ai` or `*.preview.datakinetic.com`. These run on a dedicated VM as [Docker](https://docs.docker.com/) Compose projects, routed through the edge load balancers.

## Current State

As of 2026-03-26, all 12 preview projects are **API-managed** (`managed: true`) via the Platform API and deployed to `/opt/dk-previews/active/`. VM101 hosts 12 preview projects + 2 production apps, running Ubuntu 22.04.5 LTS with Docker 29.2.1.

**Platform API integration (Phase 3) — operational:**
- All preview CRUD endpoints functional (`POST/GET/DELETE /dk/v1/previews`)
- NPM proxy hosts auto-registered on `*.preview.datakinetic.com` for all 12 projects
- Doppler secrets injection working (falls back to plain compose for apps without Doppler)
- Port allocation range 10000-10999 with lock file mechanism
- dk-cli commands (`dk preview up/down/list/logs/drift`) all implemented
- Traefik IngressRoutes deployed for `*.preview.datakinetic.com` and `*.preview.behaviorlabs.ai`

**Infrastructure hardening (Phase 0-2) — complete:**
- UFW firewall active (deny-by-default incoming, 8 rules)
- Automated cleanup cron jobs installed (hourly TTL, weekly Docker prune, daily archive cleanup)
- Health endpoint at port 9100
- Disk usage at 20% (96 GB / 485 GB)
- Databases bound to 127.0.0.1
- Docker network isolation (per-project networks + shared proxy_net)
- Standard directory layout: `/opt/dk-previews/active/` (12 projects), `/opt/dk-production/` (2 production apps)

**Known issues:**
- rose-and-berg: `docker-compose.preview.yaml` incomplete (missing app/api services — only db and redis)
- Legacy NPM proxy hosts with old domain names (`.behaviorlabs.ai`, `sniper.`, `ghost.`) still exist — can be cleaned up
- GitHub webhooks not yet registered on product repos (auto-preview on PR not active)
- Legacy GitHub Actions self-hosted runners still running on VM101 (~19 GB disk)

### Infrastructure

| Property | Value |
|----------|-------|
| **VM** | vm101-preview-stack (penguin, VMID 101) |
| **Cluster IP** | 10.0.0.51 (vmbr1, isolated) |
| **DMZ IP** | 172.16.100.51 (vmbr2, for edge routing) |
| **Resources** | 16 vCPU, 64 GiB RAM (62 GiB usable, balloon min 32 GiB), 485 GB disk |
| **Reverse proxy** | Nginx Proxy Manager (port 80) |

### Domains

| Domain Pattern | Use Case |
|---------------|----------|
| `*.preview.behaviorlabs.ai` | BehaviorLabs product previews |
| `*.preview.datakinetic.com` | Data Kinetic previews |
| `enercore.ai`, `*.enercore.ai` | Enercore production (also routed through NPM) |

### Network Path

```
External client → DNS → UDM WAN DNAT
  → 172.16.100.100:443 (Keepalived VIP)
  → phantom/venom edge LB ([Traefik](https://doc.traefik.io/traefik/) TLS termination)
  → 10.0.0.51:80 (NPM on preview-stack)
  → Docker container (host-based routing)
```

## How It Works

### dk-cli Commands

| Command | Purpose |
|---------|---------|
| `dk preview up` | Deploy preview from current repo/branch. Options: `--name`, `--ttl`, `--domain`, `--doppler-config`. |
| `dk preview down <name>` | Tear down a preview and clean up resources |
| `dk preview list` | Show all active preview deployments with URLs and status |
| `dk preview logs <name>` | Stream logs from a preview's services. Options: `--service`, `--tail`. |
| `dk preview drift` | Check configuration drift between deployed and repo compose files |

### Deployment Flow

1. Developer runs `dk preview up` from their product repo
2. dk-cli sends request to Platform API (`POST /dk/v1/previews`) with repo, branch, and services
3. Platform API:
   - Clones the repo/branch on VM101 via SSH (using GitHub App installation token)
   - Allocates a host port from the 10000-10999 range
   - Starts services with [Doppler](https://docs.doppler.com/) secrets injection (`doppler run -- docker compose -f docker-compose.preview.yaml up -d`)
   - Registers NPM proxy host for `<name>.preview.datakinetic.com` → `172.17.0.1:<port>`
   - Returns the preview URL
4. Preview is accessible at `https://<name>.preview.datakinetic.com`
5. Cleanup: `dk preview down` or automatic TTL expiry

### Requirements for Product Repos

Each repo must have a `docker-compose.preview.yaml` at the root with:
- An `APP_PORT` environment variable controlling the host port mapping (e.g., `ports: ["${APP_PORT:-3000}:3000"]`)
- `restart: unless-stopped` on all services
- Health checks on the web service

### dk-template Integration

The [`dk-template`](https://github.com/data-kinetic/dk-template) scaffolding generates a `docker-compose.preview.yaml` in each product repo with:
- Service definitions matching the K8s deployment
- Environment variable placeholders for Doppler injection
- Health check endpoints
- Standard port mappings

## Relationship to K8s Preview Environments

This VM-based preview system is for **non-K8s apps** and **quick branch previews** that don't need the full ArgoCD GitOps loop. The separate [per-PR ephemeral K8s environments](gitops-and-cd.md#preview-environments) (using ArgoCD ApplicationSets with pull-request generators) are a future initiative for apps already deployed to K8s.

| Approach | Use Case | Status |
|----------|----------|--------|
| VM previews (this doc) | Docker Compose apps, quick branch previews | Active (being standardized) |
| K8s per-PR previews | Full ArgoCD-managed previews for K8s apps | Planned (see GitOps & CD) |

## Related Documentation

- [Platform API](platform-api.md) — API endpoints for preview orchestration
- [dk-cli](dk-cli.md) — CLI commands for preview management
- [Template Repository](template-repo.md) — generates preview docker-compose config
- [GitOps & CD](gitops-and-cd.md#preview-environments) — K8s-based preview environments (future)
- [Infrastructure](infrastructure.md) — edge routing and Keepalived VIPs
