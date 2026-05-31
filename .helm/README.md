# Helm chart

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
- Enable ingress/TLS only after DNS and cert-manager/ingress are ready.
- Tune resources, HPA, PDBs, imagePullSecrets, and optional pod/container
  security contexts per environment.

## Render locally

```bash
bash scripts/validate-helm.sh
helm template nest-react-boilerplate .helm \
  -f .helm/values-production.yaml \
  --set-string apps.authApi.image.tag=sha-$(git rev-parse HEAD)
```

## GitOps

Use `deploy/argocd/application.yaml` as a starting point. In production, point
ArgoCD at an environment values file (for example `.helm/values-production.yaml`)
and update image digests (preferred) or immutable `sha-[git-sha]` tags through your CI pipeline. See `docs/release-hardening.md`.

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
