# Plan 06: Security & Compliance

## Goal

Harden behavior-labs-ai security posture and align with compliance requirements from dk-compliance-v2. As a pharmaceutical SaaS platform handling drug development data, security and compliance are critical.

## Current State

| Area | Current State |
|------|--------------|
| **Authentication** | Clerk (@clerk/nextjs 7.x, @clerk/backend 3.x), multi-org RBAC |
| **Authorization** | Role-based via Clerk, org ID resolution pattern documented |
| **Secrets** | Doppler (no .env files), project: `behaviorlabs-applications` with dev/stg/prd |
| **API Security** | `@repo/api-middleware` for auth wrappers, validation (Zod) |
| **Rate Limiting** | `@repo/rate-limit` package exists |
| **Network** | Traefik ingress, infrastructure namespace NetworkPolicy only |
| **Dependencies** | Dependabot active, security overrides in package.json |
| **Compliance** | dk-compliance-v2 manages SOC 2, HIPAA, ISO 27001, NIST 800-171, CMMC L2 |
| **Kyverno** | Audit mode in dk-alchemy (6/7 policies) — no enforcement yet |

## Dependencies

| Dependency | Plan | Blocking |
|-----------|------|----------|
| Kyverno enforcement on staging | [dk-alchemy/03](../dk-alchemy/03-security-hardening.md) | NetworkPolicy enforcement |
| Compliance framework operational | dk-compliance-v2 | Control mapping |
| Secrets rotation alerts | [dk-alchemy/07](../dk-alchemy/07-secrets-lifecycle.md) | Rotation automation |

---

## Workstream 1: Clerk Auth Hardening

### Steps

1. **Audit current auth patterns**
   - Map all API routes to their auth requirements (public, authenticated, role-specific)
   - Verify `getAuthenticatedOrg()` helper is used consistently (not raw Clerk org ID)
   - Check for auth bypass paths (webhook endpoints, health checks — should be intentional)

2. **Strengthen RBAC**
   - Document role definitions and permissions matrix
   - Verify role-based access in:
     - Next.js middleware (page-level protection)
     - NestJS guards (endpoint-level protection)
     - Component-level conditional rendering
   - Add missing guards for admin-only operations

3. **Session management**
   - Verify session timeout configuration
   - Audit session storage (Clerk handles this, but verify behavior)
   - Ensure logout clears all session state

4. **Multi-org isolation**
   - Verify all database queries include org ID filter
   - Check for cross-org data leakage in shared endpoints
   - Verify BullMQ jobs include org context
   - Test: create data in Org A, verify Org B cannot access

### Files

```
apps/app/middleware.ts
apps/admin/middleware.ts
apps/api/src/auth/
packages/auth/
packages/api-middleware/
```

---

## Workstream 2: Data Classification

### Steps

1. **Audit Prisma schema for sensitive data**
   - Identify PII fields (names, emails, roles)
   - Identify PHI fields (drug data, clinical references — if any patient data)
   - Identify business-sensitive fields (API keys, org configurations)
   - Classify fields: Public, Internal, Confidential, Restricted

2. **Apply data handling controls**
   - Ensure PII is not logged (check `@repo/observability` log filtering)
   - Verify PII is not sent to analytics (PostHog event properties)
   - Verify exports (`@repo/export`) don't leak cross-org data
   - Check SeaweedFS/S3 storage — files should be org-scoped

3. **Document data retention policies**
   - Define retention periods by data class
   - Plan for data deletion (GDPR-style right to delete, even if not EU-regulated)
   - Document backup retention (aligned with dk-clusters/03)

### Files

```
packages/database/prisma/schema.prisma
packages/observability/src/log.ts (verify PII filtering)
packages/analytics/src/ (verify event sanitization)
packages/export/src/
```

---

## Workstream 3: API Security

### Steps

1. **Rate limiting audit**
   - Verify `@repo/rate-limit` is applied to:
     - Public endpoints (auth, webhooks)
     - AI endpoints (expensive LLM calls)
     - Export endpoints (resource-intensive)
   - Tune rate limits per endpoint class
   - Implement per-org rate limits (not just per-IP)

2. **Input validation audit**
   - Verify all API endpoints use Zod validation
   - Check for injection vectors (SQL via Prisma is safe, but check raw queries)
   - Verify file upload validation (MIME type, size limits) in SeaweedFS integration
   - Check WebSocket message validation

3. **CORS configuration**
   - Audit CORS settings in NestJS and Next.js
   - Verify only allowed origins (behaviorlabs.ai domains)
   - Check WebSocket CORS

4. **Security headers**
   - Verify CSP (Content Security Policy) in Next.js config
   - Verify HSTS, X-Frame-Options, X-Content-Type-Options
   - Check for sensitive data in response headers

### Files

```
apps/api/src/main.ts (CORS, security middleware)
apps/app/next.config.ts (headers, CSP)
apps/admin/next.config.ts
packages/rate-limit/
packages/api-middleware/
```

---

## Workstream 4: Compliance Alignment

### Steps

1. **Map behavior-labs-ai to compliance controls**
   - SOC 2 Type II: Access control, change management, monitoring, incident response
   - HIPAA (if applicable): PHI handling, access audit, encryption at rest/in transit
   - Document which controls behavior-labs-ai satisfies vs platform-level controls

2. **Audit logging**
   - Verify audit log coverage for:
     - User authentication events (Clerk webhooks)
     - Data access events (read of sensitive data)
     - Data modification events (create, update, delete)
     - Admin actions
   - Ensure audit logs are immutable and retained per policy
   - Verify logs flow to Grafana Loki (via OTel)

3. **Encryption**
   - Verify TLS for all external communication
   - Verify database connection uses TLS
   - Check SeaweedFS/S3 encryption at rest
   - Check for any unencrypted data channels

4. **Access control documentation**
   - Document who has access to production (SSH, K8s, database, Doppler)
   - Verify principle of least privilege
   - Document emergency access procedures

---

## Workstream 5: Dependency Security

### Steps

1. **Audit package.json overrides**
   - Review `pnpm.overrides` section for security patches
   - Verify each override is still needed (upstream fix may be available)
   - Remove stale overrides

2. **Dependency vulnerability scan**
   - Run `pnpm audit` and address critical/high vulnerabilities
   - Review Dependabot/Renovate alerts
   - Establish SLA: critical vulns patched within 7 days, high within 30 days

3. **Supply chain security**
   - Verify lock file integrity (`pnpm-lock.yaml`)
   - Consider enabling Sigstore/Cosign verification for container images (aligns with dk-alchemy/03)
   - Verify GHCR image provenance

### Files

```
package.json (overrides section)
pnpm-lock.yaml
Dockerfile (base image versions)
```

---

## Verification

- [ ] All API routes have documented auth requirements
- [ ] Multi-org data isolation verified (cross-org test)
- [ ] Prisma schema fields classified by sensitivity
- [ ] PII not present in logs or analytics events
- [ ] Rate limiting applied to all public and expensive endpoints
- [ ] Zod validation on all API endpoints
- [ ] CORS configured for allowed origins only
- [ ] Audit logging covers auth, data access, modifications
- [ ] No critical/high dependency vulnerabilities open > SLA
- [ ] Compliance control mapping documented

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Cross-org data leakage | Compliance violation, customer trust | Automated multi-org isolation tests |
| PII in logs/analytics | Compliance violation | Log filtering audit, PostHog event sanitization |
| Unpatched dependency vuln | Security breach | SLA-based patching, automated scanning |
| Auth bypass on new endpoint | Unauthorized access | Auth middleware applied at framework level (not per-route) |
