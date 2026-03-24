# Plan 06: Feature Roadmap

## Goal

Track active development workstreams, app-switcher expansion, and product feature priorities for DK-OS. This is a **living document** updated as development progresses.

## Product Architecture

DK-OS is organized as a multi-app business operating system with an **app-switcher pattern** enabling multiple business contexts within one UI.

### App Registry (`apps/app/lib/apps.ts`)

| App | Route Prefix | Version | Status |
|-----|-------------|---------|--------|
| Home | `/` | 1.1.0 | Active — dashboard, activity, insights, tasks, notifications |
| Product & Engineering | `/product` | 1.1.0 | Active — feedback, features, initiatives, roadmap, releases, changelog, repos, deployments |
| Marketing | `/marketing` | 1.1.0 | Active — blog, content pages, analytics, HubSpot dashboards, email campaigns |
| Agents | `/agents` | — | Scaffolded — AI agent registry, executions, work reports |
| Future Apps (5-13) | — | — | Planned |

## Completed Specs

| Spec | Title | Impact |
|------|-------|--------|
| 001 | Eververse Self-Hosted Migration | Enabled DK-OS — migrated from Eververse SaaS to self-hosted |
| 002 | Baseline Remediation | Quality improvements, code cleanup |
| 003 | Local Dev Stabilization | Docker Compose local environment working |
| 004 | Megatron CI/CD Deploy | GHCR builds, staging/prod deploy pipeline |
| 005 | GitHub Integration Elevate | Repos, PRs, commits, branches, actions, deployments |
| 006 | GitHub Workflow Enhancements | 19 user stories — branch tracking, PR linking, deployment tracking |
| 007 | Website CMS Migration | Blog, corporate pages, marketing analytics, HubSpot |

## Recent Development Activity

> **Snapshot: 2026-03-24**

| Date | Feature | Key Changes |
|------|---------|-------------|
| Mar 24 | Home + Agents apps | New app-switcher apps, Product routes moved to `/product` |
| Mar 22 | Website CMS | Marketing app with blog CRUD, content pages, HubSpot |
| Mar 21 | GitHub enhancements | 19 user stories — branch tracking, PR linking |
| Mar 20 | Clerk webhooks | Auth integration, editor fixes, DK-OS rebrand |
| Mar 14-20 | Supabase elimination | Migrated to Clerk, S3, Redis presence, Socket.io |

## Active / Open Issues

| Issue | Title | Priority |
|-------|-------|----------|
| #67 | Website CMS migration | Recently merged |
| #66 | Marketing — Competitor-Targeting Outreach Campaign | Open |
| #65 | Migrate Product & Engineering to `/product/` (Phase 2) | Open |
| #64 | GitHub Workflow Enhancements | Recently merged |
| #63 | Verify compound status automation rules | Open |
| #62 | Verify feature-to-PR auto-linking | Open |
| #45 | Use Docker build secrets for SENTRY_AUTH_TOKEN | Open |
| #21 | Verify editor upload round-trip | Open |

## Upcoming Initiatives

| Initiative | Description | Dependencies |
|-----------|-------------|-------------|
| **Agents App Activation** | Activate agent-mesh UI, executions, work reports | Agent-mesh K8s deploy (Plan 04) |
| **App-Switcher Expansion** | Add Sales, Support, Finance, HR apps | Product roadmap |
| **Intelligence Core** | AI-powered insights across all apps | LiteLLM integration, agent-mesh |
| **Portal Enhancement** | Customer voting, roadmap visibility, changelog widget | None |
| **Mobile Responsive** | Progressive web app capabilities | None |

## Platform Dependencies

| Feature Need | Platform Dependency | Repo | Status |
|-------------|-------------------|------|--------|
| LLM inference | dk-litellm HA VM | dk-litellm | Operational |
| PostgreSQL | CloudNativePG (future) or Megatron VM | dk-alchemy / Megatron | Operational on VM |
| Redis | dk-alchemy shared Redis | dk-alchemy | Operational |
| File storage | SeaweedFS (current on VM, dk-alchemy post-migration) | Megatron / dk-alchemy | Operational on VM |
| Error tracking | Grafana LGTM stack | dk-alchemy | Available (dual-write with Sentry) |
| Product analytics | PostHog (SaaS) | — | Operational |

## Integration Ecosystem

DK-OS integrates with 10+ external services — each requires ongoing maintenance:

| Integration | Package | Status |
|------------|---------|--------|
| GitHub | `@repo/github` | Active — repos, PRs, commits, branches, actions, deployments |
| Linear | `@repo/linear` | Active — issue sync, status mapping |
| Jira/Atlassian | `@repo/atlassian` | Active — openapi-fetch client |
| Slack | Built-in | Active — notifications, webhook handler |
| Intercom | Built-in | Active — feedback ingestion |
| Stripe | `@repo/payments` | Active — subscriptions, billing |
| HubSpot | `@repo/hubspot` | Active — CRM dashboards, contacts |
| Clerk | `@repo/backend` | Active — auth, org management |
| Canny | `@repo/canny` | Migration source — data import |
| Productboard | `@repo/productboard` | Migration source — data import |

## Metrics

| Metric | Source | Target |
|--------|--------|--------|
| Open P0/P1 issues | GitHub Issues | < 3 P0, < 10 P1 |
| Active apps | App registry | 4+ active |
| Integration health | Webhook success rate | > 99% |
| Specs completed | specs/ directory | Increasing |
| Prisma model count | schema.prisma | Track growth (currently 82) |
