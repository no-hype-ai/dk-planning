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

## Current State (audited 2026-03-23)

> **Package extraction is SUBSTANTIALLY COMPLETE.** Located in dk-alchemy monorepo (Option B), not standalone repo (Option A).
> Publishing status needs verification.

**Implemented (on main in dk-alchemy):**
- `packages/observability/` — 1709 LoC TypeScript, version 0.1.0
- Package name: `@data-kinetic/observability`
- publishConfig: `npm.pkg.github.com` (GHCR npm)
- Build: tsup (dual CJS/ESM), vitest for tests
- `.github/workflows/build-observability.yaml` — test + conditional publish

**Validation findings:**
- VALIDATED: All 8 planned exports present (instrumentation, tracing, log, error, error-client, health, next-config, keys)
- VALIDATED: 2 additional exports beyond plan: `structured-log`, `feedback` (additive, not conflicting)
- VALIDATED: Zero Sentry imports remaining in source code
- VALIDATED: GHCR npm publish config correct
- VALIDATED: TypeScript strict mode, declaration maps enabled
- GAP: `docs/observability-integration-guide.md` NOT created
- **DECISION CHANGE:** Plan recommended Option A (standalone repo). Option B (dk-alchemy monorepo) was chosen instead. Update plan to reflect this.

## Existing Work
- behavior-labs-ai: packages/observability/ (source, includes Sentry dual-write)
- dk-planning docs: application-instrumentation.md (package design, exports)
- dk-alchemy: k8s/components/otlp-collector/ (ExternalName service apps use)

## Implementation Steps
1. ~~Create new repo~~ → Package lives in dk-alchemy monorepo at `packages/observability/` (Option B chosen)
2. ~~Copy packages/observability/ from behavior-labs-ai~~ → ✅ Done
3. ~~Remove all Sentry imports and dual-write code~~ → ✅ Done (zero Sentry references)
4. ~~Restructure exports~~ → ✅ Done. Exports:
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
5. ~~Add package.json with exports map, TypeScript config, build pipeline~~ → ✅ Done (tsup, vitest, strict TS)
6. Verify publishing to GHCR npm registry works (workflow exists, confirm package is accessible)
7. Update behavior-labs-ai to consume from published package (remove local packages/observability/)
8. Add to dk-template: default dependency in generated package.json
9. Update dk-alchemy onboarding checklist reference
10. Create integration guide in dk-alchemy/docs/observability-integration-guide.md

## dk-alchemy Changes
- ~~DONE~~: `packages/observability/` ✅ Package extracted to dk-alchemy monorepo
- ~~DONE~~: `.github/workflows/build-observability.yaml` ✅ Build workflow
- CREATE: `docs/observability-integration-guide.md` (integration guide for consumers)

## Other Repo Changes
- ~~N/A~~: ~~data-kinetic/observability repo~~ — Option B chosen; package lives in dk-alchemy monorepo, not standalone
- MODIFY: behavior-labs-ai package.json (replace local package with published @data-kinetic/observability from GHCR)
- MODIFY: dk-template (add @datakinetic/observability dependency)

## Verification
- npm install @datakinetic/observability succeeds from GHCR
- behavior-labs-ai passes all tests with published package
- New repo scaffolded from dk-template includes observability package
- OTel traces appear in Tempo for apps using the package
- Standards Compliance Tier 4 check passes for repos with the package

## Options/Recommendations
**Package Location:**
- **Option A: Standalone repo** (data-kinetic/observability) — clean separation, independent versioning, easy to publish
- **Option B (CHOSEN): dk-alchemy monorepo** — keeps infrastructure code together; publishing via dedicated workflow
- **Option C: Stay in behavior-labs-ai** — publish from there. Least disruption but couples product repo to shared package

**Decision:** Option B was chosen. Package lives at `dk-alchemy/packages/observability/` with a dedicated build-observability.yaml workflow. This keeps the platform observability package co-located with the infrastructure that consumes its telemetry.
