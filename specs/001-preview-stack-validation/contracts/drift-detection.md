# Contract: Drift Detection

**Feature**: `001-preview-stack-validation`

## API Endpoint

```
GET /dk/v1/previews/drift
```

### Response

```json
{
  "check_time": "2026-03-25T14:00:00Z",
  "total_projects": 12,
  "in_sync": 10,
  "drifted": 1,
  "missing": 1,
  "projects": [
    {
      "name": "stryker-intro",
      "repo": "data-kinetic-projects/stryker-portfolio-dashboard",
      "status": "in-sync"
    },
    {
      "name": "ghost-cal",
      "repo": "data-kinetic-projects/ghost-cal",
      "status": "drifted",
      "compose_diff": "--- repo\n+++ vm101\n@@ -5,7 +5,7 @@\n-    image: ghcr.io/.../app:latest\n+    image: ghcr.io/.../app:abc1234",
      "image_drift": [
        {
          "service": "app",
          "repo_image": "ghcr.io/.../app:latest",
          "vm_image": "ghcr.io/.../app:abc1234"
        }
      ]
    },
    {
      "name": "new-project",
      "repo": "data-kinetic-projects/new-project",
      "status": "missing-vm-file"
    }
  ]
}
```

## CLI Command

```
dk preview drift [--project <name>] [--json]
```

### Output (table mode)

```
Preview Drift Report (2026-03-25 14:00 UTC)

 Project                    Status      Details
 stryker-intro              in-sync     —
 ghost-cal                  DRIFTED     image tag mismatch (app)
 new-project                MISSING     no compose file on VM101
 ...

 Summary: 10 in-sync, 1 drifted, 1 missing (12 total)
```

### Output (JSON mode)

Same as API response above.

## Cron Schedule

```cron
# Daily drift check at 06:00 UTC
0 6 * * * curl -s -H "X-API-Key: $DK_API_KEY" https://dk.datakinetic.com/dk/v1/previews/drift > /opt/dk-previews/logs/drift-report.json 2>&1
```

## Comparison Logic

For each preview project in `/opt/dk-previews/active/`:

1. Read `.preview-meta.json` to get `repo` and `branch`
2. Fetch `docker-compose.preview.yaml` from GitHub repo at that branch (via dk-alchemy GitHub App)
3. Read `docker-compose.preview.yaml` from VM101 filesystem
4. Compare:
   - File content (unified diff)
   - Per-service image tags
   - Volume names
   - Network configuration
5. Report status: `in-sync` | `drifted` | `missing-repo-file` | `missing-vm-file`
