# Research: Preview Stack Validation & Migration

**Date**: 2026-03-25
**Feature**: `001-preview-stack-validation`

## Research Findings

### 1. Platform API Preview Code Status

**Decision**: The preview API in dk-alchemy is fully implemented and requires E2E testing, not code changes (with exceptions noted below).

**Rationale**: `previews.py` (415 lines) implements all 7 endpoints: create, list, get, delete, extend TTL, logs, health. SSH-based remote execution via asyncssh, NPM proxy integration, metadata persistence, name sanitization, TTL enforcement, and max-active limits are all coded.

**Exceptions requiring code changes**:
- **Port allocation**: The API does not currently implement dynamic port allocation from the 10000-10999 range. It uses the port from the compose file directly. This needs to be added to prevent collisions when multiple previews run simultaneously.
- **GitHub App auth**: `config.py` already defines `DK_GITHUB_APP_ID` and `DK_GITHUB_APP_PRIVATE_KEY` fields, but `webhooks.py` uses `DK_GITHUB_PAT` for PR comment posting. This needs to be updated to use the dk-alchemy GitHub App installation tokens instead.

**Alternatives considered**: Rewriting the preview API was unnecessary — the existing code is well-structured and handles the core lifecycle correctly.

---

### 2. Webhook Handler Status

**Decision**: The webhook handler is fully implemented for PR preview automation. Promotion deployment logic is stubbed and out of scope for this feature.

**Rationale**: `webhooks.py` (271 lines) handles `pull_request.opened`, `pull_request.synchronize`, and `pull_request.closed` events correctly — auto-creating previews, posting PR comments, and tearing down on close. HMAC-SHA256 signature validation is implemented.

**Stubbed areas (out of scope)**: The `_handle_issues` method logs approval events but does not trigger actual ArgoCD/kustomize deployments. This is promotion pipeline work, explicitly out of scope per the spec.

---

### 3. dk-cli Status

**Decision**: dk-cli preview commands are fully implemented and require E2E testing only.

**Rationale**: `preview.ts` (228 lines) implements `up`, `down`, `list`, `logs` with auto-detection of repo/branch from git context, DNS-safe name sanitization, and formatted table output. `promote.ts` (268 lines) implements CLI-side promotion but server-side deployment is stubbed (out of scope).

---

### 4. Drift Detection

**Decision**: Drift detection must be built from scratch — no existing code.

**Rationale**: No drift detection, reconciliation, or state comparison code exists anywhere in dk-alchemy. The Platform API tracks metadata in `.preview-meta.json` but never compares it against actual container state or committed repo files.

**Implementation approach**:
- A script (runnable via cron and on-demand via CLI) that for each preview project:
  1. Fetches the `docker-compose.preview.yaml` from the GitHub repo (via dk-alchemy app)
  2. Reads the deployed file from VM101 (via SSH)
  3. Diffs the two and reports divergence
  4. Optionally checks running container state against metadata
- Daily cron on the Platform API pod or VM101
- On-demand via `dk preview drift` CLI command calling a new API endpoint

