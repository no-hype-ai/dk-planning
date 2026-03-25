# Plan 05: Testing & Quality

## Goal

Establish comprehensive testing patterns for DK-OS. No external dependencies — this work can begin immediately.

## Current State

| Area | Status |
|------|--------|
| **Unit tests** | Vitest available, coverage unknown |
| **E2E tests** | Playwright installed, `test:browser` scripts exist |
| **API tests** | NestJS testing module available |
| **Agent-mesh tests** | Python pytest (separate from Node.js test suite) |
| **CI gates** | Build + deploy only — no test enforcement |
| **Type checking** | TypeScript strict mode |
| **Lint** | Ultracite auto-fix |

## Key Testing Challenges

DK-OS has unique testing complexity:
1. **Multi-tenant isolation** — Filtered Prisma extension must prevent cross-org data access
2. **10 webhook handlers** — Clerk, GitHub, Stripe, Linear, Jira, Slack, Intercom, Atlassian
3. **BullMQ workers** — 5 queues with 11 job types
4. **Socket.io presence** — Real-time state across connections
5. **82 Prisma models** — Large schema surface area
6. **Python agent-mesh** — Separate test framework (pytest)
7. **7 applications** — Multiple entry points to test

---

## Workstream 1: Multi-Tenant Isolation Tests (P0)

**This is the highest priority testing workstream.** Cross-org data leakage is a critical security issue.

### Steps

1. **Create test utilities for multi-org scenarios**
   - Factory functions to create test organizations and users
   - Helpers to switch org context in tests
   - Assertions for org-scoped query results

2. **Test filtered Prisma extension**
   - Verify `database` import from `@/lib/database` (app) auto-filters by organizationId
   - Verify `database` import from `@repo/backend/database` (api) does NOT auto-filter
   - Test: Create data in Org A → query from Org B context → expect empty
   - Test: BullMQ jobs include org context and worker respects it
   - Test: Server actions check organizationId before mutations

3. **Test critical cross-org boundaries**
   - Feedback: Org A feedback not visible to Org B
   - Features: Org A features not accessible by Org B
   - Integrations: Org A GitHub/Linear connections isolated
   - Files: Org A uploads not downloadable by Org B
   - Portal: Customer portal shows only relevant org data

---

## Workstream 2: Unit Test Coverage

### Coverage Targets by Package Tier

| Tier | Packages | Target |
|------|----------|--------|
| Critical | `backend` (Prisma), `queue`, `cache`, `storage` | 80% |
| Core | `github`, `linear`, `atlassian`, `hubspot`, `payments` | 60% |
| UI | `design-system`, `editor`, `canvas`, `widget`, `analytics` | 40% |
| Utility | `lib`, `seo`, `email`, `realtime` | 50% |

### Priority Tests

1. **`@repo/backend`** — Prisma model operations, filtered extension behavior, auth helpers
2. **`@repo/queue`** — BullMQ job creation, retry logic, dead letter handling
3. **`@repo/github`** — Webhook normalization for 10 event types
4. **`@repo/payments`** — Stripe webhook verification, subscription logic

---

## Workstream 3: E2E Testing (Playwright)

### Critical User Journeys

1. **Auth flow** — Clerk sign-in, org selection, role-based redirect
2. **Feedback submission** — Create feedback via UI, verify in list
3. **Feature lifecycle** — Create feature, change status, link to feedback
4. **Portal** — Customer submits feedback, votes on feature
5. **App switcher** — Navigate between Home, Product, Marketing apps
6. **Integration flow** — GitHub repo connection, PR auto-linking

### Configuration

```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    { name: 'app', testDir: './e2e/app', use: { baseURL: 'http://localhost:3000' } },
    { name: 'portal', testDir: './e2e/portal', use: { baseURL: 'http://localhost:3001' } },
    { name: 'web', testDir: './e2e/web', use: { baseURL: 'http://localhost:3002' } },
  ],
});
```

---

## Workstream 4: API Integration Tests

### NestJS Testing Module

1. **Webhook handlers** — Test all 10 webhook endpoints with realistic payloads
2. **BullMQ workers** — Test job processing with mocked external services
3. **Cron jobs** — Test scheduled tasks execute correctly
4. **Health endpoints** — Verify `/health`, `/ready` responses and dependency checking
5. **Auth middleware** — Test Clerk JWT validation, role enforcement

### Agent-Mesh Tests (Python)

1. **pytest setup** for `apps/agent-mesh/`
2. **MCP tool tests** — Test each of 40+ tools with mock data
3. **Auth tests** — Clerk JWT validation in FastAPI
4. **Database tests** — SQLModel operations with test database

---

## Workstream 5: CI Quality Gates

### Steps

1. **Add test step to CI** — `pnpm test -- --coverage`
2. **Add type-check gate** — `pnpm typecheck`
3. **Add lint gate** — `pnpm check`
4. **Add build gate** — `pnpm build`
5. **Add agent-mesh tests** — `cd apps/agent-mesh && pytest`
6. **Configure required checks** on GitHub branch protection

---

## Verification

- [ ] Multi-tenant isolation tests pass (zero cross-org data access)
- [ ] Critical packages meet coverage targets
- [ ] Playwright E2E suite covers 6 critical journeys
- [ ] All 10 webhook handlers have integration tests
- [ ] Agent-mesh has pytest suite with MCP tool coverage
- [ ] CI enforces all quality gates
