# Operations runbook

## Environment and secrets

Use split examples as starting points:

- `.env.local.example` for local development;
- `.env.test.example` for tests/CI;
- `.env.production.example` for production secret managers, Docker secret files,
  runtime environment injection, or Kubernetes Secret manifests.

Production must provide `DATABASE_URL`, `SESSION_SECRET`, CORS origins, OAuth
values when enabled, and frontend API URLs. Keep `POSTGRES_SYNCHRONIZE=false`;
use migrations instead. Never commit `.env.production`, Docker secret files,
Kubernetes Secret values, or PM2 runtime secrets.

## Health, readiness, and logging

All Nest APIs expose:

- `GET /live` for process liveness;
- `GET /health` for general health with indicator details;
- `GET /ready` for dependency readiness — returns HTTP 503 when required
  dependencies are unavailable;
- `GET /health/private` (private-network only) for the full health envelope;
  indicator details remain sanitized.

Request logs are JSON lines with app name, method, path, status, duration, and
request id. Use `LOG_LEVEL=debug` locally, `info` in production, and route logs
to the platform collector.

### Operations runbooks

- [Runbook index and templates](runbooks/README.md) — service incident template
  and runbook placement rules.
- [Health, readiness, and liveness](operations/health-checks.md) — endpoints,
  response shapes, status resolution, and /ready 503 triage.
- [Dependency readiness failure triage](operations/dependency-triage.md) —
  Postgres/Redis (`@redis/client`)/NATS connection failure procedures.
- [Structured logging and request-id](operations/logging.md) — log format,
  levels, request-id correlation, sensitive-data redaction.
- [OpenTelemetry configuration](operations/otel.md) — env var reference,
  activation behavior, exported signals, Prometheus/Sentry status.
- [Test reliability](testing/test-reliability.md) — deterministic time,
  seed factories, flaky-test quarantining, CI commands.

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
preflights; they do not start Compose, apply Kubernetes manifests, sync a GitOps controller,
push images, or restart PM2 processes.

- Overview and mode matrix: [deployment.md](deployment.md)
- Production mode guide: [production-deploy.md](production-deploy.md)
- Single-server Docker Compose: [docker-compose-production.md](docker-compose-production.md)
- Turnkey Ubuntu/Debian host lifecycle: [single-server-deployment.md](single-server-deployment.md)
- Direct Kubernetes/Helm: [deploy/kubernetes/README.md](../deploy/kubernetes/README.md)
- Argo CD and Flux GitOps: [GITOPS.md](../GITOPS.md)
- Preflight checklist: [production-readiness.md](production-readiness.md)

Mode-specific validation:

```bash
pnpm run deploy:validate          # generic bundle; skips Helm render if Helm is missing
pnpm run deploy:validate:docker   # Compose/static deployment checks
pnpm run deploy:validate:pm2      # validates the shipped ecosystem.config.cjs contract
pnpm run deploy:validate:gitops   # strict Helm plus Argo CD and Flux Kustomize validation
pnpm run deploy:validate:helm     # strict Helm 4 render/lint path
REQUIRE_HELM=true pnpm run deploy:validate
```

Rollback summary:

- Compose: restore the previous verified `IMAGE_TAG` or digest override and run
  the documented Compose update command.
- PM2: restart from the previous release directory, ecosystem config, and runtime
  environment when a product-owned PM2 config exists.
- Helm: use `helm history` and `helm rollback` for direct releases.
- GitOps: revert the promotion commit, image digest, or verified full-SHA tag and let
  the selected Argo CD or Flux controller reconcile.

For every mode, take a database backup before migrations and decide whether the
schema change is backward compatible before restoring or rolling forward.
