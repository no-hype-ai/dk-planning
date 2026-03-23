# Issue Governance Extraction

## Context
behavior-labs-ai has a comprehensive issue governance system (5 enforcement scripts, 6 weekly reports) that should be available to all product repos. The doc-gap scanner for dk-planning is also planned but not implemented. Label taxonomy enforcement is needed org-wide.

## Scope
- Extract governance scripts into reusable org-level workflows
- Deploy doc-gap scanner for dk-planning
- Implement cross-repo label enforcement via Platform API
- Connect Grafana alerts to governed issues (alert-to-issue bridge)

## Dependencies
- Plan 01 (Platform API) — label sync endpoints
- Plan 02 (SLO & Incident Management) — alert-to-issue bridge

## Existing Work
- behavior-labs-ai: scripts/issues/ (5 enforcement, 6 report scripts, shared policy lib)
- dk-planning docs: issue-governance.md (extraction plan, configuration model)
- dk-planning: labels already created for dk-planning repo (from earlier work)

## Implementation Steps

### Phase 1: Extract to Org-Level Workflows
1. Create data-kinetic/.github/.github/workflows/issue-governance.yaml:
   - Inputs: enforcement types, SLA, escalation roles, report schedule
   - Reusable by any repo in the org
2. Extract scripts/issues/lib/ into a shared npm package or inline in the workflow:
   - policy.ts, github-issues.ts, risk-policy.ts, regression-closure-policy.ts, etc.
3. Make per-repo settings configurable via .dk-governance.yaml:
   - SLA duration (default 7d), escalation roles, exception max, risk weights
   - Stub governance (opt-in/out), report schedule
4. Deploy to behavior-labs-ai first (replace local scripts with shared workflow call)
5. Roll out to other repos progressively

### Phase 2: Doc-Gap Scanner
6. Create scheduled GitHub Actions workflow in dk-planning:
   - Scans all docs/*.md for: TODO markers, empty sections, TBD cells, unchecked gaps
   - Creates issues with labels: doc-gap, priority/p2-p4, source/doc-scanner
   - Deduplication: sha256(file_path + gap_type + normalized_content)
   - Reopens closed issues if gap persists
7. Run weekly (Monday 8 AM UTC)
8. Issues flow through standard governance pipeline

### Phase 3: Cross-Repo Label Enforcement
9. Implement Platform API /dk/v1/labels/sync and /dk/v1/labels/audit
10. Define label taxonomy as YAML in dk-cli (source of truth):
    - type/, priority/, status/, risk/ prefixes (org-wide)
    - area/ or surface/ (repo-specific, configurable)
11. `dk labels sync --org --apply` creates/updates labels across all repos
12. Weekly audit report: which repos are compliant, which have extra/missing labels

### Phase 4: Alert-to-Issue Integration
13. Configure Grafana webhook contact point to trigger GitHub Action
14. GitHub Action creates issue with:
    - Error signature, affected service/namespace
    - Dashboard link, LogQL query, trace ID
    - Labels: type/bug, priority/ (from alert severity), status/triage, area/
    - Deduplication by hash (alert name + service + namespace)
15. Issue enters governance pipeline automatically

## dk-alchemy Changes
- None directly (governance lives in org-level workflows and product repos)

## dk-org Changes (data-kinetic/.github)
- CREATE: .github/workflows/issue-governance.yaml
- CREATE: .github/workflows/alert-to-issue.yaml
- CREATE: governance/ (shared policy library)

## dk-planning Changes
- CREATE: .github/workflows/doc-gap-scanner.yaml

## Verification
- behavior-labs-ai governance runs via shared workflow (no local scripts)
- Doc-gap scanner creates issues for known gaps in dk-planning docs
- `dk labels sync --org` reports compliance across all repos
- Grafana alert creates properly labeled GitHub issue with dashboard links
- Weekly governance reports generate as expected

## Options/Recommendations
**Extraction approach:**
- **Option A (Recommended): Org-level reusable workflows** — workflow in data-kinetic/.github, repos call it. Simplest adoption, version-controlled.
- **Option B: Published GitHub Action** — data-kinetic/issue-governance-action@v1. More portable but requires maintaining a separate Action repo.
**Recommendation:** Option A. Reusable workflows are simpler to maintain and update. The shared standards workflow uses the same pattern.
