# @datakinetic/observability — Extraction Notes

## Source

Extracted from `data-kinetic/behavior-labs-ai` `packages/observability/` (internal package `@repo/observability`).

## Sentry Code Removed

The following Sentry references were stripped during extraction:

### Files completely dropped (Sentry-only, no OTel equivalent needed)

| File | Purpose | Why dropped |
|------|---------|-------------|
| `client.ts` | `Sentry.init()` for browser — replay, tracing | Sentry-only; replaced by Grafana Faro (future) |
| `server.ts` | `Sentry.init()` for Next.js server runtime | Sentry-only; OTel bootstrap is in `instrumentation.ts` |
| `edge.ts` | `Sentry.init()` for Next.js edge runtime | Sentry-only; no OTel edge equivalent yet |
| `sentry-user.ts` | `useSentryUser()` React hook | Sentry-only; user context moves to OTel resource attributes |
| `status/` | No-op placeholder + BetterStack types | Dead code |

### Files modified (Sentry calls removed)

| File | What changed |
|------|-------------|
| `error.ts` | Removed `import * as Sentry` and `Sentry.captureException(error)` call. Now logs via OTel `log.error()` only. |
| `error-client.ts` | Removed `import * as Sentry` and `Sentry.captureException(error)` call. Now logs via `console.error()` only. |
| `keys.ts` | Removed `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` env vars. |
| `next-config.ts` | Replaced `withSentry()` (wrapping `@sentry/nextjs` `withSentryConfig`) with `withObservability()` passthrough that enables the Next.js instrumentation hook. |
| `instrumentation.ts` | Removed `export const initializeSentry = initializeObservability` backward-compat alias. |

### Dependencies removed

- `@sentry/nextjs` (was the sole Sentry dependency)
- `@t3-oss/env-nextjs` (replaced with `@t3-oss/env-core` only; Next.js-specific env not needed)
- `react` (was needed for `sentry-user.ts` hook)
- `server-only` (was needed for `status/index.tsx`)

## New exports added

| Export | Source | Notes |
|--------|--------|-------|
| `./health` | New file | `livenessCheck()` and `readinessCheck()` utilities per the health check standard |

## Exports retained as-is (already OTel-only)

| Export | Notes |
|--------|-------|
| `./instrumentation` | OTel NodeSDK bootstrap — no changes needed |
| `./tracing` | `withSpan()`, `PipelineTracer`, span factories — no Sentry refs |
| `./log` | OTel-native structured logger — no Sentry refs |
| `./structured-log` | `PipelineLogger` — no Sentry refs |
| `./feedback` | `FeedbackLogger` — no Sentry refs |

## Migration path for behavior-labs-ai

When behavior-labs-ai adopts `@datakinetic/observability`:

1. Replace `@repo/observability` imports with `@datakinetic/observability`
2. Remove `packages/observability/` from the monorepo
3. Remove Sentry-specific files that were calling `@repo/observability/client`, `/server`, `/edge`, `/sentry-user`
4. Remove `@sentry/nextjs`, `@sentry/nestjs`, `@sentry/profiling-node` from app dependencies
5. Replace `withSentry()` calls in `next.config.ts` with `withObservability()`
6. Remove Sentry env vars from Doppler
7. Remove `/monitoring` tunnel route from Next.js apps

## Blockers / open items

- **`@t3-oss/env-core` version**: The source uses zod v4 (`^4.2.1`). Verify `@t3-oss/env-core@0.13.10` supports zod v4.
- **OTel SDK version alignment**: The `@opentelemetry/sdk-node@0.208.0` and `@opentelemetry/resources@2.2.0` have a major version gap; verify compatibility.
- **`logRecordProcessor` type cast**: The `as unknown as any` cast in `instrumentation.ts` is a workaround for SDK version mismatch. Should be fixed when OTel stabilizes the logs API.
- **`next` peer dependency**: `next-config.ts` imports `type { NextConfig }` — marked as optional peer dep.
- **Publish target**: Package is configured for GitHub Packages (`npm.pkg.github.com`). The final home is `dk-alchemy` repo, not dk-planning.
- **No tests yet**: Source package had no tests. Unit tests should be added before publishing.
- **Default tracer name**: Changed from `"concept-evaluation"` to `"app"` in `getTracer()` to be service-agnostic. Consumers can pass a custom name.
