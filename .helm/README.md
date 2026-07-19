# Helm chart

Helm is an optional deployment mode for this application. It is required for
strict chart render/lint validation and actual Helm releases, but it is not a
global prerequisite for generic deployment validation. Use Docker/Compose, PM2,
Helm, or Helm through Argo CD/Flux independently according to the target environment.

This chart is intentionally small and application-owned. It mirrors the live
platform/application boundary: the platform repository owns Kubernetes, ingress,
cert-manager, GitOps controllers, data services, monitoring, and secret controllers; this
repository owns app Deployments, Services, probes, migration hooks, and ingress
routes.

## Production contract

- Build and publish immutable images for each service and the migrator. The release workflow pushes `sha-<git-sha>` GHCR tags, emits SBOM/provenance attestations, scans with Trivy, and signs digests with cosign keyless GitHub OIDC.
- Telegram's user-app entry is a Vite build-time feature. Set the repository
  Actions variable `VITE_TELEGRAM_AUTH_ENABLED=true` before publishing the
  release image used by a Telegram-enabled Helm environment; runtime Helm
  values cannot retrofit a disabled button into an already-built bundle.
- Create a Kubernetes Secret outside the chart and set `secrets.existingSecret`.
  The Secret must provide `AUTH_JWT_SECRET`, `BETTER_AUTH_SECRET`, and `DATABASE_URL`. When enabling an optional bot API,
  include its documented Telegram or Discord runtime values in the same Secret.
  Telegram bot/TMA requires `TELEGRAM_BOT_TOKEN`; Telegram OIDC additionally
  requires `TELEGRAM_OIDC_CLIENT_SECRET`; webhook mode requires
  `TELEGRAM_BOT_WEBHOOK_SECRET`. Set the non-secret
  `config.telegramOidcClientId`, enable flags, Better Auth public URL/trusted
  origins, `config.authAllowedReturnUrls`, webhook URL, and canonical Mini App URL in values.
- Keep `POSTGRES_SYNCHRONIZE=false`; the Helm pre-install/pre-upgrade hook runs
  `pnpm db:migrate` when `migrations.enabled=true`.
- APIs probe `/live` and `/ready`; product frontends are deployable by default, and nginx frontends probe `/nginx-health` from the Helm-rendered nginx ConfigMap. All deployments include `startupProbe` alongside liveness/readiness probes.
- Frontend nginx supports same-origin API proxying for `/api/auth/*`, `/auth/*`, `/profile/*`,
  and `/admin/*` while serving `index.html` for HTML SPA navigations such as
  `/admin/users/:id`. Keep split-host and path-based routing choices aligned
  with `docs/frontend-deployment-topology.md`.
- Keep persisted auth token cleanup explicit in `config.authTokenCleanup*` values.
  The service defaults to enabled hourly cleanup on startup and clamps intervals
  below 60000ms to avoid tight cleanup loops.
- Enable ingress/TLS only after DNS and cert-manager/ingress are ready.
- Keep the unique frontend/API host, TLS, and browser CORS mapping in
  `docs/frontend-deployment-topology.md`; the deployment validator enforces it.
- Tune resources, HPA (with 300s scale-down stabilization), PDBs (`maxUnavailable: 1`), imagePullSecrets, and optional pod/container
  security contexts per environment.

## Render locally

```bash
pnpm run deploy:validate:helm
# or make the generic no-deploy bundle require Helm rendering:
REQUIRE_HELM=true pnpm run deploy:validate
bash scripts/validate-helm.sh
helm template nest-react-boilerplate .helm \
  -f .helm/values-production.yaml \
  --set-string apps.authAppApi.image.tag=sha-$(git rev-parse HEAD)
```

The generic `pnpm run deploy:validate` command remains a no-deploy preflight and
skips Helm render validation when Helm is unavailable. It does not apply this
chart, sync a controller, or deploy traffic.

## GitOps

Use `deploy/argocd/` or `deploy/flux/` as the controller entrypoint. Both read
`.helm/values-production.yaml` and immutable full-SHA tags. See `GITOPS.md` and
`docs/release-hardening.md`.

For GitOps, this app repo owns the chart, values, image references,
Secret references, migration hooks, Services, probes, and app ingress routes.
The platform repo owns the cluster, Argo CD/Flux installation and RBAC, ingress
controllers/Gateway API, DNS/TLS issuers, External Secrets/Vault, databases,
observability, backups, and disaster recovery. Validate both controller
entrypoints with `pnpm run deploy:validate:gitops`; the command does not sync a controller
or deploy.

## Observability and DR toggles

Optional SRE resources are disabled by default in `values.yaml` and enabled in
production only after the platform dependencies exist:

- `monitoring.otel.enabled` injects OTLP environment variables into application
  pods.
- `monitoring.otelCollector.enabled` deploys an in-cluster OpenTelemetry
  Collector that receives OTLP and exposes Prometheus metrics on port `9464`.
- `monitoring.serviceMonitor.enabled` renders a Prometheus Operator
  `ServiceMonitor` for the collector.
- `monitoring.prometheusRule.enabled` renders availability, restart, collector,
  and backup freshness alerts.
- `monitoring.grafanaDashboard.enabled` renders a Grafana sidecar ConfigMap for
  `.helm/dashboards/nest-react-boilerplate.json`.
- `backups.enabled` renders the PostgreSQL backup CronJob. Configure object-store
  and encryption/upload hooks before enabling it in production.

See `docs/operations/observability-dr.md` for the RPO/RTO policy, backup hook
contract, restore steps, and incident runbook.
