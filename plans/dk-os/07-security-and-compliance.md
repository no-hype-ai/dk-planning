# Plan 07: Security & Compliance

## Goal

Harden DK-OS security posture with focus on multi-tenant isolation, webhook security, agent-mesh sandboxing, and compliance alignment. DK-OS has a **customer-facing portal** and handles data from 10+ integration sources, making security critical.

## Current State

| Area | Status |
|------|--------|
| **Auth** | Clerk (DKOSRole: Admin, Editor, Member), multi-org |
| **Org isolation** | Filtered Prisma extension auto-scopes queries in server actions |
| **Webhooks** | 10 handlers (Clerk, GitHub, Stripe, Linear, Jira, Slack, Intercom, Atlassian) |
| **Agent-mesh** | Clerk JWT auth, Docker orchestrator, 40+ MCP tools |
| **Portal** | Public-facing customer feedback portal |
| **Secrets** | Doppler (dk-os project, dev_main/stg_main/prd_main configs) |
| **Network** | Docker bridge on Megatron (no K8s NetworkPolicy yet) |
| **Dependencies** | pnpm with override patches for security |

## Dependencies

| Dependency | Plan | Blocking |
|-----------|------|----------|
| K8s migration | [dk-os/01](01-k8s-migration.md) | NetworkPolicy |
| Kyverno enforcement | [dk-alchemy/03](../dk-alchemy/03-security-hardening.md) | Policy compliance |
| Compliance framework | dk-compliance-v2 | Control mapping |

---

## Workstream 1: Multi-Tenant Isolation Audit (P0)

DK-OS uses a **filtered Prisma extension** as its primary security boundary. This is the most critical security mechanism.

### Architecture

```
apps/app (Next.js server actions)
  └── import { database } from "@/lib/database"
        └── Prisma extension: auto-adds WHERE organizationId = <current>
        └── SAFE: queries always scoped to current org

apps/api (NestJS)
  └── import { database } from "@repo/backend/database"
        └── RAW Prisma client — no auto-filter
        └── MUST pass organizationId explicitly in every query
        └── RISK: developer error → cross-org data access
```

### Audit Steps

1. **Verify `@/lib/database` usage in all server actions (46 directories)**
   - Every server action MUST use the filtered import
   - Flag any raw `@repo/backend/database` imports in app/

2. **Audit API endpoints for org scoping**
   - Every NestJS controller/service that accesses data MUST include organizationId filter
   - Check webhook handlers — they receive external data, must resolve to correct org
   - Check BullMQ workers — jobs must carry org context

3. **Audit portal endpoints**
   - Portal is customer-facing — verify it only exposes permitted data
   - Check that portal users can only see their org's feedback/features
   - Verify voting is org-scoped

4. **Create automated isolation tests** (see Plan 05 Workstream 1)

---

## Workstream 2: Webhook Security

DK-OS processes webhooks from 10 external services. Each webhook handler must:

### Audit Checklist

| Integration | Signature Verification | Replay Protection | Rate Limiting |
|------------|----------------------|-------------------|---------------|
| Clerk | SVIX signature | Timestamp check | Via Clerk |
| GitHub | HMAC-SHA256 | Delivery ID | Via GitHub |
| Stripe | HMAC-SHA256 | Idempotency key | Via Stripe |
| Linear | — | — | — |
| Jira | — | — | — |
| Slack | HMAC-SHA256 | Timestamp check | Via Slack |
| Intercom | HMAC-SHA1 | — | — |
| Atlassian | — | — | — |
| HubSpot | — | — | — |
| Zapier | — | — | — |

### Steps

1. **Verify signature validation** on all webhook handlers
2. **Add replay protection** where missing (timestamp check, deduplication)
3. **Add rate limiting** on webhook endpoints (prevent abuse)
4. **Log all webhook events** to audit trail (for compliance)
5. **Test with invalid signatures** — verify rejection

---

## Workstream 3: Agent-Mesh Security

Agent-mesh is a high-risk component — it runs arbitrary agent code and has 40+ MCP tools.

### Audit Areas

1. **Clerk JWT validation** — Verify all FastAPI endpoints require valid Clerk JWT
2. **Tool authorization** — Which MCP tools are available to which roles?
3. **Docker orchestrator** — Currently uses Docker socket mount (security risk)
   - **Mitigation:** Disable in K8s (see Plan 04 Workstream 4)
   - **Long-term:** Migrate to K8s Job API with RBAC-scoped ServiceAccount
4. **Rate limiting** — Agent execution rate limits to prevent abuse
5. **Resource limits** — Memory/CPU caps on agent executions
6. **Data access** — Agent-mesh has its own database (SQLModel) — verify it can't access main Prisma DB

---

## Workstream 4: Data Classification

### Prisma Schema Analysis (82 models)

Classify data by sensitivity:

| Classification | Examples | Controls |
|---------------|----------|----------|
| **Restricted** | API keys, webhook secrets, integration tokens | Encrypted at rest, never logged, Doppler-managed |
| **Confidential** | User emails, org names, billing info | PII handling, not in analytics, GDPR-deletable |
| **Internal** | Feature data, feedback, roadmaps | Org-scoped access only |
| **Public** | Published changelog, public portal content | No restrictions |

### Steps

1. **Audit Prisma schema** — Tag each model with data classification
2. **Verify PII is not logged** — Check `@repo/observability` log filtering
3. **Verify PII is not in analytics** — Check PostHog event properties
4. **Verify exports** — `@repo/export` (PDF, PPTX, Excel) must be org-scoped
5. **Verify file storage** — SeaweedFS files must be org-scoped (path or bucket)

---

## Workstream 5: Portal Security

The customer portal (`apps/portal`) is **public-facing** — it requires stricter security than internal apps.

### Audit Areas

1. **Authentication boundary** — What's public vs authenticated in portal?
2. **CSRF protection** — Verify portal forms are protected
3. **Rate limiting** — Public endpoints (feedback submission, voting) must be rate-limited
4. **Input validation** — All user input (feedback text, comments) validated and sanitized
5. **XSS prevention** — Rich text rendering in portal must sanitize HTML
6. **File upload** — If portal allows uploads, validate MIME types and size limits

---

## Workstream 6: Compliance Alignment

### Steps

1. **Map DK-OS to compliance controls** (SOC 2, HIPAA if applicable)
2. **Audit logging** — Verify coverage for auth events, data access, mutations, admin actions
3. **Encryption** — TLS for all external comms, encrypted DB connections
4. **Access control docs** — Document who has access to production (SSH, K8s, DB, Doppler)
5. **Integration data retention** — Define retention for data synced from GitHub, Linear, Jira, etc.

---

## Verification

- [ ] Zero cross-org data access in automated isolation tests
- [ ] All 10 webhook handlers validate signatures
- [ ] Agent-mesh has no Docker socket mount in K8s
- [ ] Prisma schema models classified by data sensitivity
- [ ] Portal endpoints rate-limited and input-validated
- [ ] PII absent from logs and analytics events
- [ ] Audit logging covers auth, data access, mutations
- [ ] Compliance control mapping documented

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Cross-org data leakage via raw Prisma | Customer trust, compliance violation | Automated isolation tests, code review guards |
| Webhook signature bypass | Integration data manipulation | Signature verification on all handlers |
| Agent-mesh code execution escape | System compromise | Disable Docker orchestrator, K8s Job API with RBAC |
| Portal XSS | Customer browser compromise | Content sanitization, CSP headers |
| PII in logs | Compliance violation | Log filtering audit, scrubbing patterns |
