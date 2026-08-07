# Postgres restore runbook

## Backups (recommended)

Use continuous WAL archiving or nightly `pg_dump`:

```bash
docker compose exec postgres pg_dump -U kernle -Fc kernle > backup-$(date +%F).dump
```

Store dumps in encrypted object storage outside the app host.

## Restore

1. Stop the API: `docker compose stop api`
2. Drop and recreate (destructive):

```bash
docker compose exec postgres psql -U kernle -c "DROP DATABASE IF EXISTS kernle;"
docker compose exec postgres psql -U kernle -c "CREATE DATABASE kernle;"
docker compose exec -T postgres pg_restore -U kernle -d kernle --clean --if-exists < backup-YYYY-MM-DD.dump
```

3. Run migrations if schema drifted: `pnpm db:migrate`
4. Start API: `docker compose start api`
5. Verify: `curl http://localhost:3000/api/health`

## Point-in-time

For production, prefer managed Postgres (RDS / Neon / Supabase) with PITR enabled and document the provider-specific restore console steps here.
