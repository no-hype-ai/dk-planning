# Proxmox Host & GPU Monitoring

## Context
The Proxmox hosts (penguin, krang) are the foundation of all platform infrastructure, yet there are zero metrics from the hypervisor layer. Grafana Alloy collects everything inside K3s (kubelet, cAdvisor, KSM, pod logs) but nothing from the bare-metal hosts themselves. If penguin's ZFS pool degrades, krang's A100 GPUs overheat, or a host's memory fills silently, there is no alert — the first signal is K3s pods crashing. This is also a SOC 2 CC7.2 compliance gap (monitoring of infrastructure components).

## Scope
- Host-level metrics for penguin and krang (CPU, RAM, disk, ZFS, network)
- Per-VM resource metrics via Proxmox VE API
- GPU metrics for krang's 8x A100 fleet (utilization, memory, temperature, ECC)
- Grafana dashboards and alert rules for all three metric tiers
- Feed data into [Plan 06 VM Lifecycle](06-vm-lifecycle.md) (right-sizing) and [dk-alchemy/13 Cost & Utilization](../dk-alchemy/13-cost-and-utilization.md) (cost dashboards)

## Dependencies
- **Plan 01** (Critical Fixes) — COMPLETE. Alloy running, Grafana operational.
- Requires SSH access to penguin (192.168.10.8) and krang (192.168.10.100) to install exporters.
- Alloy already supports static scrape targets (used for LiteLLM at 10.0.0.2:443 and vLLM GPU metrics).

## Existing Work
- dk-alchemy: Alloy DaemonSet with static target support (`values.yaml`)
- dk-alchemy: Grafana dashboard auto-sync (GitOps via workflow)
- dk-alchemy: `grafana/dashboards/infrastructure/` — 15 existing dashboards
- dk-alchemy: `grafana/alerts/` — 6 existing alert rule files
- dk-planning docs: [infrastructure.md](../../docs/infrastructure.md) (host inventory), [observability.md](../../docs/observability.md) (Alloy architecture)
- dk-clusters: Cluster inventory in [README.md](README.md) (IPs, resources, storage pools)

## Implementation Steps

### Phase 1: Host Metrics (node_exporter)
1. Install `node_exporter` on penguin (192.168.10.8):
   - Systemd service, listen on :9100
   - Enable collectors: cpu, diskstats, filesystem, meminfo, netdev, zfs, loadavg, uname
   - ZFS collector critical for nvfast/local-lvm/bulk-images health
2. Install `node_exporter` on krang (192.168.10.100):
   - Same configuration as penguin
   - Enable additional collectors: hwmon (temperature), nvme (NVMe health)
3. Add static scrape targets to Alloy configuration:
   ```yaml
   # k8s/infrastructure/alloy/base/values.yaml
   - job_name: proxmox-hosts
     targets:
       - 192.168.10.8:9100    # penguin
       - 192.168.10.100:9100  # krang
     labels:
       cluster: proxmox
   ```
4. Create Grafana dashboard: `grafana/dashboards/infrastructure/proxmox-hosts.json`
   - Panels: CPU utilization (per-host), memory utilization, disk I/O, network throughput, ZFS pool health (capacity, fragmentation, scrub status), filesystem usage per mount, system load, uptime
   - Variables: host selector dropdown
5. Create alert rules in `grafana/alerts/proxmox-hosts.yaml`:
   - `ProxmoxDiskCritical`: filesystem usage > 85% (any mount) — warning
   - `ProxmoxDiskFull`: filesystem usage > 95% — critical
   - `ProxmoxMemoryHigh`: memory usage > 90% sustained 10m — warning
   - `ProxmoxCPUSaturated`: CPU usage > 95% sustained 15m — warning
   - `ProxmoxZFSDegraded`: ZFS pool state != ONLINE — critical
   - `ProxmoxHostDown`: node_exporter unreachable for 2m — critical
6. Add installation scripts to dk-clusters:
   - `scripts/install-node-exporter.sh` — idempotent installer for Proxmox hosts

