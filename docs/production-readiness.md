# Production readiness checklist

Use this checklist before either deployment mode.

## Build and release

- [ ] CI passes `pnpm run check` or the equivalent format, lint, typecheck, and
      test commands for the release branch.
- [ ] Images are built from a clean lockfile and tagged immutably with the Git
      SHA or digest.
- [ ] `docker compose -f docker/docker-compose.prod.yml config` succeeds for the
      final `.env.production`.
- [ ] `helm lint .helm` and `helm template .helm -f .helm/values-production.yaml`
      succeed for the target image tags.

## Configuration and secrets

- [ ] `NODE_ENV=production`, `POSTGRES_SYNCHRONIZE=false`, and
      `OPENAPI_ENABLED=false` unless explicitly protected.
- [ ] `CORS_ORIGINS` is a comma-separated allow-list of real HTTPS origins.
- [ ] `AUTH_JWT_SECRET` is generated with high entropy and stored in Docker
      secret files, Kubernetes Secrets, Vault, or External Secrets Operator.
- [ ] JWT issuer/audience values match the public auth/API hosts.
- [ ] OAuth client secrets, database passwords, and TLS private keys are never
      committed and have a rotation path.
- [ ] Managed PostgreSQL uses SSL with certificate validation where available.

## Runtime health

- [ ] APIs expose `/live`, `/ready`, and `/health`; orchestrators use `/ready`
      for dependency readiness.
- [ ] Database migrations run once per release through the Compose `migrate`
      service or Helm pre-install/pre-upgrade hook.
- [ ] Backups are taken before migration and restore has been tested.
- [ ] Logs are centralized and include request IDs without request bodies or
      secret values.

## Security baseline

- [ ] TLS terminates at ingress/reverse proxy; HTTP redirects to HTTPS.
- [ ] Secure cookies/session settings are used for any product-specific session
      implementation.
- [ ] Helmet, validation pipe, request IDs, and fail-closed CORS remain enabled.
- [ ] Rate limiting is enabled at the app, edge, or API gateway. For multiple
      replicas, prefer a shared/edge limiter over in-memory counters.
- [ ] Public OpenAPI/docs are disabled or protected by SSO/VPN/edge auth.
- [ ] Kubernetes pods set resources and probes; production overlays can enable
      HPA, PDB, network policy, and pod/container security contexts.

## Operations

- [ ] Rollback notes include image tag rollback and database compatibility.
- [ ] On-call runbooks cover health checks, logs, migrations, backup, restore,
      secret rotation, and TLS certificate renewal.
- [ ] Dependency and container vulnerability scanning is scheduled.
