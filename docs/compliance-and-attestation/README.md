# Compliance & Attestation

## Overview

Compliance management for Data Kinetic is centralized in [`dk-compliance-v2`](https://github.com/data-kinetic/dk-compliance-v2) — a unified system covering five regulatory frameworks across two legal entities, built on [CISO Assistant](https://github.com/intuitem/ciso-assistant-community) as the long-term GRC platform.

This document summarizes the compliance program and its relationship to the platform architecture documented in dk-planning. For full execution details, phase plans, and policies, see dk-compliance-v2.

## Entities & Frameworks

| Entity | Frameworks | Auditor / Assessor | Status |
|--------|-----------|-------------------|--------|
| BehaviorLabs.ai | SOC 2 Type II, HIPAA, ISO 27001 | [Sensiba](https://sensiba.com) | SOC 2 in progress; HIPAA and ISO 27001 not started |
| Data Kinetic Corporation | NIST 800-171 rev3, CMMC Level 2 | C3PAO (TBD) | Not started |

### Cross-Framework Mapping

CISO Assistant maps controls across frameworks via NIST OLIR, reducing duplicated effort by ~40%:

- ~40 SOC 2 controls satisfy NIST 800-171 requirements
- ~30 SOC 2 controls carry over to HIPAA safeguards
- ~60% of ISO 27001 Annex A controls are covered by SOC 2 + HIPAA work
- CMMC Level 2 has a 1:1 mapping to NIST 800-171 (110 practices)

## Platform

### CISO Assistant (Long-Term)

Self-hosted, open-source GRC platform supporting 100+ compliance frameworks. Deployed via [Docker](https://docs.docker.com/) Compose with [PostgreSQL](https://www.postgresql.org/docs/) 16, Caddy reverse proxy, and secrets from [Doppler](https://docs.doppler.com/) (project: `60-dk-compliance-v2`).

| Component | Technology |
|-----------|-----------|
| Backend | Django (Python) |
| Frontend | React |
| Database | PostgreSQL 16 |
| Reverse Proxy | Caddy 2 |
| Secrets | Doppler (`dev`, `stg`, `prd` configs) |

### Drata (Transitional Bridge)

[Drata](https://drata.com) maintains current SOC 2 progress through Sensiba audit completion. After audit, Drata archives and CISO Assistant becomes the sole platform. Migration scripts in `dk-compliance-v2/scripts/migration/` handle export/import with a 10-point parity check.

## Phase Plan

| Phase | Scope | Timeline | Status |
|-------|-------|----------|--------|
| 00 — Program Mobilization | Governance, ownership matrix, secrets to Doppler | Complete | Done |
| 01 — Platform Provisioning | CISO Assistant running, 4 frameworks loaded, backup/restore validated | Complete | Done |
| 02 — Migration & Consolidation | Drata → CISO Assistant migration (298 controls), policy documents | Current | In progress |
| 03 — SOC 2 Type II | Complete remaining controls, Sensiba audit | Months 1–4 | Not started |
| 04 — NIST 800-171 + CMMC L2 | 110 practices, SSP documentation, C3PAO prep | Months 2–5 | Not started |
| 05 — HIPAA | ePHI risk analysis, BAA management, safeguards | Months 4–6 | Not started |
| 06 — ISO 27001 | ISMS scope, 93 Annex A controls, internal audit | Months 6–10 | Not started |
| 07 — Operations & Maintenance | Weekly reviews, evidence age management, audit coordination | Ongoing | Not started |

## Ownership

| Workstream | Owner | Backup |
|-----------|-------|--------|
| CISO Assistant deployment | Lance / Mandar | Nick |
| Drata (bridge) | Raq | Lance |
| BehaviorLabs SOC 2 controls | Lance | Raq |
| BehaviorLabs HIPAA | Raq | Lance |
| BehaviorLabs ISO 27001 | Raq + Lance | Nick |
| DK NIST 800-171 / CMMC | Lance | Nick |
| Policies | Raq | Nick |
| Auditor relationship (Sensiba) | Raq | Nick |

## Connection to Platform Architecture

The platform infrastructure documented in dk-planning provides the technical controls that satisfy compliance requirements:

| Compliance Requirement | Platform Control | dk-planning Document |
|----------------------|-----------------|---------------------|
| Access control & RBAC | ArgoCD AppProjects, namespace isolation | [Security & Compliance](../security-and-compliance.md) |
| Secrets management | Doppler Operator, no secrets in Git | [Secrets Management](../secrets-management.md) |
| Encryption at rest | PostgreSQL, SeaweedFS, Redis encryption | [Infrastructure](../infrastructure.md) |
| Audit logging | K8s audit logs, GitHub audit log, Grafana | [Security & Compliance](../security-and-compliance.md) |
| Monitoring & alerting | LGTM stack, 26 dashboards, 26 alert rules | [Observability](../observability.md) |
| Incident response | On-call escalation, SLO burn-rate alerting | [Incident Management](../incident-management.md) |
| Supply chain security | SBOM, provenance attestation, image scanning | [CI/CD Pipelines](../ci-cd-pipelines.md) |
| Backup & disaster recovery | PostgreSQL WAL, SeaweedFS mirror, documented runbook | [Disaster Recovery](../disaster-recovery.md) |
| Change management | GitOps, PR review, standards compliance CI | [GitOps & CD](../gitops-and-cd.md), [Standards Compliance](../standards-compliance.md) |
| Policy enforcement (planned) | Kyverno admission control | [Security & Compliance](../security-and-compliance.md) |

## Policy Documents

18 security policies are maintained in `dk-compliance-v2/policies/` as version-controlled markdown:

- Information Security Policy
- Access Control Policy
- Incident Response Plan
- Data Classification Policy
- Encryption Policy
- Vendor Management Policy
- Acceptable Use Policy
- Business Continuity & Disaster Recovery
- Change Management Policy
- Risk Management Policy
- Physical Security Policy
- Human Resources Security
- Asset Management Policy
- Network Security Policy
- Logging & Monitoring Policy
- Mobile Device & Remote Work Policy
- Secure Development Lifecycle Policy
- Privacy Policy

## Key Resources

| Resource | URL |
|---------|-----|
| dk-compliance-v2 repo | https://github.com/data-kinetic/dk-compliance-v2 |
| CISO Assistant (upstream) | https://github.com/intuitem/ciso-assistant-community |
| CISO Assistant docs | https://intuitem.gitbook.io/ciso-assistant |
| Drata dashboard | https://app.drata.com |
| NIST 800-171 rev3 | https://csrc.nist.gov/publications/detail/sp/800-171/rev-3/final |
| CMMC portal | https://www.acq.osd.mil/cmmc/ |

## Related Documentation

- [Security & Compliance](../security-and-compliance.md) — platform security posture, RBAC, policy enforcement
- [Secrets Management](../secrets-management.md) — Doppler architecture
- [Disaster Recovery](../disaster-recovery.md) — backup strategy, RTO/RPO
- [Incident Management](../incident-management.md) — on-call, SLOs
- [Infrastructure](../infrastructure.md) — data stores, encryption, network isolation
