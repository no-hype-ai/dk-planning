# Application Instrumentation

## Overview

Application-level observability covers how product repos emit telemetry (traces, metrics, logs), handle errors, and expose health checks. Today, behavior-labs-ai is the only repo with full instrumentation, running **dual Sentry + OpenTelemetry**. The target state is OTel-only with a shared package across all repos.

## Current State — behavior-labs-ai (Reference)

### OpenTelemetry Integration

The `packages/observability/` package (`@repo/observability`) wraps both `@sentry/nextjs` and a full OTel SDK.

| Export | Purpose |
|--------|---------|
| `./instrumentation` | OTel NodeSDK bootstrap — OTLP/HTTP exporters for traces, metrics, logs |
| `./tracing` | Custom span creation: `withSpan()`, `PipelineTracer`, `createLLMSpan()`, `createStorageSpan()` |
| `./log` | OTel-native structured logger via `@opentelemetry/api-logs` |
| `./structured-log` | `PipelineLogger` for evaluation pipeline observability |
| `./feedback` | `FeedbackLogger` for user feedback workflows (screenshots, GitHub issue creation) |
| `./error` | Server-side `parseError()` — logs via OTel, calls `Sentry.captureException()` |
| `./error-client` | Browser-safe `parseError()` — console.error + Sentry |
| `./keys` | Env var validation (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, Sentry vars) |
| `./next-config` | `withSentry()` wrapper for Next.js config (source map upload, `/monitoring` tunnel) |
| `./sentry-user` | `useSentryUser()` React hook — sets Clerk user context in Sentry |
| `./status` | No-op placeholder for future Grafana-based status checks |

### Custom Span Attributes

The `PipelineTracer` and span factories emit domain-specific attributes:

| Span Type | Attributes |
|-----------|-----------|
| **Evaluation** | `evaluation.id`, `concept.id`, `evaluation.stage` |
| **LLM Call** | `llm.model`, `llm.input_tokens`, `llm.output_tokens`, `llm.estimated_cost` |
| **Storage** | `storage.operation`, `storage.key`, `storage.file_size_bytes` |

### Sentry Integration (Current)

| Layer | Details |
|-------|---------|
| **NestJS API** | `@sentry/nestjs` + `@sentry/profiling-node`, 10% trace sample, 10% profile sample |
| **Next.js apps** | `@sentry/nextjs`, `/monitoring` tunnel, source map upload + deletion |
| **Client-side** | Replay (10% trace, 100% error replay), `maskAllText`, `maskAllInputs`, `blockAllMedia` |
| **Error capture** | `parseError()` calls both OTel `log.error()` and `Sentry.captureException()` |
| **Error boundaries** | Global error page + component `ErrorBoundary` → `parseError()` → Sentry |

**Env vars:** `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`

### Health Check Endpoints

| Endpoint | App | What It Checks |
|----------|-----|----------------|
| `GET /health` | NestJS API | Prisma `SELECT 1` via `@nestjs/terminus` |
| `GET /api/workers/health` | NestJS API | 14 BullMQ queues — error rate, backlog, stale jobs |
| `GET /api/workers/health/:queue` | NestJS API | Per-queue: active, waiting, failed, avgProcessingTime, successRate |
| `GET /api/workers/health/dlq/jobs` | NestJS API | Dead letter queue listing (admin-only) |
| `GET /api/health` | Admin app | Simple `{ status: "ok" }` |
| `GET /api/dashboard/health` | Admin app | Aggregated: API `/health` + database status (5s timeout) |
| `GET /api/dk-data/health` | Admin app | DK-Data PostgREST proxy (30s cache, admin-only) |
| `GET /health` | Client app | Bare `"OK"` for k8s liveness |

### Production Hardening (behavior-labs-ai)

- Rolling updates: maxSurge 1, maxUnavailable 0
- Pod anti-affinity across availability zones
- Liveness/readiness probes on `/health`
- PodDisruptionBudgets
- HPA: 3-10 replicas in prod, 2 in staging

## Sentry vs. Grafana Stack — Overlap Analysis

The same error and trace data currently flows to **both** systems:

