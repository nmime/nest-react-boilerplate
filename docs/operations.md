# Operations runbook

## Environment and secrets

Use split examples as starting points:

- `.env.local.example` for local development;
- `.env.test.example` for tests/CI;
- `.env.production.example` for production secret managers or Kubernetes Secret manifests.

Production must provide `DATABASE_URL`, `AUTH_JWT_SECRET`, CORS origins, OAuth values when enabled, and frontend API URLs. Keep `POSTGRES_SYNCHRONIZE=false`; use migrations instead.

## Health, readiness, and logging

All Nest APIs expose:

- `GET /live` and `GET /health` for process liveness;
- `GET /ready` for dependency readiness. Services with MikroORM registered check `select 1` against PostgreSQL and return HTTP 503 when unavailable.

Request logs are JSON lines with app name, method, path, status, duration, and request id. Use `LOG_LEVEL=debug` locally, `info` in production, and route logs to the platform collector.

## Database lifecycle

```bash
pnpm db:migrate
pnpm db:seed -- --dry-run
pnpm db:seed -- --email admin@example.com
pnpm db:backup -- --output backups/pre-release.dump
pnpm db:restore -- --input backups/pre-release.dump --dry-run
pnpm db:restore -- --input backups/pre-release.dump --yes
```

`db:reset`, `db:seed`, and `db:restore` refuse non-local/dev-looking databases unless `--force` is supplied. Backup and restore commands redact connection strings in logs.
