# Contract: Migration Data Audit

**Feature**: `001-preview-stack-validation`

## Pre-Migration Snapshot

For each database-backed project (Waves 2 and 3), capture row counts before the compose switch.

### Command

```bash
# Run inside the project directory on VM101
docker exec <postgres-container> psql -U postgres -d <db> -c \
  "SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY schemaname, tablename;" \
  > /opt/dk-previews/active/<name>/pre-migration-audit.txt
```

### Output Format

```
 schemaname |   tablename    | n_live_tup
------------+----------------+------------
 public     | users          |       1247
 public     | sessions       |        892
 public     | documents      |       5634
```

## Post-Migration Snapshot

After the compose switch, once the database container is healthy:

```bash
docker exec <postgres-container> psql -U postgres -d <db> -c \
  "SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY schemaname, tablename;" \
  > /opt/dk-previews/active/<name>/post-migration-audit.txt
```

## Comparison

```bash
diff /opt/dk-previews/active/<name>/pre-migration-audit.txt \
     /opt/dk-previews/active/<name>/post-migration-audit.txt
```

**Pass criteria**: Zero differences. Any row count change indicates data loss or corruption.

**Note**: `n_live_tup` is an estimate from `pg_stat_user_tables`. For exact counts, run `ANALYZE` before the snapshot or use `SELECT count(*) FROM <table>` per table. The estimate is sufficient for detecting catastrophic data loss (e.g., empty tables after volume remount failure).

## Projects Requiring Audit

| Wave | Project | Database | Container Name Pattern |
|------|---------|----------|----------------------|
| 2 | surgeo | Postgres | `surgeo-postgres-1` or `surgeo_postgres_1` |
| 2 | tavr-insight-and-profiler | Postgres | `tavr-*-postgres-*` |
| 2 | va | pgvector (Postgres) | `va-postgres-1` or `va_postgres_1` |
| 2 | the-real-apex | Postgres | `the-real-apex-postgres-*` |
| 3 | ghost-cal | Postgres | `ghost-cal-postgres-*` |
| 3 | rose-and-berg | Postgres | `rose-and-berg-postgres-*` |
| 3 | dayone-rili-synthetics | Postgres | `dayone-rili-*-postgres-*` |
| 3 | ground-truth-charlie | Postgres | `ground-truth-charlie-postgres-*` |

## Wave 1 Projects (No Audit Needed)

stryker-intro, durva, cms-121, ut-san-antonio-oncology — no persistent database, app-loads check sufficient.
