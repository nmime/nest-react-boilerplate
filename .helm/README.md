# Helm chart

This chart is intentionally small and application-owned. It mirrors the live
`nmime/opwerf` pattern: the platform repository owns Kubernetes, ingress,
cert-manager, ArgoCD, data services, monitoring, and secret controllers; this
repository owns app Deployments, Services, probes, migration hooks, and ingress
routes.

## Production contract

- Build and publish immutable images for each service and the migrator.
- Create a Kubernetes Secret outside the chart and set `secrets.existingSecret`.
  The Secret must provide `AUTH_JWT_SECRET` and either `DATABASE_URL` or the
  `POSTGRES_*` values consumed by the app.
- Keep `POSTGRES_SYNCHRONIZE=false`; the Helm pre-install/pre-upgrade hook runs
  `pnpm db:migrate` when `migrations.enabled=true`.
- APIs probe `/live` and `/ready`; nginx frontends probe `/`.
- Enable ingress/TLS only after DNS and cert-manager/ingress are ready.
- Tune resources, HPA, PDBs, imagePullSecrets, and optional pod/container
  security contexts per environment.

## Render locally

```bash
helm lint .helm
helm template nest-react-boilerplate .helm \
  -f .helm/values-production.yaml \
  --set-string apps.authApi.image.tag=$(git rev-parse --short HEAD)
```

## GitOps

Use `deploy/argocd/application.yaml` as a starting point. In production, point
ArgoCD at an environment values file (for example `.helm/values-production.yaml`)
and update image tags by immutable digest/tag through your CI pipeline.
