# Plan 05: AI & LLM Infrastructure

## Goal

Track and plan AI-specific infrastructure that crosses repo boundaries — LiteLLM gateway integration, LightRAG deployment, model requirements, and async AI workload patterns.

## Current State

| Component | Current State |
|-----------|--------------|
| **LLM Gateway** | dk-litellm HA VM at llm.behaviorlabs.ai, virtual keys per app, per-app budgets |
| **AI SDK** | `@repo/ai` package wrapping Vercel AI SDK v5, used across features |
| **RAG** | LightRAG (external Python service) for knowledge review — recently implemented (#038) |
| **Job Processing** | BullMQ with 6+ worker queues for async AI workloads |
| **Models in Use** | Multiple models via LiteLLM proxy — specific inventory needed |
| **Embeddings** | Qwen3-Embedding deployment pending (#739, blocker for 038) |

## Dependencies

| Dependency | Owner | Status |
|-----------|-------|--------|
| dk-litellm VM operational | dk-litellm repo | Operational |
| Qwen3-Embedding deployed | dk-litellm | Pending (#739) |
| LiteLLM virtual key management | dk-alchemy Platform API | Partial — API scaffold deployed |
| Cost tracking dashboard | dk-alchemy/13 | Phase 1-2 complete |

---

## Workstream 1: LiteLLM Integration Patterns

### Current Architecture

```
behavior-labs-ai (apps/api)
  └── @repo/ai (Vercel AI SDK wrapper)
        └── LiteLLM Proxy (llm.behaviorlabs.ai)
              └── Model Providers (OpenAI, Anthropic, local vLLM, etc.)
```

### Steps

1. **Document current model usage**
   - Audit `@repo/ai` package for model references
   - Map features to models (concept eval → ?, competitive intel → ?, compliance → ?)
   - Identify per-feature budget requirements

2. **Standardize LiteLLM key management**
   - Use virtual keys per feature/environment (not shared)
   - Integrate with dk-alchemy Platform API `/dk/v1/llm/*` endpoints when available
   - Document key rotation procedure

3. **Implement model fallback patterns**
   - Primary model → fallback model for each feature
   - Timeout and retry policies per model class
   - Circuit breaker for LiteLLM unavailability

4. **Add LLM observability**
   - Track per-request: model, tokens (prompt/completion), latency, cost
   - Feed metrics to dk-alchemy/13 LLM cost dashboard
   - Alert on budget threshold breaches

### Files

```
packages/ai/src/
  models.ts          # Model configuration and selection
  client.ts          # LiteLLM client setup
  fallback.ts        # Fallback and retry logic
```

---

## Workstream 2: LightRAG Deployment

### Current State

LightRAG is an external Python service used for knowledge review RAG functionality (feature 038). Current deployment status and architecture need verification.

### Steps

1. **Document current LightRAG setup**
   - Where is it deployed? (K8s pod, standalone VM, docker-compose)
   - What embedding model does it use? (Qwen3-Embedding pending)
   - How does behavior-labs-ai connect? (REST API, gRPC)
   - What data does it index? (documents, knowledge assets)

2. **Production readiness checklist**
   - [ ] Health check endpoint
   - [ ] Resource limits and requests set
   - [ ] Persistent storage for vector index
   - [ ] Backup strategy for vector data
   - [ ] Monitoring (Grafana dashboard for LightRAG)
   - [ ] Rate limiting on RAG endpoints

3. **Embedding model deployment**
   - Deploy Qwen3-Embedding on dk-litellm (#739)
   - Configure LightRAG to use deployed embedding endpoint
   - Validate embedding quality (compare to previous model if applicable)

4. **Index management**
   - Define re-indexing strategy (on document upload, scheduled, manual)
   - Implement index versioning
   - Plan for multi-tenant index isolation (per-org)

---

## Workstream 3: Vercel AI SDK Patterns

### Current Architecture

`@repo/ai` wraps Vercel AI SDK v5 and is used across multiple features for:
- Text generation (concept evaluation, competitive intel)
- Streaming responses (chat interfaces)
- Tool/function calling (agent workflows)
- Structured output (compliance review, data extraction)

### Steps

1. **Standardize SDK usage patterns**
   - Document approved patterns for `generateText`, `streamText`, `generateObject`
   - Define standard tool/function calling patterns
   - Create reusable prompt templates by feature domain

2. **Implement token management**
   - Track token usage per request via Vercel AI SDK callbacks
   - Feed into LiteLLM cost tracking
   - Implement per-user/per-org token budgets

3. **Error handling standardization**
   - Standard retry logic for rate limits (429)
   - Timeout handling per model class
   - Graceful degradation for model unavailability
   - User-facing error messages vs technical logs

---

## Workstream 4: Model Deployment Tracking

Maintain a registry of models required by behavior-labs-ai features.

| Model | Provider | Feature(s) | Status | dk-litellm Config |
|-------|----------|-----------|--------|-------------------|
| *Audit needed* | — | Concept Evaluation | — | — |
| *Audit needed* | — | Competitive Intelligence | — | — |
| *Audit needed* | — | Compliance/MLR Review | — | — |
| *Audit needed* | — | Knowledge RAG Chat | — | — |
| Qwen3-Embedding | Local (vLLM) | LightRAG embeddings | Pending (#739) | Deployment needed |

**Action:** Audit `@repo/ai` and feature-specific code to populate this table.

---

## Workstream 5: BullMQ AI Queue Patterns

### Current State

behavior-labs-ai uses BullMQ for async job processing across 6+ worker queues. AI workloads are particularly important due to:
- Long-running inference (10s-60s per request)
- High failure rate potential (model timeouts, rate limits)
- Cost implications (failed retries multiply spend)

### Steps

1. **Document current queue architecture**
   - Map queues to features
   - Document retry policies per queue
   - Document timeout settings

2. **Optimize AI-specific queue patterns**
   - Set appropriate timeouts per model class (fast models: 30s, slow models: 120s)
   - Implement exponential backoff for rate limit retries
   - Add dead letter queue for failed AI jobs with context for debugging
   - Implement job deduplication for idempotent operations

3. **Add queue monitoring**
   - BullMQ dashboard (Bull Board or equivalent) for debugging
   - Grafana dashboard for queue depth, processing time, failure rate
   - Alert on queue backup (depth > threshold for > 5 minutes)

4. **Cost-aware scheduling**
   - Priority queues: urgent (user-facing) vs batch (background processing)
   - Time-of-day scheduling for non-urgent batch jobs (if cost varies)
   - Circuit breaker to pause queues if budget threshold hit

---

## Workstream 5: dk-data Integration

behavior-labs-ai consumes dk-data-fe's data intelligence API for pharma analytics — drug data, clinical trials, patent information, regulatory filings, and molecular data. This workstream establishes the integration pattern.

### Dependencies

- [dk-data-fe/05 API Integration & Metering](../dk-data-fe/05-api-integration-and-metering.md) — metering proxy and consumer key flow

### Steps

1. **Identify consumed schemas**
   - `mart` — drug development analytics, hospital scoring, TAVR data
   - `api` — PostgREST auto-generated REST endpoints
   - `mol_api` — molecular data (structures, patents, clinical trials)
   - `scoring` — proprietary scoring models

2. **Obtain dk-data consumer API key**
   - Request key via Platform API: `dk data keys create --app behavior-labs-ai --schemas mart,api,mol_api,scoring --rpm 500`
   - Store key in Doppler: `behaviorlabs-applications/prd` → `DK_DATA_API_KEY`
   - Configure in API service env: `DK_DATA_API_KEY` and `DK_DATA_BASE_URL=https://data.behaviorlabs.ai`

3. **Create data client package**
   - Add `packages/dk-data-client/` to behavior-labs-ai monorepo
   - Typed REST client for dk-data PostgREST API
   - Auth header injection from `DK_DATA_API_KEY`
   - Error handling for 401 (key invalid), 403 (schema denied), 429 (rate limited)

4. **Update NetworkPolicy**
   - Allow egress from behavior-labs-ai namespace to dk-data namespace on port 3001 (metering proxy)

5. **Add data query observability**
   - Track dk-data queries in OTel spans: schema, response time, data volume
   - Alert on dk-data unavailability (circuit breaker)

---

## Verification

- [ ] Model inventory table fully populated
- [ ] LightRAG production readiness checklist complete
- [ ] Qwen3-Embedding deployed and functional (#739 closed)
- [ ] BullMQ queue architecture documented
- [ ] LLM cost metrics flowing to dk-alchemy/13 dashboard
- [ ] `@repo/ai` patterns documented with error handling standards
- [ ] dk-data consumer key configured in Doppler
- [ ] `packages/dk-data-client/` queries dk-data schemas successfully
- [ ] NetworkPolicy allows egress to dk-data namespace

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Qwen3-Embedding deployment delayed | LightRAG quality degraded | Use alternative embedding model as interim |
| LiteLLM proxy outage | All AI features down | Circuit breaker, cached responses for non-critical paths |
| Model cost overrun | Budget exceeded | Per-feature budgets, alerts at 80% threshold, auto-pause at 100% |
| LightRAG index corruption | Knowledge search broken | Regular index backups, re-index capability |
