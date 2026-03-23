# Shared Observability Package

## Context
Only behavior-labs-ai has OTel instrumentation (in packages/observability/). Other repos have nothing. Extracting this into @datakinetic/observability enables all product repos to adopt platform observability with minimal effort. This is a prerequisite for Sentry migration and standards compliance Tier 4.

## Scope
- Extract packages/observability/ from behavior-labs-ai into standalone package
- Publish as @datakinetic/observability to GHCR npm registry
- Remove Sentry dependencies (OTel-only)
- Add exports: instrumentation, tracing, log, error, error-client, health, next-config, keys
- Add to dk-template for new repo scaffolding
- Standards Compliance Tier 4 enforces its usage

## Dependencies
- Plan 05 (Sentry Migration) Phase 2 — Sentry removal should happen before or simultaneously with package extraction
- dk-template should reference the package

## Existing Work
- behavior-labs-ai: packages/observability/ (source, includes Sentry dual-write)
- dk-planning docs: application-instrumentation.md (package design, exports)
- dk-alchemy: k8s/components/otlp-collector/ (ExternalName service apps use)

## Implementation Steps
1. Create new repo: data-kinetic/observability (or published from dk-alchemy monorepo)
2. Copy packages/observability/ from behavior-labs-ai
3. Remove all Sentry imports and dual-write code
4. Restructure exports:
   - `./instrumentation` — OTel NodeSDK bootstrap (NodeTracerProvider, resource detection)
   - `./tracing` — withSpan() helper, custom span factories:
     - createLLMSpan (model, tokens, latency)
     - createStorageSpan (operation, bucket/key)
     - createPipelineSpan (pipeline name, stage, source)
   - `./log` — OTel-native structured logger (maps to Loki labels)
   - `./error` — parseError() server-side (logs to OTel, creates error span)
   - `./error-client` — parseError() browser-safe (no Node dependencies)
   - `./health` — standard health check utilities (/health, /ready, /api/health)
   - `./next-config` — Next.js OTel wrapper config
   - `./keys` — env var validation (OTEL_SERVICE_NAME, OTEL_EXPORTER_OTLP_ENDPOINT required)
5. Add package.json with exports map, TypeScript config, build pipeline
6. Publish to GHCR npm registry: @datakinetic/observability
7. Update behavior-labs-ai to consume from published package (remove packages/observability/)
8. Add to dk-template: default dependency in generated package.json
9. Update dk-alchemy onboarding checklist reference
10. Create integration guide in dk-alchemy/docs/observability-integration-guide.md

## dk-alchemy Changes
- None directly (package lives in separate repo or behavior-labs-ai)
- UPDATE: docs/ (add integration guide reference)

## Other Repo Changes
- CREATE: data-kinetic/observability repo (or extract to standalone)
- MODIFY: behavior-labs-ai package.json (replace local package with published)
- MODIFY: dk-template (add @datakinetic/observability dependency)

## Verification
- npm install @datakinetic/observability succeeds from GHCR
- behavior-labs-ai passes all tests with published package
- New repo scaffolded from dk-template includes observability package
- OTel traces appear in Tempo for apps using the package
- Standards Compliance Tier 4 check passes for repos with the package

## Options/Recommendations
**Package Location:**
- **Option A (Recommended): Standalone repo** (data-kinetic/observability) — clean separation, independent versioning, easy to publish
- **Option B: dk-alchemy monorepo** — keeps infrastructure code together but npm publishing from infra repo is awkward
- **Option C: Stay in behavior-labs-ai** — publish from there. Least disruption but couples product repo to shared package

**Recommendation:** Option A. Standalone repo with its own CI/CD for npm publishing. Clean dependency graph.
