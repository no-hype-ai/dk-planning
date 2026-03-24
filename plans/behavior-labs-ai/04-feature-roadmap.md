# Plan 04: Feature Roadmap

## Goal

Track active development workstreams, stage-based progression, and product feature priorities for the Drug Development Intelligence Platform. This is a **living document** that reflects current development state.

## Product Architecture

Two interconnected products:

- **Pharma-Predictor** — ML prediction engine for drug properties (ADMET: 22 properties, DTI: 8K targets, Adverse Effects: 500+ AEs), safety, trial outcomes, and drug optimization
- **Pharma-Bench** — Multi-agentic dataset creation, LLM training/evaluation, competitive intelligence, and ICH-compliant experiment planning

## Stage-Based Development

Development follows a stage-based progression defined in `PRODUCT_VISION.md`. Each stage has a corresponding spec in `specs/`.

| Stage | Name | Spec | Status |
|-------|------|------|--------|
| 0 | Foundation | `011-stage0-foundation` | Complete — auth, storage, observability, base scaffold |
| 1 | Concept Evaluation | `012-stage1-concept-eval` | Complete — evaluation pipeline, models, AI prompts |
| 2 | Synthetic Personas | `013-stage2-synthetic-personas` | Complete — persona generation and management |
| 3 | Competitive Intelligence | `014-stage3-competitive-intel` | Complete — research, data sources, aggregation |
| 4 | Messaging & Positioning | `015-stage4-messaging-positioning` | Complete — messaging framework |
| 5 | Patient Journey | `016-stage5-patient-journey` | Complete — patient journey framework |
| 6 | Brand Naming | `017-stage6-brand-naming` | Complete — brand naming pipeline |
| 7 | Compliance/MLR | `018-stage7-compliance-mlr` | Complete — compliance checking, MLR review |
| 8 | Platform Integration | `019-stage8-platform-integration` | In Progress — cross-feature integration |

## Active Workstreams

> **Snapshot: 2026-03-24** — derived from git history and GitHub issues

### Recently Completed

| Feature | Spec | Key Changes |
|---------|------|-------------|
| 038 Knowledge RAG Chat | `038-knowledge-rag-chat` | LightRAG integration, knowledge review chat interface |
| 039 Staging Bug Sweep | `039-staging-bug-sweep` | Systematic bug fixes across staging environment |
| 037 Data Integration | `037-data-integration` | Data sources, entity resolution |
| 900 Telemetry Updates | `900-telemetry-updates` | Sentry + PostHog telemetry integration (#706) |
| 638 S3 Storage | `638-minios3-storage-integration` | Fixed fake URLs, wired up actual uploads/cleanup |

### Active / Open

| Issue | Title | Priority |
|-------|-------|----------|
| #764 | Visual Verification & QA Sweep | Active |
| #763 | Penpot MCP Infrastructure Deployment | Active |
| #762 | Apply Layout Patterns to Existing App Pages | Active |
| #760 | Design System Upgrade — Remaining Tasks | Active |
| #739 | Deploy Qwen3-Embedding on dk-litellm | Blocker for 038 |
| #595 | Intelligence Core Phase 3 | In Review (spec `595-build-spec-for-intelligence-core-phase-3`) |
| #596 | Roadmap Tracking (Epic) | Ongoing |

### Upcoming / Planned

| Initiative | Description | Dependencies |
|-----------|-------------|-------------|
| Intelligence Core Phase 3 | Next major feature implementation per spec #595 | Spec approval |
| Design System Completion | Finish #760, #762, #764 visual polish | None |
| LightRAG Production | Productionize knowledge RAG infrastructure | dk-litellm model deployments |
| Admin App Enhancement | Extend admin dashboard capabilities | None |

## Platform Dependencies

Several behavior-labs-ai features depend on platform infrastructure managed in sibling repos:

| Feature Need | Platform Dependency | Repo | Status |
|-------------|-------------------|------|--------|
| LLM inference | dk-litellm HA VM at llm.behaviorlabs.ai | dk-litellm | Operational |
| Qwen3-Embedding model | dk-litellm model deployment (#739) | dk-litellm | Pending |
| PostgreSQL | CloudNativePG in dk-alchemy | dk-alchemy | Operational |
| Redis (BullMQ) | Redis in dk-alchemy | dk-alchemy | Operational |
| SeaweedFS (file storage) | SeaweedFS (S3-compatible) in dk-alchemy | dk-alchemy | Operational |
| OpenSearch | OpenSearch in dk-alchemy | dk-alchemy | Operational |
| Error tracking | Grafana LGTM stack | dk-alchemy | Operational (dual-write with Sentry) |
| Product analytics | PostHog (external SaaS) | — | Operational |

## Issue Governance

behavior-labs-ai has the most comprehensive issue governance system in the org:

| Workflow | Purpose | File |
|----------|---------|------|
| Regression Closure Gates | Prevent regressions from being closed without evidence | `issue-regression-closure-gates-enforcement.yaml` |
| Triage Evidence | Require evidence on triaged issues | `issue-triage-evidence-enforcement.yaml` |
| Risk Prioritization | Auto-sync risk priority labels | `issue-risk-prioritization-sync.yaml` |
| Stub Governance | Track and enforce stub/placeholder cleanup | `issue-stub-governance.yaml` |
| Status Traceability | Enforce status transitions | `issue-status-traceability-enforcement.yaml` |
| Weekly Reports | P1 top-10, regression, triage, stub reports | 5 report workflows |

**Target:** Extract to org-level shared workflows (see [dk-alchemy/09](../dk-alchemy/09-governance-extraction.md) and [Plan 01](01-platform-integration.md) Workstream 3).

## Metrics

Track these to measure feature health:

| Metric | Source | Target |
|--------|--------|--------|
| Open P0/P1 issues | GitHub Issues | < 5 P0, < 15 P1 |
| Regression rate | Governance workflows | < 2 per sprint |
| Stub count | Stub governance | Decreasing trend |
| Feature completion (stages) | This document | Stage 8 complete |
| Active feature branches | Git | < 3 concurrent |

## Updating This Document

This is a living document. Update when:
- A feature branch merges to main
- A new major feature starts development
- GitHub milestones change
- Platform dependencies change status
