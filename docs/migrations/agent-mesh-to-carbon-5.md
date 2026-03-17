# Migration: agent-mesh → carbon-5

## Summary

| | |
|---|---|
| **Source** | [data-kinetic/agent-mesh](https://github.com/data-kinetic/agent-mesh) |
| **Target** | [data-kinetic/carbon-5](https://github.com/data-kinetic/carbon-5) |
| **Complexity** | High |
| **Suggested order** | 4 of 4 (last — most complex, depends on carbon-5 maturity) |

## What agent-mesh Is

A **federated agent orchestration platform** providing:
- Agent CRUD with semantic versioning
- Multi-provider LLM support (Anthropic, OpenAI, Google, Ollama) with failover
- Real-time SSE streaming execution
- Tool management with sandboxed execution (`isolated-vm`)
- MCP gateway (client + server) — exposes agents as MCP tools
- Visual workflow builder with DAG execution
- Agent-to-agent delegation with loop detection
- Sidecar injection (knowledge, skills, prompts, personas)
- Policy enforcement (access, rate-limit, content, cost, delegation)
- ACE (Adaptive Context Evolution) for agent self-improvement
- Audit logging, webhooks, circuit breakers
- Agent catalog with pgvector semantic search

## What Moves

### Applications

| Component | Tech | Port | Destination in carbon-5 |
|-----------|------|------|------------------------|
| **API** | NestJS 11 | 3010 | Merge into `apps/api/` as agent modules, or keep as separate `apps/agent-api/` |
| **Web dashboard** | Next.js 15 | 3000 | Merge into `apps/app/` as agent routes, or keep as `apps/agent-web/` |

### Packages

| Package | Purpose | Action |
|---------|---------|--------|
| `packages/database/` | Prisma schema + client (25+ tables) | Merge schema into carbon-5's Drizzle ORM, or keep as separate Prisma package |
| `packages/shared/` | TypeScript types, Zod schemas, LLM config | Merge into carbon-5's shared types |
| `packages/api-client/` | OpenAPI-generated client | Regenerate from merged API |
| `packages/sdk/` | `@datakinetic/agent-mesh-sdk` (published npm) | Continue publishing, update imports |
| `packages/mcp-types/` | MCP type definitions | Merge into carbon-5 types |
| `packages/observability/` | OTel + Pino NestJS module | Merge with carbon-5's Sentry/OTel setup |

### NestJS Modules (20+)

These are the API's functional modules — each becomes a module or service in carbon-5's API:

Agents, Providers, Runtime, Memory, Catalog, Tools, MCP (client), MCP-Server, Workflows, ACE, ConfigManagement, EventBus, WorkerPools, Sidecars, Registry, Delegation, Policies, Audit, Notifications, CircuitBreaker

### Feature Specs

9 feature specifications in `specs/001-009` with plans, contracts, data models, and checklists. Archive or migrate to carbon-5's `specs/` directory.

## Data Stores

### PostgreSQL 17 + pgvector

**25+ tables** via Prisma ORM:

| Table Group | Tables | Notes |
|-------------|--------|-------|
| **Core** | agents, agent_versions, agent_tags | Semantic versioning, catalog search |
| **Execution** | executions, sessions, execution_messages | SSE streaming, conversation history |
| **Tools** | tools, tool_executions | Sandboxed via isolated-vm |
| **MCP** | mcp_servers, mcp_connections | Client + server protocol |
| **Workflows** | workflows, workflow_nodes, workflow_edges, workflow_executions | DAG builder |
| **Policies** | policies, policy_evaluations | Access, rate-limit, content, cost |
| **Sidecars** | sidecars, sidecar_assignments | Knowledge, skills, personas |
| **Config** | config_entries, config_snapshots | Versioned configuration |
| **Audit** | audit_logs | Full audit trail |
| **Delegation** | delegation_chains | Agent-to-agent with loop detection |
| **Worker pools** | worker_pool_configs | Per-tenant worker configuration |
| **Webhooks** | webhook_configs, webhook_deliveries | Event notifications |

**Vector columns:** `vector(1536)` for agent catalog semantic search.

**Migration approach:**
- carbon-5 uses **Drizzle ORM** (not Prisma) — schema must be translated
- Option A: Keep agent-mesh's Prisma as a separate database + client package
- Option B: Translate all 25+ tables to Drizzle and merge into carbon-5's schema
- **Recommended:** Option A initially (separate database, Prisma package), consolidate schemas later

### Redis 7

- BullMQ job queues (WorkerPools module)
- Agent cache, config cache
- EventBus module

carbon-5 already uses Redis 7 for BullMQ — queue names must not collide.

### MinIO / S3

Used for file uploads (shared from behavior-labs-ai infra). carbon-5 uses SeaweedFS instead — need to decide whether to migrate to SeaweedFS or keep MinIO access.

## External Service Dependencies

| Service | Current Config | Migration Action |
|---------|---------------|-----------------|
| **Clerk** | Shared JWT from behavior-labs-ai org | Continue using same Clerk org; update allowed origins |
| **Anthropic API** | `@ai-sdk/anthropic` | Already in carbon-5 via LiteLLM |
| **OpenAI API** | `@ai-sdk/openai` (also embeddings) | Already in carbon-5 via LiteLLM |
| **Google AI** | `@ai-sdk/google` | Add to carbon-5's LiteLLM config |
| **Ollama** | Optional local LLM | Keep as optional |
| **Doppler** | Project: `agent-mesh` | Create new Doppler config under carbon-5 project, migrate secrets |
| **GHCR** | `ghcr.io/data-kinetic/agent-mesh/api` | New image path under carbon-5 |
| **Slack** | Deploy notifications | Merge into carbon-5's notification setup |

## Deployment Shift

### Current (K8s/ArgoCD)

- K8s Deployment: 2 replicas (3 prod, 1 staging)
- Resources: 256Mi-1Gi memory, 100m-1000m CPU
- Ingress: Traefik, TLS via cert-manager, `agents.behaviorlabs.ai`
- Secrets: Doppler Operator (DopplerSecret CRDs)
- OTLP: `alloy.infra.svc.cluster.local:4318`
- ArgoCD Image Updater with tag pattern matching
- Staging cluster: `10.0.0.12:6443`

### Target (K8s / ArgoCD — following behavior-labs-ai patterns)

- Agent services as K8s Deployments in carbon-5's Kustomize manifests (`k8s/apps/agent-api/`, `k8s/apps/agent-web/`)
- carbon-5's ArgoCD Application manifests include agent Deployments
- dk-alchemy bootstrap entry for carbon-5
- Secrets: Doppler Operator (DopplerSecret CRDs) — merged into carbon-5 Doppler project
- Ingress: Traefik IngressRoute + cert-manager TLS
- Observability: OTLP via Alloy Kustomize component
- Agent-mesh's existing Kustomize manifests can be adapted (same patterns — already K8s-native)

### DNS

| Domain | Action |
|--------|--------|
| `agents.behaviorlabs.ai` | Remap to carbon-5's Nginx Proxy Manager, or retire and use carbon-5 domain |

## SDK Publishing

`@datakinetic/agent-mesh-sdk` is published to npm and consumed by external clients:

- Continue publishing from carbon-5 repo (update CI workflow)
- Maintain backward compatibility or bump major version
- Update package's repository field and import paths

## CI/CD Workflows to Migrate

| Workflow | Action |
|----------|--------|
| `ci.yml` | Merge checks into carbon-5's CI |
| `release-api.yml` | Replace with carbon-5's deploy workflow |
| `e2e.yml` | Add to carbon-5's test suite |
| `generate-client.yml` | Merge — regenerate from carbon-5's unified API |
| `load-test.yml` | Add to carbon-5's test suite |
| `publish-sdk.yml` / `release-sdk.yml` | Keep — continue publishing SDK |

## Gaps & Risks

| Gap | Risk | Mitigation |
|-----|------|------------|
| **ORM mismatch** | agent-mesh uses Prisma, carbon-5 uses Drizzle | Keep as separate database initially |
| **Node version mismatch** | agent-mesh uses Node 22, carbon-5 uses Node 20 | Upgrade carbon-5 to Node 22 |
| **Embedding dimensions** | agent-mesh uses 1536-dim vectors (OpenAI), carbon-5 may differ | Standardize on one embedding model |
| **Module complexity** | 20+ NestJS modules is large | Migrate in phases — core first (agents, execution, tools), then advanced (MCP, workflows, ACE) |
| **Clerk auth coupling** | Shares Clerk org with behavior-labs-ai | May need to separate or use multi-app within same Clerk org |
| **SDK consumers** | External consumers depend on `@datakinetic/agent-mesh-sdk` | Maintain backward compat or coordinate migration |
| **MinIO → SeaweedFS** | Different S3-compatible stores | Both support AWS SDK — adapter change should be minimal |

## Migration Steps

```
Phase 1: Preparation
  □ Audit agent-mesh API surface — document all endpoints, WebSocket events, SSE streams
  □ Map NestJS modules to carbon-5 module structure
  □ Decide: merge into apps/api or keep as apps/agent-api
  □ Decide: Prisma coexistence or Drizzle translation
  □ Create Doppler config for agent services under carbon-5 project
  □ Upgrade carbon-5 to Node 22

Phase 2: Code Migration
  □ Copy/adapt Prisma schema and migrations (if keeping Prisma)
  □ Migrate NestJS modules (core: Agents, Runtime, Tools, Catalog)
  □ Migrate NestJS modules (advanced: MCP, Workflows, Policies, ACE)
  □ Migrate shared types and Zod schemas
  □ Migrate observability package (merge OTel config)
  □ Migrate SDK package (update imports, rebuild)
  □ Migrate frontend routes (agent dashboard views)

Phase 3: Integration
  □ Wire agent modules into carbon-5's auth (Clerk)
  □ Connect to carbon-5's Redis (namespace queues to avoid collision)
  □ Connect to carbon-5's SeaweedFS (or keep MinIO)
  □ Add Docker Compose service definitions
  □ Configure Nginx Proxy Manager routes
  □ Update Doppler secrets

Phase 4: Validation
  □ Run agent-mesh e2e tests against carbon-5 deployment
  □ Run load tests
  □ Verify SDK still publishes and works
  □ Verify MCP gateway functionality
  □ Verify SSE streaming

Phase 5: Cutover
  □ Update DNS (agents.behaviorlabs.ai → carbon-5)
  □ Update behavior-labs-ai references to agent-mesh endpoints
  □ Remove agent-mesh bootstrap from dk-alchemy
  □ Archive agent-mesh repo
  □ Update dk-alchemy probe targets
```

## Related

- [Migration Overview](README.md)
- [dk-data-fe → carbon-5](dk-data-to-carbon-5.md) — the other carbon-5 migration