| Capability | Sentry | Grafana Stack | Overlap? |
|------------|--------|---------------|----------|
| Error tracking | `Sentry.captureException()` | OTel logs → Loki | **Yes** |
| Stack traces | Sentry issues view | Loki + Tempo context | **Yes** |
| Traces | Sentry Performance (10%) | Tempo (100%) | **Yes** — Tempo gets more |
| Profiling | `@sentry/profiling-node` (10%) | Not available | Sentry-only |
| Session replay | Sentry Replay (100% on error) | Not available | Sentry-only |
| Source maps | Sentry upload | N/A | Sentry-only |
| Issue grouping | Auto-fingerprinting | N/A | Sentry-only |
| Release health | Crash-free session rates | N/A | Sentry-only |

## Sentry Migration Plan

### Phase 1 — Parallel (No Removals)

- Add `service.version` (Git SHA) and `deployment.environment` to OTel resource attributes
- Add `user.id` and `user.email` to OTel context (replaces Sentry user tagging)
- Add Grafana alert rules mirroring Sentry's error alert config
- Run both systems in parallel; validate Grafana catches everything Sentry does

### Phase 2 — Remove Sentry

- Remove `Sentry.captureException()` from `parseError()` — keep as OTel-only error handler
- Remove `@sentry/nextjs`, `@sentry/nestjs`, `@sentry/profiling-node` dependencies
- Remove `withSentry()` Next.js config wrapper, `/monitoring` tunnel route
- Remove `useSentryUser()` hook
- Remove Sentry env vars from Doppler

### Phase 3 — Replace Sentry-Only Features

| Feature | Replacement | Action |
|---------|-------------|--------|
| Profiling | **Grafana Pyroscope** | Deploy in dk-alchemy; add Pyroscope SDK to apps |
| Session replay | **PostHog Recordings** | Enable in PostHog (already integrated) |
| Frontend RUM | **Grafana Faro** | Add Faro web SDK; sends to Alloy OTLP endpoint |
| Issue grouping | **LogQL alert grouping** | Group by error fingerprint (message + location hash) |
| Source maps | **MinIO bucket** | Upload maps to MinIO; reference in OTel log attributes |
| Release tracking | **OTel resource attributes** | `service.version` + Grafana dashboard filters |

## Shared Observability Package (Target)

Extract `@repo/observability` into a shared package for all product repos:

```
@datakinetic/observability
  ├── instrumentation   — OTel SDK bootstrap (traces, metrics, logs → OTLP)
  ├── tracing           — withSpan(), createLLMSpan(), createStorageSpan()
  ├── log               — structured OTel logger
  ├── error             — parseError() (OTel-only, no Sentry)
  ├── error-client      — browser-safe parseError()
  ├── health            — standard health check utilities
  ├── next-config       — Next.js OTel config wrapper
  └── keys              — env var validation (OTEL_*, service name)
```

Publish to GHCR npm registry or a private registry. All product repos consume this instead of reinventing OTel setup.

## Self-Deployed Monitoring

Each product repo should ship its own dashboards and alerts alongside its application:

```
monitoring/
  dashboards/
    <service>-overview.json
    <service>-slo.json
  alerts/
    <service>.yaml
  recording-rules/
    <service>.yaml
```

dk-alchemy provides Kustomize components (`grafana-dashboards`, `grafana-alerts`) that create ConfigMaps from these directories, labeled for Grafana's provisioning to pick up. Product repos include these components in their kustomize overlays — dashboards deploy with the app, no dk-alchemy PRs needed.

## Health Check Standard

All product repos should implement:

| Endpoint | Purpose | Implementation |
|----------|---------|----------------|
| `GET /health` | k8s liveness probe | Bare `200 OK`, no dependency checks |
| `GET /ready` | k8s readiness probe | Check critical dependencies (DB, cache) |
| `GET /api/health` | Detailed health | Per-dependency status, response times |

## Gaps

- **Only behavior-labs-ai has instrumentation** — other repos have nothing
- **Dual instrumentation** — Sentry + OTel is redundant cost and complexity
- **No shared package** — each repo would need to rebuild the OTel setup from scratch
- **No health check standard** — ad-hoc endpoint patterns across apps
- **No frontend RUM in Grafana** — browser performance data only in Sentry

## Related Documentation

- [Observability](observability.md) — platform LGTM stack
- [Product Analytics](product-analytics.md) — PostHog (separate from infra observability)
- [Incident Management](incident-management.md) — SLOs, escalation
- [Onboarding](onboarding.md) — instrumentation checklist for new repos
