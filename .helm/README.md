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

- Run setup first. It generates `.helm/values-selection.yaml` from the fresh closure,
  explicitly lists selected app IDs, disables unselected chart apps, and selects
  the provider/migrator only when durable persistence is present. Load this file
  after environment values so later files cannot re-enable an unselected image.
- Build and publish immutable images for every fresh-closure workload enabled by
  effective Helm values. A durable-provider closure includes the migrator when
  migrations are enabled. The release workflow pushes `sha-<git-sha>` GHCR
  tags, emits SBOM/provenance attestations, scans with Trivy, and signs digests
  with cosign keyless GitHub OIDC.
- Telegram's user-app entry is a Vite build-time feature. Set the repository
  Actions variable `VITE_TELEGRAM_AUTH_ENABLED=true` before publishing the
  release image used by a Telegram-enabled Helm environment; runtime Helm
  values cannot retrofit a disabled button into an already-built bundle.
- Select externally managed PostgreSQL or a transaction-capable MongoDB replica
  set with `database.engine`; MongoDB also requires matching non-empty
  `database.mongodb.replicaSet` and `replicaSet` URI options.
- Create a Kubernetes Secret outside the chart and set `secrets.existingSecret`.
  The Secret must provide `SESSION_SECRET`, `BETTER_AUTH_SECRET`, and the
  selected provider credential: `DATABASE_URL` for PostgreSQL or `MONGODB_URI`
  for MongoDB. When enabling an optional bot API,
  include its documented Telegram or Discord runtime values in the same Secret.
  Telegram bot/TMA requires `TELEGRAM_BOT_TOKEN`; Telegram OIDC additionally
  requires `TELEGRAM_OIDC_CLIENT_SECRET`; webhook mode requires
  `TELEGRAM_BOT_WEBHOOK_SECRET`. Set the non-secret
  `config.telegramOidcClientId`, enable flags, Better Auth public URL/trusted
  origins, `config.authAllowedReturnUrls`, webhook URL, and canonical Mini App URL in values.
- For MongoDB, provision two additional Secrets. Set
  `migrations.mongodbExistingSecret` to a Secret containing
  `MONGODB_MIGRATION_URI`, and when backups are enabled set
  `backups.mongodb.existingSecret` to a Secret containing the deployment-wide
  `MONGODB_BACKUP_RESTORE_URI`. The latter must omit a database path, use
  `authSource=admin`, and belong to a principal with the built-in `backup` and
  `restore` roles plus the provider-supported `anyAction` on `anyResource`
  custom role MongoDB requires for `--oplogReplay`. Application pods receive
  neither elevated URI.
  The resolved Secret names, including chart-generated defaults, must be
  distinct. Setting `secrets.create=true` creates only credentials without an
  external Secret name and cannot overwrite an elevated external Secret.
  Principal comparisons percent-decode the username and authentication database
  before checking identity. When migration credentials come from
  `migrations.mongodbExistingSecret`, generated backup mode neither requires nor
  parses `secrets.mongodbMigrationUri`; the distinct resolved Secret names
  enforce that external principal boundary. Backend and background pods use explicit runtime
  Secret key references rather than `envFrom`, so an
  accidentally colocated `MONGODB_MIGRATION_URI` or
  `MONGODB_BACKUP_RESTORE_URI` key is not injected into runtime containers.
- For PostgreSQL, keep `POSTGRES_SYNCHRONIZE=false`. The Helm
  pre-install/pre-upgrade hook runs the provider-aware `pnpm db:migrate` command
  when `migrations.enabled=true`.
- APIs probe `/live` and `/ready`; selected nginx frontends probe
  `/nginx-health` from the Helm-rendered nginx ConfigMap. All deployments include
  `startupProbe` alongside liveness/readiness probes.
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
# Explicit template-maintainer sweep without a product selection:
pnpm run deploy:validate:helm:all-reference
# or make the generic no-deploy bundle require Helm rendering:
REQUIRE_HELM=true pnpm run deploy:validate
HELM_SELECTION_VALUES=.helm/values-selection.yaml bash scripts/validate-helm.sh
helm template nest-react-boilerplate .helm \
  -f .helm/values-production.yaml \
  -f .helm/values-selection.yaml \
  --set-string apps.authAppApi.image.tag=sha-$(git rev-parse HEAD)
```

The generic `pnpm run deploy:validate` command remains a no-deploy preflight and
skips Helm render validation when Helm is unavailable. It does not apply this
chart, sync a controller, or deploy traffic.

Selected validation first renders the actual setup-generated provider-free,
PostgreSQL, or MongoDB overlay with production values and without enabling
backups. Separate synthetic all-reference PostgreSQL and MongoDB renders cover
provider-specific backup compatibility without changing the product selection.

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
- `backups.enabled` renders the selected provider's backup CronJob. Configure
  object-store and encryption/upload hooks before enabling it in production,
  and restore only with the matching PostgreSQL or MongoDB workflow. The default
  backup pod runs as UID/GID 1000 and sets `fsGroup=1000` so its PVC or
  `emptyDir` mount is writable without root.

See `docs/operations/observability-dr.md` for the RPO/RTO policy, backup hook
contract, restore steps, and incident runbook.
