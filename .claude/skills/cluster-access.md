---
name: cluster-access
description: Access the dk-alchemy K3s cluster via SSH double-hop through penguin, run kubectl commands, manage ArgoCD apps, and access VM101 preview stack
---

# K3s Cluster Access

## Network Topology

```
Local machine
  -> penguin (192.168.10.8, hostname: penguin, user: root, SSH key auth)
    -> k3s-master-1 (10.0.0.11, user: ubuntu) — kubectl access
    -> vm101-preview-stack (10.0.0.51, user: ubuntu) — preview containers
```

**IMPORTANT:** Use hostname `penguin` (not IP 192.168.10.8) for SSH — key auth is configured for the hostname only.

## kubectl via Double-Hop SSH

All kubectl commands require `sudo` on k3s-master-1.

```bash
# Restart a deployment
ssh root@penguin "ssh ubuntu@10.0.0.11 'sudo kubectl rollout restart deployment/DEPLOY_NAME -n NAMESPACE'"

# Wait for rollout
ssh root@penguin "ssh ubuntu@10.0.0.11 'sudo kubectl rollout status deployment/DEPLOY_NAME -n NAMESPACE --timeout=120s'"

# Check pods
ssh root@penguin "ssh ubuntu@10.0.0.11 'sudo kubectl get pods -n NAMESPACE'"

# View logs
ssh root@penguin "ssh ubuntu@10.0.0.11 'sudo kubectl logs deployment/DEPLOY_NAME -n NAMESPACE --tail=50'"

# Describe pod
ssh root@penguin "ssh ubuntu@10.0.0.11 'sudo kubectl describe pod POD_NAME -n NAMESPACE'"

# Check env vars on a deployment
ssh root@penguin "ssh ubuntu@10.0.0.11 'sudo kubectl exec deployment/DEPLOY_NAME -n NAMESPACE -- env | grep PATTERN'"
```

## Key Namespaces

| Namespace | Contents |
|-----------|----------|
| `infra` | platform-api, ddns-service, probe-service |
| `argocd` | ArgoCD server, controller, repo-server |
| `observability` | LGTM stack (Loki, Grafana, Tempo, Mimir), Alloy |
| `default` | Application workloads |

## ArgoCD Operations

```bash
# Sync an application
ssh root@penguin "ssh ubuntu@10.0.0.11 'sudo kubectl patch application -n argocd APP_NAME --type merge -p \"{\\\"operation\\\":{\\\"sync\\\":{\\\"revision\\\":\\\"HEAD\\\",\\\"prune\\\":true}}}\"'"

# List all ArgoCD applications
ssh root@penguin "ssh ubuntu@10.0.0.11 'sudo kubectl get applications -n argocd'"

# Check sync status
ssh root@penguin "ssh ubuntu@10.0.0.11 'sudo kubectl get application APP_NAME -n argocd -o jsonpath=\"{.status.sync.status}\"'"
```

**ArgoCD scripts** at `/Users/nick/Code/dk-alchemy/scripts/argocd/`:
- `sync-app.sh <app>` — Force sync an app
- `list-apps.sh` — List all apps with status
- `restart-all.sh` — Restart all ArgoCD components
- `sync-degraded.sh` — Sync all degraded apps
- All scripts use `KUBECONFIG=~/.kube/k3s-master-1.yaml`

## VM101 Preview Stack Access

```bash
# List containers for a preview
ssh root@penguin "ssh ubuntu@10.0.0.51 'cd /opt/dk-previews/active/PREVIEW_NAME && docker compose -f docker-compose.preview.yaml ps'"

# View service logs
ssh root@penguin "ssh ubuntu@10.0.0.51 'cd /opt/dk-previews/active/PREVIEW_NAME && docker compose -f docker-compose.preview.yaml logs SERVICE --tail=50'"

# Restart a service
ssh root@penguin "ssh ubuntu@10.0.0.51 'cd /opt/dk-previews/active/PREVIEW_NAME && docker compose -f docker-compose.preview.yaml restart SERVICE'"

# Check preview metadata
ssh root@penguin "ssh ubuntu@10.0.0.51 'cat /opt/dk-previews/active/PREVIEW_NAME/.preview-meta.json'"

# List all active previews
ssh root@penguin "ssh ubuntu@10.0.0.51 'ls /opt/dk-previews/active/'"
```

## Local Kubeconfig Setup (for extended kubectl sessions)

```bash
# Fetch kubeconfig (use PROXMOX_HOST=penguin to fix auth)
PROXMOX_HOST=penguin bash /Users/nick/Code/dk-alchemy/scripts/penguin/kubeconfig-k3s.sh fetch

# Start tunnel (in separate terminal)
PROXMOX_HOST=penguin bash /Users/nick/Code/dk-alchemy/scripts/penguin/kubeconfig-k3s.sh tunnel

# Then in another terminal:
export KUBECONFIG=~/.kube/k3s-master-1.yaml
kubectl get nodes
```

## Common Operations

### Restart Platform API (after code changes)
```bash
ssh root@penguin "ssh ubuntu@10.0.0.11 'sudo kubectl rollout restart deployment/platform-api -n infra'"
ssh root@penguin "ssh ubuntu@10.0.0.11 'sudo kubectl rollout status deployment/platform-api -n infra --timeout=120s'"
```

### Check Platform API logs
```bash
ssh root@penguin "ssh ubuntu@10.0.0.11 'sudo kubectl logs deployment/platform-api -n infra --tail=100'"
```

### Deploy DK-OS to preview
```bash
cd ~/Code/DK-OS
dk preview up --name os --branch main
```
