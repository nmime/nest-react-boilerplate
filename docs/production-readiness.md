# Production readiness checklist

Use this checklist before the selected deployment mode. Docker/Compose, PM2,
Helm, and Helm with Argo CD or Flux are optional modes; Helm is not a global
prerequisite unless the selected path renders or deploys the Helm chart.

## Build and release

- [ ] CI passes `pnpm run check` or the equivalent format, lint, typecheck, and
      test commands for the release branch.
- [ ] Images are built from a clean lockfile, published under full Git-SHA tags,
      and recorded by digest; registry policy prevents tag mutation where tags
      are used for deployment.
- [ ] `pnpm run deploy:validate` succeeds as a no-deploy generic preflight. If
      Helm is not installed, it clearly skips Helm render validation.
- [ ] For Compose deployments, `pnpm run deploy:validate:docker` succeeds, then
      `pnpm run docker:prod:config` succeeds for the selected database, domain,
      TLS, and optional-profile values in `.env.production`.
- [ ] For PM2 deployments, `pnpm run deploy:validate:pm2` validates the product
      `ecosystem.config.{js,cjs,mjs}`; when no ecosystem config exists, the
      command is an expected no-op skip.
- [ ] For GitOps deployments, `pnpm run deploy:validate:gitops` renders the
      chart and both Argo CD and Flux entrypoints; exactly one controller owns
      the target release.
- [ ] For Helm deployments, `pnpm run deploy:validate:helm` or
      `REQUIRE_HELM=true pnpm run deploy:validate` succeeds for the target image
      tags.

## Supply-chain gates

- [ ] GitHub Actions remain pinned to full commit SHAs with an adjacent version
      comment for reviewability.
- [ ] Routine GitHub Actions minor/patch updates may be grouped by Dependabot;
      major action updates are reviewed separately for Node runtime, hosted
      runner, and input/behavior changes.
- [ ] CodeQL, dependency review, SBOM generation, Trivy scanning, and cosign
      signing gates remain enabled for release workflows.

## Configuration and secrets

- [ ] `NODE_ENV=production`, matching `DATABASE_ENGINE`/`AUTH_PERSISTENCE`,
      `POSTGRES_SYNCHRONIZE=false`, and
      `OPENAPI_ENABLED=false` unless explicitly protected.
- [ ] `CORS_ORIGINS` is a comma-separated allow-list of real HTTPS origins.
- [ ] `AUTH_ALLOWED_RETURN_URLS` contains only the real absolute HTTPS frontend origins and is present in the auth runtime.
- [ ] `PUBLIC_DOMAIN`, `PRIMARY_APP`, DNS, Caddy/external-proxy routes, Better
      Auth URLs, cookie domains, and TLS SANs describe the same app-ID host map.
- [ ] `SESSION_SECRET` is generated with high entropy and stored in Docker
      secret files, Kubernetes Secrets, Vault, or External Secrets Operator.
- [ ] Session cookie domain, `SameSite`, `Secure`, and proxy settings match the
      public auth/API hosts.
- [ ] OAuth client secrets, database passwords, and TLS private keys are never
      committed and have a rotation path.
- [ ] Managed PostgreSQL uses validated TLS, or managed MongoDB uses validated
      TLS and a multi-node transaction-capable replica set. Standalone MongoDB
      is rejected.

## Runtime health

- [ ] APIs expose `/live`, `/ready`, and `/health`; orchestrators use `/ready`
      for dependency readiness.
- [ ] MongoDB-backed APIs report both required `database` and
      `database-transactions` readiness checks.
- [ ] Database migrations run once per release through the selected path:
      Compose `migrate` service, product-owned PM2 release step, or Helm
      pre-install/pre-upgrade hook.
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
- [ ] Kubernetes pods set resources and probes when using Helm/GitOps;
      production overlays can enable HPA, PDB, network policy, and
      pod/container security contexts.

## Operations

- [ ] Rollback notes include image tag rollback and database compatibility.
- [ ] On-call runbooks cover health checks, logs, migrations, backup, restore,
      secret rotation, and TLS certificate renewal.
- [ ] Dependency and container vulnerability scanning is scheduled.
