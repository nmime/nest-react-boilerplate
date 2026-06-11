# Helm chart

Helm is an optional deployment mode for this application. It is required for
strict chart render/lint validation and actual Helm releases, but it is not a
global prerequisite for generic deployment validation. Use Docker/Compose, PM2,
Helm, or Helm + GitOps/Argo independently according to the target environment.

This chart is intentionally small and application-owned. It mirrors the live
`nmime/opwerf` pattern: the platform repository owns Kubernetes, ingress,
cert-manager, ArgoCD, data services, monitoring, and secret controllers; this
repository owns app Deployments, Services, probes, migration hooks, and ingress
routes.

## Production contract

- Build and publish immutable images for each service and the migrator. The release workflow pushes `sha-<git-sha>` GHCR tags, emits SBOM/provenance attestations, scans with Trivy, and signs digests with cosign keyless GitHub OIDC.
- Create a Kubernetes Secret outside the chart and set `secrets.existingSecret`.
  The Secret must provide `AUTH_JWT_SECRET` and either `DATABASE_URL` or the
  `POSTGRES_*` values consumed by the app.
- Keep `POSTGRES_SYNCHRONIZE=false`; the Helm pre-install/pre-upgrade hook runs
  `pnpm db:migrate` when `migrations.enabled=true`.
- APIs probe `/live` and `/ready`; nginx frontends probe `/nginx-health` from the Helm-rendered nginx ConfigMap.
- Keep persisted auth token cleanup explicit in `config.authTokenCleanup*` values.
  The service defaults to enabled hourly cleanup on startup and clamps intervals
  below 60000ms to avoid tight cleanup loops.
- Enable ingress/TLS only after DNS and cert-manager/ingress are ready.
- Tune resources, HPA, PDBs, imagePullSecrets, and optional pod/container
  security contexts per environment.

## Render locally

```bash
pnpm run deploy:validate:helm
# or make the generic no-deploy bundle require Helm rendering:
REQUIRE_HELM=true pnpm run deploy:validate
bash scripts/validate-helm.sh
helm template nest-react-boilerplate .helm \
  -f .helm/values-production.yaml \
  --set-string apps.authApi.image.tag=sha-$(git rev-parse HEAD)
```

The generic `pnpm run deploy:validate` command remains a no-deploy preflight and
skips Helm render validation when Helm is unavailable. It does not apply this
chart, sync ArgoCD, or deploy traffic.

## GitOps

Use `deploy/argocd/application.yaml` as a starting point. In production, point
ArgoCD at an environment values file (for example `.helm/values-production.yaml`)
and update image digests (preferred) or immutable `sha-[git-sha]` tags through your CI pipeline. See `docs/release-hardening.md`.

For Helm + GitOps/Argo, this app repo owns the chart, values, image references,
Secret references, migration hooks, Services, probes, and app ingress routes.
The platform repo owns the cluster, ArgoCD installation/projects, ingress
controllers/Gateway API, DNS/TLS issuers, External Secrets/Vault, databases,
observability, backups, and disaster recovery. Validate the optional ArgoCD
manifest with `pnpm run deploy:validate:gitops`; the command does not sync Argo
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