**Alternatives considered**:
- CI-triggered (rejected — adds coupling to every repo's pipeline)
- ArgoCD-style GitOps reconciliation (rejected — overkill for Docker Compose on a single VM)

---

### 5. dk-template Gaps

**Decision**: dk-template needs 3 specific changes, not a rewrite.

**Rationale**: The template already generates `docker-compose.preview.yaml` (no proxy_net, good) and `.dk-standards.yaml`. But:

1. **Port binding**: Uses `{{port}}:{{port}}` hardcoded by init.sh. Needs to change to `${APP_PORT:-{{port}}}:{{port}}` so the Platform API can override the host port.
2. **Missing `doppler.yaml`**: Template doesn't generate this file. Needs to be added with `project: {{product}}-applications` and `config: dev`.
3. **Missing `dk-preview` topic and webhook**: init.sh doesn't call `gh repo edit --add-topic dk-preview` or register the webhook. These steps should be added.

**Alternatives considered**: Making init.sh fully automated (including webhook registration) was considered but deferred — webhook registration requires the DK_GITHUB_WEBHOOK_SECRET which may not be available at scaffold time. Topic addition is safe to automate.

---

### 6. GitHub App (dk-alchemy) vs PAT

**Decision**: Use dk-alchemy GitHub App installation tokens, replacing `DK_GITHUB_PAT`.

**Rationale**: `config.py` already defines `DK_GITHUB_APP_ID` and `DK_GITHUB_APP_PRIVATE_KEY`. The app needs to be installed on all 4 orgs (`data-kinetic-projects`, `no-hype-ai`, `ATARI-Foundation`, `Enercore-AI`). Code changes needed in `webhooks.py` and `previews.py` to generate installation tokens from the app credentials instead of using a static PAT.

**Alternatives considered**: Per-org PATs (4 tokens — management overhead), single classic PAT (overly broad scope), fine-grained PAT (can't span orgs easily).

---

### 7. Doppler Secrets Inventory

**Decision**: 3 secrets need provisioning (down from 4 after dk-alchemy app decision).

**Findings from `config.py`**:

| Secret | Status | Notes |
|--------|--------|-------|
| `DK_PREVIEW_SSH_KEY` | Exists | Private key for VM101 SSH |
| `DK_PREVIEW_HOST` | Exists (default) | 192.168.10.51 (hardcoded default) |
| `DK_NPM_ADMIN_EMAIL` | **Needed** | NPM API auth |
| `DK_NPM_ADMIN_PASSWORD` | **Needed** | NPM API auth |
| `DK_GITHUB_WEBHOOK_SECRET` | **Needed** | HMAC validation |
| `DK_GITHUB_APP_ID` | **Needed** | dk-alchemy GitHub App ID |
| `DK_GITHUB_APP_PRIVATE_KEY` | **Needed** | dk-alchemy GitHub App private key |

Note: `DK_GITHUB_PAT` is no longer needed — replaced by dk-alchemy app.

---

### 8. VM101 Network Architecture

**Decision**: Port allocation (10000-10999 range) must be added to the Platform API.

**Rationale**: Currently, compose files hardcode ports (e.g., `3000:3000`). When multiple previews run, port collisions occur. The API needs to:
1. Maintain a port registry (can use `.preview-meta.json` field `host_port`)
2. Allocate from 10000-10999 range
3. Set `APP_PORT` env var before `docker compose up`
4. Release port on teardown

**Current state**: `docker-compose.preview.yaml` in dk-template uses `{{port}}:{{port}}`. The `${APP_PORT}` pattern needs to be adopted.

---

### 9. Migration Data Audit Approach

**Decision**: Pre/post migration row counts per Postgres table, captured via `psql` inside the container.

**Rationale**: Full checksums are expensive and unnecessary for a volume-preserving compose swap. Row counts per table provide sufficient confidence:
```bash
# Pre-migration snapshot
docker exec <postgres-container> psql -U postgres -d <db> -c \
  "SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY tablename;" > pre-migration.txt

# Post-migration snapshot (same command)
# Diff the two files
```

For projects without Postgres (Wave 1: stryker-intro, durva, cms-121, ut-san-antonio-oncology), the app-loads check is sufficient since there's no persistent data.

---

### 10. Production Apps (Wave 4)

**Decision**: Port binding fixes only — no compose file standardization needed for production apps.

**Rationale**: Enercore Platform-Core and ABTS Surgeo are production workloads in `/opt/dk-production/`, not preview environments. They need:
1. Enercore: Bind SeaweedFS (8333, 8888, 9333), Grafana (3001), Loki (3100), Tempo (3200, 4317, 4318), Unleash (4242), Alloy (12345) to 127.0.0.1
2. Surgeo: Rotate leaked access token in `.git/config`

These are security fixes, not migration tasks. No `docker-compose.preview.yaml` needed.