### Phase 2: VM Metrics (pve-exporter)
7. Deploy [prometheus-pve-exporter](https://github.com/prometheus-pve/prometheus-pve-exporter) on penguin:
   - Single instance scrapes both penguin and krang via Proxmox API
   - Listen on :9221
   - Requires Proxmox API token (read-only, add to Doppler `dk-infrastructure/prd`)
8. Add static scrape target to Alloy:
   ```yaml
   - job_name: proxmox-vms
     targets:
       - 192.168.10.8:9221  # pve-exporter on penguin
     labels:
       cluster: proxmox
   ```
9. Create Grafana dashboard: `grafana/dashboards/infrastructure/proxmox-vms.json`
   - Panels: per-VM CPU usage, memory allocation vs usage, disk I/O per VM, network throughput per VM, VM status (running/stopped), resource allocation overview (total vs allocated vs used)
   - Variables: host selector, VM selector
   - Table: all VMs with current resource consumption (sortable)
10. Create alert rules in `grafana/alerts/proxmox-vms.yaml`:
    - `ProxmoxVMDown`: expected VM not running — critical (list: k3s-master-1, k3s-slave-1, litellm, preview-stack, phantom, venom)
    - `ProxmoxVMMemoryHigh`: VM memory > 90% of allocated — warning
    - `ProxmoxResourceOvercommit`: total allocated CPU/RAM > host capacity — warning

### Phase 3: GPU Metrics (DCGM Exporter)
11. Deploy [NVIDIA DCGM Exporter](https://github.com/NVIDIA/dcgm-exporter) inside vllm-minimax VM (192.168.10.101):
    - All 8× A100 GPUs are PCI-passthrough to vllm-minimax VM (220) — not visible to krang host OS
    - DCGM exporter runs as a Docker container inside the VM alongside vLLM
    - Listen on :9400
    - Metrics: DCGM_FI_DEV_GPU_UTIL, DCGM_FI_DEV_MEM_COPY_UTIL, DCGM_FI_DEV_GPU_TEMP, DCGM_FI_DEV_ECC_DBE_VOL_TOTAL, DCGM_FI_DEV_POWER_USAGE
12. Add static scrape target to Alloy:
    ```yaml
    - job_name: nvidia-gpu
      targets:
        - 192.168.10.101:9400  # vllm-minimax VM (GPUs are PCI-passthrough)
      labels:
        cluster: proxmox
        host: vllm-minimax
    ```
13. Create Grafana dashboard: `grafana/dashboards/infrastructure/gpu-utilization.json`
    - Panels: per-GPU utilization (8 GPUs), GPU memory usage, temperature heatmap, power consumption, ECC error count, utilization over time (7-day trend)
    - Variables: GPU index selector
    - Summary row: fleet average utilization, total power draw, peak temperature
14. Create alert rules in `grafana/alerts/gpu.yaml`:
    - `GPUTemperatureHigh`: temperature > 80C — warning
    - `GPUTemperatureCritical`: temperature > 90C — critical (thermal throttling)
    - `GPUECCErrors`: double-bit ECC errors detected — critical (hardware degradation)
    - `GPUIdleProlonged`: all 8 GPUs < 5% utilization for 24h — info (cost signal for dk-alchemy/13)
    - `GPUMemoryExhausted`: GPU memory > 95% — warning

## dk-clusters Changes
- CREATE: `scripts/install-node-exporter.sh` — idempotent installer
- CREATE: `scripts/install-pve-exporter.sh` — pve-exporter setup with Doppler token
- CREATE: `scripts/install-dcgm-exporter.sh` — DCGM exporter Docker deployment for vllm-minimax VM
- CREATE: `configs/node-exporter/` — systemd unit files for both hosts
- CREATE: `configs/pve-exporter/` — configuration for Proxmox API access
- CREATE: `configs/dcgm-exporter/` — DCGM configuration

## dk-alchemy Changes
- MODIFY: `k8s/infrastructure/alloy/base/values.yaml` — add 3 static scrape targets
- CREATE: `grafana/dashboards/infrastructure/proxmox-hosts.json`
- CREATE: `grafana/dashboards/infrastructure/proxmox-vms.json`
- CREATE: `grafana/dashboards/infrastructure/gpu-utilization.json`
- CREATE: `grafana/alerts/proxmox-hosts.yaml`
- CREATE: `grafana/alerts/proxmox-vms.yaml`
- CREATE: `grafana/alerts/gpu.yaml`

## Verification
- `curl http://192.168.10.8:9100/metrics` returns node_exporter metrics from penguin
- `curl http://192.168.10.100:9100/metrics` returns node_exporter metrics from krang
- Grafana proxmox-hosts dashboard shows CPU, memory, disk for both hosts
- ZFS pool health visible (nvfast, local-lvm, bulk-images status)
- Per-VM resource consumption visible in proxmox-vms dashboard
- GPU utilization dashboard shows 8 individual A100s with temperature and memory
- Alert fires when test threshold is temporarily lowered
- `ProxmoxHostDown` alert fires when node_exporter is stopped on a test host

## Options/Recommendations
**DCGM Exporter Placement:**
- **Option B (chosen): Inside vllm-minimax VM (220)** — All 8× A100 GPUs are fully PCI-passthrough to the VM; `nvidia-smi` on krang host returns nothing. DCGM exporter runs as a Docker container inside the VM alongside vLLM, exposing metrics on :9400.
