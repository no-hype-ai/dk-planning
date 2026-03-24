# Plan 03: Testing & Quality

## Goal

Establish comprehensive testing patterns in behavior-labs-ai that can be extracted to dk-template as the standard testing scaffold for all product repos. This plan has **no external dependencies** and can begin immediately.

## Current State

| Area | Current State |
|------|--------------|
| **Unit tests** | Vitest 4.x with jsdom, `@testing-library/react 16.x` — exists in some packages, coverage unknown |
| **E2E tests** | Playwright 1.51.1 installed (`test:browser` scripts) — extent of coverage unknown |
| **API tests** | NestJS testing module available — extent of coverage unknown |
| **CI gates** | `test.yaml` workflow runs tests on PR — no coverage thresholds enforced |
| **Lint/format** | Ultracite (auto-fix), Biome, TypeScript strict mode |
| **Type checking** | `pnpm typecheck` available |
| **Database** | Prisma migrations — no CI migration validation |

## Tech Stack for Testing

- **Unit/Integration:** Vitest 4.x (with jsdom for React components)
- **Component:** @testing-library/react 16.x
- **E2E:** Playwright 1.51.1
- **API:** NestJS `@nestjs/testing` module
- **Coverage:** Vitest built-in (v8 or istanbul)
- **Mocking:** Vitest built-in (`vi.mock`, `vi.spyOn`)

---

## Workstream 1: Unit Test Coverage

### Steps

1. **Audit current coverage**
   - Run `pnpm test -- --coverage` across all packages
   - Generate baseline coverage report (statements, branches, functions, lines)
   - Identify packages with zero coverage

2. **Set coverage targets by package tier**

   | Tier | Packages | Target |
   |------|----------|--------|
   | Critical | `database`, `auth`, `api-middleware`, `security`, `payments` | 80% |
   | Core | `ai`, `api-client`, `compliance`, `concept-evaluation`, `data-sources` | 60% |
   | UI | `design-system`, `analytics`, `feature-flags`, `notifications` | 40% |
   | Utility | `export`, `email`, `storage`, `webhooks`, `rate-limit` | 50% |

3. **Prioritize tests for critical packages**
   - `packages/database/` — Prisma model operations, query builders
   - `packages/auth/` — Clerk integration, org ID resolution, RBAC helpers
   - `packages/api-middleware/` — auth wrappers, validation, error handling
   - `packages/security/` — security utilities
   - `packages/payments/` — Stripe integration, webhook verification

4. **Configure per-package coverage in vitest.config.ts**
   - Set `coverage.thresholds` per package
   - Enable `coverage.reporter` for CI consumption (lcov, json-summary)

---

## Workstream 2: E2E Testing

### Steps

1. **Define critical user journeys**
   - Authentication flow (Clerk sign-in, org selection)
   - Project creation and navigation
   - Molecule dashboard (view predictions, run analysis)
   - Knowledge review (document upload, RAG chat)
   - Admin dashboard access and management
   - Export generation (PDF, PPTX)

2. **Create Playwright test suite**
   - Configure `playwright.config.ts` with:
     - Base URL pointing to local dev or staging
     - Browser matrix (chromium, webkit minimum)
     - Retry policy for flaky tests
     - Screenshot on failure
   - Create page object models for key pages
   - Implement tests for each critical journey

3. **CI integration**
   - Run Playwright tests on staging deploy (post-deploy hook)
   - Store test artifacts (screenshots, traces) as GitHub Action artifacts
   - Do NOT block PR merge on E2E (flaky risk) — run as informational initially

### Files (New)

```
e2e/
  playwright.config.ts
  pages/           # Page object models
  tests/           # Test files organized by journey
  fixtures/        # Test data
```

---

## Workstream 3: API Integration Tests

### Steps

1. **Create NestJS testing module setup**
   - Use `@nestjs/testing` to create test app instances
   - Configure test database (Prisma with test schema or in-memory SQLite)
   - Mock external services: Clerk, LiteLLM, Stripe, SeaweedFS

2. **Test critical API endpoints**
   - Health check endpoints (`/health`, `/health/ready`)
   - Auth endpoints (Clerk webhook, session validation)
   - Project CRUD operations
   - Research/molecule endpoints
   - BullMQ job creation and processing
   - WebSocket connection and events

3. **Test error handling paths**
   - Invalid auth tokens → 401
   - Missing org context → 403
   - Invalid input → 400 with Zod validation errors
   - Service unavailable (database down) → 503

### Files

```
apps/api/test/
  setup.ts          # Test module configuration
  helpers/          # Test utilities, factories
  integration/      # Integration test files by module
```

---

## Workstream 4: CI Quality Gates

### Steps

1. **Add coverage threshold enforcement to CI**
   - Update `test.yaml` (or shared workflow) to run `--coverage`
   - Fail CI if coverage drops below per-package thresholds
   - Post coverage summary as PR comment (via codecov or custom action)

2. **Add type-check gate**
   - Ensure `pnpm typecheck` runs in CI and blocks merge on failure

3. **Add lint gate**
   - Ensure `pnpm check` runs in CI and blocks merge on failure
   - Consider Biome CI integration for faster feedback

4. **Add build gate**
   - Ensure `pnpm build` succeeds in CI
   - Verify Docker builds succeed (catch missing dependencies)

5. **Configure required status checks on GitHub**
   - `test` (unit + coverage)
   - `typecheck`
   - `lint`
   - `build`
   - `standards` (when dk-alchemy/04 shared workflow available)

---

## Workstream 5: Database Migration Testing

### Steps

1. **Add migration validation to CI**
   - Run `prisma migrate deploy` against empty database in CI
   - Verify all migrations apply cleanly
   - Catch migration conflicts before merge

2. **Add migration drift detection**
   - Run `prisma migrate diff` to detect schema drift
   - Alert if deployed schema doesn't match latest migration

3. **Add seed data validation**
   - Run `pnpm db:seed` in CI to verify seed data applies
   - Catch broken seed scripts early

### Files

```
.github/workflows/test.yaml (or shared workflow)
packages/database/prisma/test-migrations.sh (new)
```

---

## Verification

- [ ] Coverage report generated for all packages
- [ ] Critical packages meet 80% coverage target
- [ ] Playwright E2E suite runs against staging
- [ ] API integration tests cover health, auth, CRUD, error paths
- [ ] CI enforces coverage thresholds, typecheck, lint, build
- [ ] Prisma migrations validated in CI
- [ ] PR comments show coverage delta

## Extraction to dk-template

Once patterns are proven:
- Vitest config with coverage thresholds → dk-template/02
- Playwright config + page object pattern → dk-template/04
- NestJS test setup → dk-template API scaffold
- CI quality gates → dk-template/02 shared workflows
- Migration testing script → dk-template database scaffold
