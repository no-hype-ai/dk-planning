# Migration: dk-data-fe → carbon-5

## Summary

| | |
|---|---|
| **Source** | [data-kinetic/dk-data-fe](https://github.com/data-kinetic/dk-data-fe) |
| **Target** | [data-kinetic/carbon-5](https://github.com/data-kinetic/carbon-5) |
| **Complexity** | High |
| **Suggested order** | 3 of 4 |

## What dk-data-fe Is

A **molecule intelligence and data pipeline platform** originally built for TAVR hospital targeting (Edwards Lifesciences), expanded into a broad data ingestion and transformation system. It provides:

- Automated ingestion from **25+ external data sources** (CMS, DrugBank, PubMed, ClinicalTrials.gov, USPTO, ChEMBL, OpenAlex, SEC EDGAR, etc.)
- **Medallion architecture** (raw → bronze → silver → gold) via SQLMesh (63+ transformation models)
- **PostgREST** auto-generated REST API from SQL views
- **FastAPI** job orchestration service (job-trigger)
- **30+ MCP tool adapters** for Claude/AI agent integration
- **Metabase** BI dashboards
- **Hospital scoring**, **molecule lifecycle tracking**, **entity resolution**

## What Moves

### Services

| Service | Tech | Port | Destination in carbon-5 |
|---------|------|------|------------------------|
| **job-trigger** | FastAPI (Python 3.11) | 8000 | New `services/data-pipeline/` or `apps/data-api/` |
| **PostgREST** | PostgREST v12.2.3 | 3030 | Docker Compose sidecar service |
| **Metabase** | Metabase v0.50.26 | 3000 | Docker Compose sidecar service (or drop if carbon-5 has its own BI) |

### Python Codebase

This is the most significant integration challenge — dk-data-fe is a **Python monolith** merging into a **TypeScript monorepo**.

| Component | Size | Action |
|-----------|------|--------|
| `src/dk_data/ingestion/fetchers/` | 23 fetcher modules | Keep as Python service — do NOT rewrite in TypeScript |
| `src/dk_data/ingestion/sources/` | Source-specific loaders | Keep as Python service |
| `src/dk_data/services/data_platform/` | Bronze/silver/gold transforms | Keep as Python service |
| `src/dk_data/services/external_apis/` | 25+ API clients | Keep as Python service |
| `src/dk_data/services/ground_truth/` | KOL, lifecycle, scoring, coverage, graphs | Keep as Python service |
| `src/dk_data/services/mcp/` | 30+ MCP tool adapters | Keep as Python service |
| `src/dk_data/services/auth/` | JWT service | Migrate to carbon-5's Clerk auth |
| `src/dk_data/api/routes/` | FastAPI routers | Keep as Python service API |
| `src/dk_data/sqlmesh/` | 63+ SQLMesh models | Keep as Python — SQLMesh is Python-native |
| `src/dk_data/observability/` | OTel + structured logging + Prometheus | Align with carbon-5's observability setup |
| `src/dk_data/claude_sdk/` | Anthropic API integration | Keep, or route through carbon-5's LiteLLM |

**Recommendation:** Keep dk-data-fe as a **self-contained Python service** within carbon-5's Docker Compose stack. Do not attempt a TypeScript rewrite — the Python codebase is mature, has 40+ tests, and depends on Python-specific tools (SQLMesh, FastAPI, sentence-transformers).

### SQLMesh Models (63+)

| Layer | Count | Purpose |
|-------|-------|---------|
| `models/molecules/bronze/` | 30 | Lightly cleaned raw data |
| `models/molecules/silver/` | 19 | Standardized, joined |
| `models/molecules/gold/` | 14 | Business-ready aggregates |
| `models/mart/` | Several | TAVR-specific data marts |
| `models/scoring/` | Several | Hospital targeting scores |

These form a DAG managed by SQLMesh — they must move as a unit.

### CronJobs (20+)

Currently deployed as K8s CronJobs:

| CronJob | Schedule | Data Source |
|---------|----------|-------------|
| CMS ingestion | Varies | Medicare Inpatient, Hospital Info, Cost Reports |
| Molecule sources | Varies | DrugBank, ChEMBL, PubChem, UniProt, PDB |
| Patent sources | Varies | USPTO, EPO, EUIPO |
| Literature | Varies | PubMed, OpenAlex, Cochrane, Journal RSS |
| Clinical | Varies | ClinicalTrials.gov |
| Regulatory | Varies | OpenFDA (FAERS, labels, Orange Book), EMA, HTA |
| Financial | Varies | SEC EDGAR |
| Backups | Daily/Weekly | pg_dump to MinIO |

**Migration:** Convert from K8s CronJobs to either:
- Docker Compose + `cron` sidecar container
- Prefect 3 scheduled flows (carbon-5 already runs Prefect for dataflows)
- **Recommended:** Prefect 3 — natural fit since carbon-5 already uses it for dataflow orchestration

## Data Stores

### PostgreSQL 16 + pgvector

**16+ schemas, 40+ migrations, complex role-based access:**

| Schema | Purpose |
|--------|---------|
| `raw` | Raw ingested data |
| `bronze` / `mol_raw` | Lightly cleaned |
| `staging` / `silver` / `mol_silver` | Standardized |
| `mart` / `gold` / `mol_gold` | Business-ready |
| `scoring` | Hospital targeting |
| `meta` | Data catalog, jobs, health |
| `api` / `mol_api` | PostgREST views |
| `xenon` | Analyst workspace |

**Roles:** `web_anon`, `analyst`, `api_user`, `authenticator` — PostgREST uses role-based row-level security.

**Migration approach:**
- carbon-5 uses **Drizzle ORM** with PostgreSQL 17
- dk-data-fe uses **raw SQL + SQLMesh** — no traditional ORM
- **Recommended:** Keep as a separate database. dk-data-fe's schema is SQL-native (not ORM-managed), and PostgREST depends on specific roles and views.

### MinIO / S3

- Backup target for pg_dump CronJobs
- carbon-5 uses **SeaweedFS** — need to remap backup targets

### External Data Sources (25+)

Each source has a fetcher, loader, and rate-limiting config:

| Category | Sources |
|----------|---------|
| **Government/CMS** | Medicare Inpatient, Hospital Info, Cost Reports, HRSA |
| **Drug/Chemical** | DrugBank, ChEMBL, PubChem, UniProt, PDB, BindingDB, SIDER |
| **Clinical** | ClinicalTrials.gov, ACC |
| **Literature** | PubMed, OpenAlex, Cochrane, Journal RSS |
| **Patents** | USPTO (patents + trademarks), EPO, EUIPO |
| **Regulatory** | OpenFDA (FAERS, labels, Orange Book), EMA, HTA, WHO ICD |
| **Financial** | SEC EDGAR |
| **Other** | ORCID (disabled) |

API keys and credentials for these sources are in Doppler (`dk-data-fe` project).

## Deployment Shift

### Current (K8s/ArgoCD)

- PostgREST: 2 replicas (staging), 3 replicas (prod)
- job-trigger: 1 replica
- 20+ CronJobs for data ingestion
- Ingress: Traefik, `data.behaviorlabs.ai`
- NetworkPolicy: default deny, explicit allow for BehaviorLabs and AgentMesh namespaces
- ServiceMonitor + AlertRules (Prometheus Operator)
- Backup CronJobs: daily/weekly pg_dump to MinIO
- Secrets: Doppler Operator (DopplerSecret CRDs)
- Shared CNPG PostgreSQL cluster in `infra` namespace

### Target (K8s / ArgoCD — following behavior-labs-ai patterns)

- PostgREST as a K8s Deployment in carbon-5's Kustomize manifests (`k8s/apps/postgrest/`)
- job-trigger (FastAPI) as a K8s Deployment (`k8s/apps/data-pipeline/`)
- CronJobs remain as K8s CronJobs (can be carried over directly from dk-data-fe's manifests) or converted to Prefect 3 scheduled flows
- Ingress: Traefik IngressRoute + cert-manager TLS
- Observability: OTLP via Alloy Kustomize component
- Secrets: Doppler Operator (DopplerSecret CRDs) — merged into carbon-5 Doppler project
- PostgreSQL: Separate database on shared CNPG cluster in `infra` namespace
- Backups: pg_dump CronJobs to MinIO (carry over from dk-data-fe)

### DNS

| Domain | Action |
|--------|--------|
| `data.behaviorlabs.ai` | Update edge IngressRoute to point at carbon-5 namespace, or retire |
| `data.staging.behaviorlabs.ai` | Retire |

## Consumer Dependencies

**Other services that call dk-data-fe's PostgREST API:**

| Consumer | Namespace | Access Method |
|----------|-----------|---------------|
| behavior-labs-ai | `behaviorlabs-prod/staging` | PostgREST REST API |
| agent-mesh | `agentmesh-prod/staging` | PostgREST REST API |

**After migration:** These consumers must update their endpoints. If behavior-labs-ai stays on K8s but dk-data moves to Docker Compose, the PostgREST API must be reachable from the K3s cluster (via edge routing or direct network access).

## CI/CD Workflows to Migrate

| Workflow | Action |
|----------|--------|
| `ci.yaml` | Merge: lint, test, SQLMesh validate, k8s manifest validate → carbon-5 CI |
| `build-push.yaml` | Replace with carbon-5's deploy workflow |
| `promote-to-prod.yaml` | Replace with carbon-5's promotion workflow |
| `post-deploy-verify.yaml` | Add post-deploy health checks to carbon-5 |

## Gaps & Risks

| Gap | Risk | Mitigation |
|-----|------|------------|
| **Python in TypeScript monorepo** | Build tooling conflict (pnpm/Turborepo doesn't manage Python) | Keep Python service as a standalone Docker image, add to compose |
| **PostgREST consumers on K8s** | behavior-labs-ai and agent-mesh (until migrated) need network access | Expose PostgREST via Nginx Proxy Manager with auth, or keep PostgREST on K8s temporarily |
| **20+ CronJobs** | K8s CronJobs → need equivalent scheduled execution | Use Prefect 3 (already in carbon-5) |
| **SQLMesh** | Complex transformation DAG, Python-native | Keep as-is, run in Python container |
| **Data volume** | DrugBank seed data in Git LFS, large datasets | Ensure vm101 has sufficient storage |
| **Role-based access** | PostgREST depends on PostgreSQL roles (web_anon, analyst, etc.) | Must recreate roles in target PostgreSQL |
| **NetworkPolicy** | Current strict egress/ingress won't exist on Docker Compose | Accept reduced isolation, or use Docker network segmentation |
| **Metabase** | Embedded BI — may overlap with carbon-5's own analytics | Decide: keep Metabase sidecar, or migrate dashboards to Grafana |
| **MCP adapters** | 30+ adapters for Claude integration | If agent-mesh migrates first, these can route through carbon-5's agent layer |

## Migration Steps

```
Phase 1: Preparation
  □ Document all PostgREST API endpoints consumed by behavior-labs-ai
  □ Document all CronJob schedules and data source credentials
  □ Audit Doppler secrets in dk-data-fe project
  □ Decide: Metabase keep or drop
  □ Decide: PostgREST reachability from K3s cluster post-migration
  □ Size vm101 storage for data pipeline volumes

Phase 2: Database Setup
  □ Create dk-data database on carbon-5's PostgreSQL instance
  □ Run dk-data-fe SQL migrations (init_database.sql + 40+ migrations)
  □ Create PostgREST roles (web_anon, analyst, api_user, authenticator)
  □ Create API views (api_views.sql)
  □ Verify SQLMesh can connect and run models

Phase 3: Service Migration
  □ Build dk-data-fe Docker image (job-trigger) — already has Dockerfile
  □ Add PostgREST service to carbon-5 docker-compose
  □ Add job-trigger service to carbon-5 docker-compose
  □ Add Metabase service (if keeping)
  □ Configure Doppler secrets under carbon-5 project
  □ Configure Nginx Proxy Manager routes

Phase 4: CronJob Migration
  □ Convert K8s CronJobs to Prefect 3 scheduled flows
  □ Test each data source fetcher runs successfully
  □ Verify medallion transforms complete (bronze → silver → gold)
  □ Set up backup schedule (pg_dump to SeaweedFS)

Phase 5: Consumer Cutover
  □ Update behavior-labs-ai PostgREST endpoint (if changing)
  □ Verify behavior-labs-ai can still access data API
  □ Update agent-mesh references (or wait if agent-mesh migrates to carbon-5 anyway)

Phase 6: Validation
  □ Run dk-data-fe test suite against new deployment
  □ Verify all 25+ data sources can fetch successfully
  □ Verify SQLMesh DAG completes end-to-end
  □ Verify PostgREST API returns expected data
  □ Verify MCP adapters work (if agent-mesh already migrated)
  □ Verify backups run and can be restored

Phase 7: Cutover
  □ Update DNS (data.behaviorlabs.ai → carbon-5)
  □ Remove dk-data-fe bootstrap from dk-alchemy
  □ Remove K8s CronJobs
  □ Remove dk-data namespaces
  □ Archive dk-data-fe repo
  □ Update dk-alchemy Grafana dashboards (dk-data-api, dk-data-pipeline, dk-data-platform-status, dk-data-postgrest-slo)
  □ Update dk-alchemy alert rules (dk-data.yaml)
  □ Update probe-service targets
```

## Related

- [Migration Overview](README.md)
- [agent-mesh → carbon-5](agent-mesh-to-carbon-5.md) — the other carbon-5 migration (depends on this completing first if MCP adapters need agent layer)
