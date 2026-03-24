# Plan 03: Infrastructure Services

## Goal

Define and execute the strategy for DK-OS data stores and service dependencies during and after the K8s migration. Each service currently runs on Megatron VM and needs a target state in the platform.

## Current Services on Megatron

| Service | Version | Purpose | Data Volume | DK-OS Dependency |
|---------|---------|---------|-------------|-----------------|
| PostgreSQL | 16 (pgvector) | Primary database | 82 models, unknown size | Critical — all apps |
| PgBouncer | — | Connection pooling (20-200 connections) | Stateless | Critical — api |
| Redis | 7 | BullMQ queues, caching, Socket.io presence | Ephemeral + queues | Critical — api, app |
| SeaweedFS | 3.93 | File storage (S3-compatible) | User uploads, exports | High — api, app |
| LiteLLM | — | LLM gateway (OpenAI-compatible) | Stateless | Medium — AI features |
| Grafana + Loki + Tempo | — | Local observability stack | Metrics, logs, traces | Low — replaced by dk-alchemy LGTM |

---

## Decision 1: PostgreSQL

### Options

| Option | Migration Effort | Risk | Ongoing Cost |
|--------|-----------------|------|-------------|
| **A: CloudNativePG shared** | High (data migration, pgvector setup) | Medium (contention with behavior-labs-ai) | Low |
| **B: Dedicated CloudNativePG** | High (data migration, new operator instance) | Low (isolated) | Medium (cluster resources) |
| **C: Keep Megatron (transitional)** | None | Low (proven) | High (VM cost, no HA) |

### Recommendation: C → B (Phased)

1. **Phase 1 (during K8s migration):** Keep PostgreSQL on Megatron. K8s pods connect via cross-network (192.168.10.88:5432).
2. **Phase 2 (post-migration stable):** Deploy dedicated CloudNativePG instance with pgvector extension in `dk-os-prod` namespace.
3. **Phase 3 (data migration):** Use `pg_dump`/`pg_restore` or logical replication to migrate data. Schedule during low-traffic window.

### pgvector Consideration

DK-OS uses pgvector for:
- AI embeddings (feedback similarity, feature deduplication)
- Requires PostgreSQL extension: `CREATE EXTENSION vector`

CloudNativePG supports pgvector via custom image. dk-alchemy's CloudNativePG should be verified for pgvector support, or DK-OS needs its own PostgreSQL cluster.

### PgBouncer Strategy

**Recommendation:** Deploy PgBouncer as K8s sidecar in the api Deployment.

```yaml
# In api deployment, add sidecar container
containers:
  - name: pgbouncer
    image: bitnami/pgbouncer:latest
    ports:
      - containerPort: 6432
    env:
      - name: PGBOUNCER_DATABASE
        value: "dk-os"
      - name: POSTGRESQL_HOST
        valueFrom:
          secretKeyRef:
            name: dk-os-secrets
            key: PGBOUNCER_POSTGRESQL_HOST
```

---

## Decision 2: Redis

### Options

| Option | Pros | Cons |
|--------|------|------|
| **A: dk-alchemy shared Redis** | No setup, shared management | Contention, namespace isolation only |
| **B: Dedicated Redis** | Isolation, predictable performance | More resources, separate management |

### Recommendation: A (Shared)

DK-OS Redis usage (BullMQ, caching, Socket.io) is standard. Start with shared dk-alchemy Redis. Monitor for:
- Queue depth spikes affecting other services
- Memory pressure
- Connection limits

If contention observed, deploy dedicated Redis in `dk-os-prod` namespace.

**Socket.io adapter:** Verify `@socket.io/redis-adapter` works with shared Redis (needs dedicated key prefix to avoid collisions).

---

## Decision 3: Object Storage

### Options

| Option | Migration Effort | Compatibility |
|--------|-----------------|--------------|
| **A: ~~Switch to MinIO~~** | ~~Medium~~ | ~~Standard platform pattern~~ — **Rejected: MinIO entered maintenance mode Dec 2025** |
| **B: Switch to dk-alchemy SeaweedFS** | Low (endpoint + credential change) | Same storage engine, S3-compatible |
| **C: Keep Megatron SeaweedFS** | None | VM dependency remains |

### Recommendation: C → B (Phased)

> **Updated 2026-03-24:** MinIO entered maintenance mode (Dec 2025) — no new features, no security patches, Docker images discontinued. dk-alchemy is migrating from MinIO to SeaweedFS ([dk-planning#9](https://github.com/data-kinetic/dk-planning/issues/9), [dk-alchemy#365](https://github.com/data-kinetic/dk-alchemy/issues/365)). DK-OS should target dk-alchemy SeaweedFS, not MinIO.

1. **Phase 1:** Keep Megatron SeaweedFS. K8s pods connect to Megatron endpoint.
2. **Phase 2:** Migrate to dk-alchemy SeaweedFS. Same storage engine — requires only endpoint + credential changes in Doppler.
3. **Migration:** Use `rclone sync` to migrate objects from Megatron to dk-alchemy SeaweedFS.

**Validation:** SeaweedFS-to-SeaweedFS migration is native — no API compatibility testing needed. Only verify endpoint connectivity and Doppler credential rotation.

---

## Decision 4: LiteLLM

### Action: Switch to dk-litellm HA VM

Replace local LiteLLM with shared `llm.behaviorlabs.ai`:
1. Update Doppler config: `LITELLM_API_BASE=https://llm.behaviorlabs.ai`
2. Request DK-OS virtual key from dk-litellm
3. Set per-app budget and rate limits
4. Verify all AI features work against shared gateway

---

## Decision 5: Observability

### Action: Point to dk-alchemy LGTM Stack

Replace local Grafana+Loki+Tempo with dk-alchemy stack:
1. Configure OTLP exporter in DK-OS services to dk-alchemy collector
2. Remove local observability compose services
3. Create DK-OS dashboards in dk-alchemy Grafana (via `monitoring/dashboards/`)
4. Create DK-OS alert rules in dk-alchemy (via `monitoring/alerts/`)

This is handled automatically by the dk-template scaffold (otlp-collector Kustomize component).

---

## Migration Timeline

```
Phase 1: K8s Migration (keep VM services)
  ├── PostgreSQL → Megatron (cross-network)
  ├── Redis → dk-alchemy shared
  ├── SeaweedFS → Megatron (cross-network)
  ├── LiteLLM → dk-litellm HA VM
  └── Observability → dk-alchemy LGTM

Phase 2: Service Migration (post-K8s stable, +4 weeks)
  ├── PostgreSQL → Dedicated CloudNativePG (with pgvector)
  └── SeaweedFS → dk-alchemy SeaweedFS (endpoint change only)

Phase 3: VM Decommission (+8 weeks)
  └── Megatron VM decommissioned (or repurposed)
```

---

## Verification

- [ ] All K8s services connect to data stores without errors
- [ ] BullMQ queues processing on shared Redis
- [ ] Socket.io presence working via shared Redis
- [ ] File uploads/downloads via SeaweedFS (Phase 1: Megatron, Phase 2: dk-alchemy)
- [ ] LLM features working via dk-litellm
- [ ] Grafana dashboards showing DK-OS metrics via dk-alchemy LGTM
- [ ] Connection pooling verified (PgBouncer sidecar active)
- [ ] No cross-network latency issues (< 5ms for DB queries)
