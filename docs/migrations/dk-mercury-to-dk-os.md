# Migration: dk-mercury → DK-OS

## Summary

| | |
|---|---|
| **Source** | [data-kinetic/dk-mercury](https://github.com/data-kinetic/dk-mercury) |
| **Target** | [data-kinetic-projects/DK-OS](https://github.com/data-kinetic-projects/DK-OS) |
| **Complexity** | Medium-High |
| **Suggested order** | 2 of 4 |

## What dk-mercury Is

An **Organizational Intelligence Platform** that captures audio from Mac devices, processes speech-to-text with speaker diarization, builds a knowledge graph from transcripts and connected communication channels, and surfaces AI-generated daily summaries. It provides:

- Mac audio capture via Screenpipe + menu bar tray app (Swift)
- GPU-accelerated NVIDIA NeMo STT (Parakeet TDT 1.1B + Sortformer diarization)
- Knowledge graph from transcripts, calendar, email, Slack, HubSpot
- AI-generated daily summaries (Claude)
- Force-directed graph visualization
- Multi-channel data connectors

## What Moves

### Applications

| Component | Tech | Port | Destination in DK-OS |
|-----------|------|------|---------------------|
| **API** | NestJS 10 | 3004 | New module in `apps/api/` or separate `apps/mercury-api/` |
| **Web dashboard** | Next.js 15 | 3000 | New routes in `apps/app/` or separate `apps/mercury/` |
| **BullMQ Worker** | NestJS (same image, different entrypoint) | — | Add worker service to Docker Compose |
| **Tray app** | Swift 5.9+ (macOS) | — | Stays as standalone — distribute separately, update API endpoint |
| **Screenpipe pipe** | TypeScript plugin | — | Stays as standalone — runs on Mac, syncs to S3 |
| **NeMo STT** | Python / NVIDIA NeMo | — | Stays on DGX Spark (krang) — separate deployment lifecycle |

### NestJS Modules

From the API service:

| Module | Purpose | DK-OS Fit |
|--------|---------|-----------|
| Transcripts | CRUD, search, segment management | New DK-OS module |
| Summaries | AI-generated daily summaries | New DK-OS module |
| Knowledge Graph | Entity extraction, relationship mapping | New DK-OS module |
| Connectors | Google Calendar, Gmail, Slack, HubSpot | Extend DK-OS's existing integration framework |
| Devices | Mac device registration, sync status | New DK-OS module |
| Search | Full-text + vector search across content | Extend DK-OS's search if it has one |
| Auth | Clerk JWT with org-scoped roles | DK-OS already uses Clerk — merge auth config |

### BullMQ Workers

| Queue | Purpose |
|-------|---------|
| Feedback analysis | Process captured audio transcripts |
| Sentiment analysis | Sentiment scoring on transcript segments |
| Transcription processing | NeMo STT result processing |
| Entity extraction | Knowledge graph entity identification |
| Summary generation | Daily summary compilation via Claude |
| Connector sync | Google Calendar, Gmail, Slack, HubSpot polling |

DK-OS already uses BullMQ — merge queue definitions, namespace queue names to avoid collision.

## Data Stores

### PostgreSQL 16 + pgvector

**13 tables** via Prisma ORM:

| Table | Purpose |
|-------|---------|
| `users` | User profiles (Clerk-synced) |
| `devices` | Mac device registration |
| `transcripts` | Full transcripts |
| `transcript_segments` | Speaker-diarized segments with timestamps |
| `calendar_events` | Google Calendar sync |
| `entities` | Knowledge graph nodes |
| `entity_mentions` | Entity occurrence tracking |
| `relationships` | Knowledge graph edges |
| `connectors` | Integration configs (Google, Slack, Gmail, HubSpot) |
| `slack_messages` | Ingested Slack messages |
| `email_threads` | Ingested email threads |
| `summaries` | AI-generated daily summaries |
| `hubspot_sync_log` | HubSpot bidirectional sync audit |

**Vector columns:** 384-dimensional embeddings on Feedback/transcript content.

**Migration approach:**
- DK-OS uses **Prisma ORM** — same ORM as dk-mercury
- **Recommended:** Merge Prisma schemas. DK-OS already has 50+ models — add mercury's 13 tables as a new set of models with a `mercury_` prefix or in a separate Prisma schema.

### Redis 7

- BullMQ job broker
- Caching

DK-OS already runs Redis 7 — merge, namespace queue names.

### MinIO / S3

- `mercury-audio` bucket for audio file storage
- DK-OS uses **SeaweedFS** — either:
  - Create a `mercury-audio` bucket in SeaweedFS
  - Or keep MinIO access from the K3s cluster (if NeMo STT writes there)

## External Service Dependencies

| Service | Current Config | Migration Action |
|---------|---------------|-----------------|
| **Clerk** | Own Clerk app (`discrete-firefly-25`), org-scoped | DK-OS already uses Clerk — merge or keep separate Clerk app |
| **Anthropic Claude** | Entity extraction, summaries | DK-OS already uses LiteLLM → route through it |
| **Google Calendar** | OAuth, 90-day backfill | Add OAuth config to DK-OS Doppler |
| **Gmail** | Email thread ingestion | Add OAuth config to DK-OS Doppler |
| **Slack** | Message ingestion | DK-OS already has Slack integration — merge or separate |
| **HubSpot** | Bidirectional CRM sync | Add as new DK-OS integration |
| **Avoma** | Transcript import via webhooks | Add as new DK-OS integration |
| **Screenpipe** | Audio capture on Mac | Unchanged — update API endpoint in pipe plugin |
| **Doppler** | Project: `dk-mercury` | Merge secrets into DK-OS Doppler project |
| **GHCR** | `ghcr.io/data-kinetic/dk-mercury/` | New image path under DK-OS |

## NeMo STT — Separate Deployment

The NeMo STT service does **NOT** move to DK-OS. It runs on krang's DGX Spark GPU:

| | Details |
|---|---|
| **Hardware** | DGX Spark (Grace Blackwell GB10), ~16GB of 128GB unified memory |
| **Models** | Parakeet TDT 1.1B (ASR), Streaming Sortformer (diarization), Silero VAD |
| **Trigger** | S3 event processor watches for new audio files |
| **Input** | Audio files from `mercury-audio` bucket (MinIO/S3) |
| **Output** | Writes transcription results back to S3, notifies API |

**After migration:**
- NeMo STT continues running on krang
- Update S3 endpoint if migrating from MinIO to SeaweedFS
- Update API callback URL to point to DK-OS (Megatron)

## Swift Tray App — Separate Distribution

The macOS tray app (`apps/tray/`) is a native Swift application:

- Stays as a standalone distributed binary
- Update `API_BASE_URL` to point to DK-OS endpoint
- Sparkle auto-update framework needs a new appcast URL
- This is independent of the server migration

## Deployment Shift

### Current (K8s/ArgoCD)

- Namespaces: `dk-mercury-prod` (penguin 10.0.0.11), `dk-mercury-staging` (krang 10.0.0.12)
- Deployments: API, Web, Worker
- ArgoCD auto-sync with self-heal
- Ingress: Traefik IngressRoute, `mercury.datakinetic.com`
- Secrets: Doppler Operator
- OTLP: Alloy in K3s infra namespace
- Grafana dashboard contributed in k8s base manifests

### Target (K8s / ArgoCD — following behavior-labs-ai patterns)

- Mercury services added to DK-OS's Kustomize manifests (`k8s/apps/mercury-api/`, `k8s/apps/mercury-web/`, `k8s/apps/mercury-worker/`)
- DK-OS's ArgoCD Application manifests include mercury Deployments
- dk-alchemy bootstrap entry updated for DK-OS
- Secrets: Doppler Operator (DopplerSecret CRDs) — merged into DK-OS Doppler project
- Ingress: Traefik IngressRoute + cert-manager TLS
- Observability: OTLP via Alloy Kustomize component
- Shared CNPG PostgreSQL, Redis, MinIO from dk-alchemy infra namespace

### DNS

| Domain | Action |
|--------|--------|
| `mercury.datakinetic.com` | Update edge IngressRoute to point at DK-OS namespace |

## Integration Opportunities

DK-OS is a business operating system with product management, feedback, initiatives, and integrations. Mercury adds organizational intelligence:

| Mercury Capability | DK-OS Integration Point |
|--------------------|------------------------|
| Meeting transcripts | Link to initiative discussions, feature feedback |
| Knowledge graph entities | Enrich DK-OS's customer/stakeholder data |
| Calendar events | Correlate with product milestones, sprint planning |
| Email threads | Feed into DK-OS's feedback analysis pipeline |
| Slack messages | Already in DK-OS — merge connectors |
| HubSpot sync | DK-OS CRM module — merge |
| Daily summaries | Surface in DK-OS dashboard as org intelligence widget |

## CI/CD Workflows to Migrate

| Workflow | Action |
|----------|--------|
| `api-nest-ci.yml` | Merge into DK-OS's `build-push.yml` matrix |
| `web-ci.yml` | Merge into DK-OS's build matrix |
| `tray-ci.yml` | Keep separate — native macOS build |
| `api-ci.yml` | Drop (legacy Python API) |
| `code-review.yml` and related | Evaluate — DK-OS may have its own quality gates |

## Gaps & Risks

| Gap | Risk | Mitigation |
|-----|------|------------|
| **Legacy Python API** | `services/api/` (FastAPI) vs `services/api-nest/` (NestJS) — unclear which is canonical | Confirm NestJS is active, drop Python API |
| **Clerk app mismatch** | Mercury uses its own Clerk app, DK-OS uses another | Decide: merge into one Clerk app, or multi-app with shared org |
| **NeMo STT coupling** | STT runs on different hardware, writes to S3 | Keep as-is, update S3/API endpoints |
| **Embedding dimensions** | Mercury uses 384-dim (`@xenova/transformers`), DK-OS may differ | Document and standardize |
| **Screenpipe dependency** | Proprietary audio capture SDK | Tray app update is independent of server migration |
| **Google/Gmail OAuth** | OAuth redirect URIs must update | Update in Google Cloud Console |
| **Prisma schema merge** | 13 tables into DK-OS's 50+ model schema | Prefix tables or use separate schema |

## Migration Steps

```
Phase 1: Preparation
  □ Confirm NestJS API is canonical (drop Python FastAPI if so)
  □ Audit dk-mercury Prisma schema — map to DK-OS models
  □ Decide: merge Clerk apps or keep separate
  □ Decide: MinIO → SeaweedFS for audio storage
  □ Document NeMo STT S3 event processor callback flow
  □ Audit Doppler secrets in dk-mercury project

Phase 2: Database Migration
  □ Add mercury tables to DK-OS Prisma schema (prefixed or separate schema)
  □ Run Prisma migrations on Megatron PostgreSQL
  □ Migrate existing data from K3s CNPG to Megatron PostgreSQL
  □ Verify pgvector extension and 384-dim embeddings

Phase 3: Service Migration
  □ Add mercury-api service to DK-OS docker-compose.yml
  □ Add mercury-web service to DK-OS docker-compose.yml
  □ Add mercury-worker service to DK-OS docker-compose.yml
  □ Configure BullMQ queues (namespaced to avoid collision with DK-OS queues)
  □ Configure Doppler secrets in DK-OS project
  □ Configure Nginx Proxy Manager routes

Phase 4: Integration Wiring
  □ Merge Clerk auth config (or configure multi-app)
  □ Route LLM calls through DK-OS's LiteLLM instance
  □ Connect Google Calendar, Gmail, Slack connectors
  □ Connect HubSpot integration
  □ Wire SeaweedFS for audio storage
  □ Update NeMo STT callback URL to Megatron endpoint
  □ Update Screenpipe pipe plugin API endpoint
  □ Update Swift tray app API endpoint + appcast URL

Phase 5: Validation
  □ Verify audio upload → NeMo STT → transcription pipeline
  □ Verify knowledge graph entity extraction
  □ Verify daily summary generation
  □ Verify all connectors sync (Calendar, Gmail, Slack, HubSpot)
  □ Verify web dashboard renders transcripts, summaries, graph
  □ Verify search (full-text + vector)

Phase 6: Cutover
  □ Update DNS (mercury.datakinetic.com → Megatron)
  □ Remove dk-mercury bootstrap from dk-alchemy
  □ Remove dk-mercury namespaces from K3s
  □ Update dk-alchemy probe-service targets
  □ Archive dk-mercury repo (keep tray app releases accessible)
```

## Related

- [Migration Overview](README.md)
- [dk-phantom → DK-OS](dk-phantom-to-dk-os.md) — the other DK-OS migration
