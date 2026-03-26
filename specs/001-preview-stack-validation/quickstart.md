# Quickstart: Preview Stack Validation & Migration

**Feature**: `001-preview-stack-validation`

## Prerequisites

- SSH access to VM101 (`ssh vm101-preview-stack`)
- Doppler CLI installed and authenticated
- `gh` CLI authenticated with access to all 4 GitHub orgs
- dk-cli installed (`npm install -g @data-kinetic/dk-cli`)
- Access to dk-alchemy repo (`~/Code/dk-alchemy`)
- Access to dk-template repo (`~/Code/dk-template`)

## Execution Order

### Phase A: Unblock the API

1. Provision Doppler secrets in `dk-infrastructure/prd`:
   - `DK_NPM_ADMIN_EMAIL` — get from NPM admin UI on VM101:81
   - `DK_NPM_ADMIN_PASSWORD` — get from NPM admin UI on VM101:81
   - `DK_GITHUB_WEBHOOK_SECRET` — generate: `openssl rand -hex 32`
   - `DK_GITHUB_APP_ID` — from dk-alchemy GitHub App settings
   - `DK_GITHUB_APP_PRIVATE_KEY` — from dk-alchemy GitHub App settings

2. Install dk-alchemy GitHub App on all 4 orgs with repo permissions for preview repos

3. Update dk-alchemy code:
   - Switch `webhooks.py` and `previews.py` from PAT to GitHub App installation tokens
   - Add port allocation logic (10000-10999 range) to `previews.py`

4. Deploy Platform API to K3s, verify pod is running

5. Smoke tests:
   ```bash
   # Health check
   curl -H "X-API-Key: $TOKEN" https://dk.datakinetic.com/dk/v1/previews/health

   # List existing previews
   curl -H "X-API-Key: $TOKEN" https://dk.datakinetic.com/dk/v1/previews
   ```

### Phase B: Wave 1 Migration (Simple Apps)

For each of: stryker-intro, durva, cms-121, ut-san-antonio-oncology

1. **Mac**: Create `docker-compose.preview.yaml`, `doppler.yaml`, `.dk-standards.yaml` in product repo, push PR
2. **SSH**: Pull code on VM101, switch compose file:
   ```bash
   cd /opt/dk-previews/active/<name>
   git pull
   docker compose down
   docker compose -f docker-compose.preview.yaml up -d
   curl -sf https://<name>.preview.datakinetic.com -o /dev/null && echo OK
   ```
3. **Mac**: Test dk-cli loop: `dk preview list`, `dk preview down <name>`, `dk preview up`

### Phase C: Wave 2 Migration (Apps + Database)

Same as Phase B but with data audit:
```bash
# Pre-migration snapshot
docker exec <postgres> psql -U postgres -d <db> -c \
  "SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY tablename;" \
  > pre-migration-audit.txt

# Switch compose file (same as Phase B)

# Post-migration snapshot + compare
docker exec <postgres> psql -U postgres -d <db> -c \
  "SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY tablename;" \
  > post-migration-audit.txt
diff pre-migration-audit.txt post-migration-audit.txt
```

Special cases:
- **surgeo**: Rotate leaked access token FIRST
- **va**: Confirm branch `001-va-disability-calculator` is intentional
- **ghost-cal**: Confirm branch `fix/add-database-migrations` is intentional

### Phase D: Wave 3 Migration (Multi-Service)

Same as Phase C with additional complexity — multiple volumes, multiple services.

Special cases:
- **ground-truth-charlie**: Rename `docker-compose-preview.yaml` → `docker-compose.preview.yaml`
- **rose-and-berg**: Currently running `docker-compose.dev.yml`, consolidate 2 custom networks
- **dayone-rili-synthetics**: Has MinIO in addition to Postgres + Redis

### Phase E: Validation & Drift Detection

1. Build drift detection endpoint + CLI command
2. Run first drift report across all 12 projects (should show 100% in-sync)
3. Set up daily cron for drift checks
4. Test PR webhook on one Wave 1 repo (open PR → preview created → close PR → preview torn down)
5. Roll out webhooks to remaining repos

### Phase F: Security + Cleanup

1. **Enercore**: Bind all ports to 127.0.0.1
2. **Surgeo**: Rotate leaked token, update git remote
3. Remove stale directories, broken symlinks, unused networks
4. Decommission `actions-runner-carbon5`
5. Update dk-template (port binding, doppler.yaml, dk-preview topic)
