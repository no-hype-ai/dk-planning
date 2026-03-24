# Preview Environments

## Overview

Preview environments allow product repos to deploy branch-based previews accessible at `*.preview.behaviorlabs.ai` or `*.preview.datakinetic.com`. These run on a dedicated VM as [Docker](https://docs.docker.com/) Compose projects, routed through the edge load balancers.

## Current State

Preview deployments currently run on VM101 (preview-stack) via Nginx Proxy Manager (NPM) with ad-hoc docker-compose projects. As of 2026-03-23, VM101 hosts 15 Docker Compose projects with 63 containers. Ubuntu 22.04.5 LTS running Docker 29.2.1.

**Operational improvements completed (Phase 0):**
- UFW firewall is active (deny-by-default incoming)
- Automated cleanup cron jobs installed (hourly TTL, weekly Docker prune, daily archive cleanup)
- Health endpoint available at port 9100
- Disk usage reduced to 59% (282 GB / 485 GB)

### Infrastructure

| Property | Value |
|----------|-------|
| **VM** | vm101-preview-stack (penguin, VMID 101) |
| **Cluster IP** | 10.0.0.51 (vmbr1, isolated) |
| **DMZ IP** | 172.16.100.51 (vmbr2, for edge routing) |
| **Resources** | 16 vCPU, 125 GiB RAM, 485 GB disk |
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

## Target State

Standardize preview deployments via the [Platform API](platform-api.md) and [dk-cli](dk-cli.md):

### dk-cli Commands

| Command | Purpose |
|---------|---------|
| `dk preview up` | Deploy preview from current repo/branch. Triggers Platform API which orchestrates docker-compose on VM101. |
| `dk preview down <name>` | Tear down a preview and clean up resources |
| `dk preview list` | Show all active preview deployments with URLs and status |
| `dk preview logs <name>` | Stream logs from a preview's services |

### How It Works

1. Developer runs `dk preview up` from their product repo
2. dk-cli sends request to Platform API (`POST /dk/v1/previews`) with repo, branch, and services
3. Platform API:
   - Clones the repo/branch on VM101 via SSH
   - Generates docker-compose config from dk-template pattern
   - Starts services with [Doppler](https://docs.doppler.com/) secrets injection
   - Configures NPM proxy host for `<branch>.preview.behaviorlabs.ai`
   - Returns the preview URL
4. Preview is accessible at `https://<branch>.preview.behaviorlabs.ai`
5. Cleanup: `dk preview down` or automatic TTL expiry

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
