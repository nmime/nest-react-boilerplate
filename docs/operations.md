# Operations runbook

## Environment and secrets

Use split examples as starting points:

- `.env.local.example` for local development;
- `.env.test.example` for tests/CI;
- `.env.production.example` for production secret managers, Docker secret files,
  runtime environment injection, or Kubernetes Secret manifests.

Production must provide `DATABASE_URL`, `AUTH_JWT_SECRET`, CORS origins, OAuth
values when enabled, and frontend API URLs. Keep `POSTGRES_SYNCHRONIZE=false`;
use migrations instead. Never commit `.env.production`, Docker secret files,
Kubernetes Secret values, or PM2 runtime secrets.

## Health, readiness, and logging

All Nest APIs expose:

- `GET /live` and `GET /health` for process liveness;
- `GET /ready` for dependency readiness. Services with MikroORM registered check
  `select 1` against PostgreSQL and return HTTP 503 when unavailable.

Request logs are JSON lines with app name, method, path, status, duration, and
request id. Use `LOG_LEVEL=debug` locally, `info` in production, and route logs
to the platform collector.

## Database lifecycle

```bash
pnpm db:migrate
pnpm db:seed -- --dry-run
pnpm db:seed -- --email admin@example.com
pnpm db:backup -- --output backups/pre-release.dump
pnpm db:restore -- --input backups/pre-release.dump --dry-run
pnpm db:restore -- --input backups/pre-release.dump --yes
```

`db:reset`, `db:seed`, and `db:restore` refuse non-local/dev-looking databases
unless `--force` is supplied. Backup and restore commands redact connection
strings in logs.

## Deployment runbooks

Deployment modes are optional and composable. Validation commands are no-deploy
preflights; they do not start Compose, apply Kubernetes manifests, sync ArgoCD,
push images, or restart PM2 processes.

- Overview and mode matrix: [deployment.md](deployment.md)
- Production mode guide: [production-deploy.md](production-deploy.md)
- Single-server Docker Compose: [docker-compose-production.md](docker-compose-production.md)
- Kubernetes/Helm/ArgoCD app chart notes: [.helm/README.md](../.helm/README.md)
- Preflight checklist: [production-readiness.md](production-readiness.md)

Mode-specific validation:

```bash
pnpm run deploy:validate          # generic bundle; skips Helm render if Helm is missing
pnpm run deploy:validate:docker   # Compose/static deployment checks
pnpm run deploy:validate:pm2      # no-op until ecosystem.config.{js,cjs,mjs} exists
pnpm run deploy:validate:gitops   # validates deploy/argocd/application.yaml
pnpm run deploy:validate:helm     # strict Helm render/lint path; requires Helm 3
REQUIRE_HELM=true pnpm run deploy:validate
```

Rollback summary:

- Compose: restore the previous immutable `IMAGE_TAG` or digest override and run
  the documented Compose update command.
- PM2: restart from the previous release directory, ecosystem config, and runtime
  environment when a product-owned PM2 config exists.
- Helm: use `helm history` and `helm rollback` for direct releases.
- GitOps/Argo: revert the Argo-tracked Git commit, values change, image digest,
  or immutable tag and let Argo reconcile.

For every mode, take a database backup before migrations and decide whether the
schema change is backward compatible before restoring or rolling forward.
