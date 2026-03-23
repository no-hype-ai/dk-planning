# Product Analytics

## Overview

**[PostHog](https://posthog.com/docs)** handles user-facing product analytics and feature flags across Data Kinetic products. This is intentionally separate from infrastructure observability ([Grafana](https://grafana.com/docs/grafana/latest/)/LGTM) — PostHog answers "what are users doing?" while the Grafana stack answers "is the system healthy?"

PostHog is a good fit and should be retained. This document captures the current integration, conventions, and management best practices.

## Current Integration (behavior-labs-ai)

### Package: `@repo/analytics`

| File | Purpose |
|------|---------|
| `index.ts` | Re-exports `posthog` as `analytics` from `posthog-js` |
| `instrumentation-client.ts` | `initializeAnalytics()` — `posthog.init()` with `person_profiles: "identified_only"`, `capture_pageview: true`, `capture_pageleave: true`, `autocapture: true` |
| `server.ts` | Server-side PostHog client (`flushAt: 1, flushInterval: 0` for serverless) |
| `identify.ts` | `useIdentifyUser()` hook — identifies via Clerk, sets PostHog group for organization |
| `provider.tsx` | `AnalyticsProvider` — wraps children, conditionally includes Google Analytics |
| `events.ts` | 35+ client-side event definitions |
| `server-events.ts` | Server-side event definitions |
| `keys.ts` | Env var validation |

### Env Vars

| Variable | Format | Purpose |
|----------|--------|---------|
| `NEXT_PUBLIC_POSTHOG_KEY` | `phc_*` | PostHog project API key |
| `NEXT_PUBLIC_POSTHOG_HOST` | URL | PostHog instance URL |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | `G-*` | Google Analytics (optional) |

## Event Taxonomy

### Client-Side Events (35+)

| Category | Events |
|----------|--------|
| **Onboarding** | `onboarding_started`, `onboarding_step_completed`, `onboarding_completed`, `molecule_enrichment_started`, `molecule_enrichment_completed` |
| **Projects** | `project_created`, `project_executed`, `project_archived`, `project_cloned` |
| **Evaluations** | `concept_uploaded`, `evaluation_started`, `evaluation_completed`, `evaluation_exported` |
| **Compliance** | `compliance_review_created`, `compliance_decision_made`, `compliance_workflow_advanced` |
| **Patient Journeys** | `journey_created`, `journey_exported` |
| **Competitive Intel** | `ci_project_created`, `competitor_added`, `digest_triggered`, `swot_created`, `scenario_created` |
| **Billing** | `billing_page_viewed`, `payment_method_added`, `subscription_reactivated` |
| **Knowledge** | `knowledge_asset_uploaded` |
| **Personas** | `persona_created`, `personas_imported` |
| **Search & Export** | `search_performed`, `export_generated` |
| **Admin** | `admin_feature_flag_toggled`, `admin_data_source_created`, `admin_integration_run_started`, `admin_entity_resolved`, `admin_molecule_enriched`, `admin_persona_template_created`, `admin_org_managed` |

### Server-Side Events

| Event | Purpose |
|-------|---------|
| `payment_received` | Revenue tracking |
| `payment_failed` | Payment failure tracking |
| `subscription_changed` | Plan changes |
| `evaluation_completed_server` | Reliable evaluation completion (not client-dependent) |
| `background_job_failed` | Job failure tracking |

## Feature Flags (PostHog-Backed)

Uses the `flags` npm package (v4.0.2) with PostHog as evaluation backend.

### Defined Flags

| Flag | Domain |
|------|--------|
| `showBetaFeature` | General |
| `messaging.enabled` | Messaging |
| `messaging.positioning.generation` | Messaging |
| `messaging.messages.generation` | Messaging |
| `messaging.workshops.enabled` | Messaging |
| `messaging.compliance.enabled` | Messaging |
| `messaging.differentiation.enabled` | Messaging |
| `messaging.export.enabled` | Messaging |
| `messaging.taglines.enabled` | Messaging |
| `patientJourney.enabled` | Patient Journey |
| `patientJourney.extraction.enabled` | Patient Journey |
| `patientJourney.archetypes.enabled` | Patient Journey |
| `patientJourney.visualizations.enabled` | Patient Journey |
| `patientJourney.export.enabled` | Patient Journey |
| `data-integration` | Data Integration |

### Flags API

`access.ts` implements the Vercel Flags API pattern — accepts a request, verifies access via `FLAGS_SECRET`, returns flag definitions as JSON. Toolbar components are currently stubs.

## Best Practices

### What's Working Well

| Practice | Details |
|----------|---------|
| **Identified-only person profiles** | Avoids anonymous event bloat |
| **Organization-level grouping** | Enables per-org analytics via PostHog groups |
| **Server-side for billing events** | Ensures reliability for revenue-critical events |
| **Autocapture enabled** | Captures clicks, form submissions without explicit instrumentation |

### Recommendations

| Area | Current | Recommended |
|------|---------|-------------|
| **Event naming** | `snake_case` with mixed prefixes | Standardize: `<domain>.<action>` (e.g., `evaluation.started`, `billing.page_viewed`) across all repos |
| **Flag lifecycle** | No cleanup process | Stale flag audit: flags at 100% for >30 days should be removed from code |
| **Environment separation** | Single PostHog project | Use separate PostHog projects for staging/prod, or add `environment` property to all events |
| **Data retention** | PostHog default | Set explicit retention policies per event type |
| **Cross-repo consistency** | behavior-labs-ai only | Create `@datakinetic/analytics` shared package with standard event helpers and naming |
| **Event documentation** | Inline in `events.ts` | Maintain a PostHog data dictionary (event name, properties, when fired, owner) |

## PostHog vs. Grafana Stack — Boundary

Keep these concerns **cleanly separated**:

| Question | Tool | Why |
|----------|------|-----|
| "What features are users using?" | PostHog | Product-level, user-identified events |
| "How many errors is the API throwing?" | Grafana ([Mimir](https://grafana.com/docs/mimir/latest/)/[Loki](https://grafana.com/docs/loki/latest/)) | Infrastructure-level, system metrics |
| "Should we show this feature to org X?" | PostHog (feature flags) | User/org targeting |
| "Is the API healthy?" | Grafana (probes, alerts) | System health |
| "What's the conversion funnel?" | PostHog | User behavior analysis |
| "What's the P95 latency?" | Grafana (Mimir) | Performance metrics |

**Do not** use PostHog for system health monitoring or Grafana for user behavior analytics. The overlap zone (e.g., "feature usage dashboards" in Grafana) should source data from PostHog exports or [OTel](https://opentelemetry.io/docs/) custom metrics, not duplicate instrumentation.

## Extending to Other Products

When onboarding new product repos:

1. Add `@repo/analytics` (or future `@datakinetic/analytics`) as a dependency
2. Configure `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` in [Doppler](https://docs.doppler.com/)
3. Wrap app root in `AnalyticsProvider`
4. Call `useIdentifyUser()` after authentication
5. Define product-specific events following the `<domain>.<action>` naming convention
6. Set up feature flags in PostHog dashboard with matching flag keys in code

## Related Documentation

- [Application Instrumentation](application-instrumentation.md) — OTel (infra observability, separate from PostHog)
- [Observability](observability.md) — Grafana stack (system health)
- [Onboarding](onboarding.md) — analytics setup checklist
