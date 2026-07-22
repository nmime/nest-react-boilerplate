# Direct Kubernetes deployment

This directory documents the direct Helm release path. The chart itself lives in
`.helm/` so the same artifact is consumed by direct Helm, Argo CD, and Flux.

## Prerequisites

1. Run `pnpm nrb init` and commit product-owned names, registry paths, and domains.
2. Publish `sha-<full-git-sha>` images for all enabled apps and the migrator; record digests when immutable artifact identity is required.
3. Provision reachable PostgreSQL and Redis services; the app chart does not own their lifecycle.
4. Provision the Secret referenced by `secrets.existingSecret` with at least
   `SESSION_SECRET`, `BETTER_AUTH_SECRET`, and `DATABASE_URL`.
5. Provision `ghcr-credentials` in the target namespace when images are private.
6. Configure ingress, DNS, and TLS for every enabled app domain.

Use External Secrets, Vault, SOPS, Sealed Secrets, or the platform's equivalent.
Do not commit Secret values or pass them through Helm `--set` arguments.

## Render and validate without a cluster mutation

```bash
pnpm run deploy:validate:helm
helm template nest-react-boilerplate .helm \
  -f .helm/values.yaml \
  -f .helm/values-production.yaml \
  --namespace nest-react-boilerplate > /tmp/nest-react-boilerplate.yaml
```

Review the rendered image tags, Secret reference, namespace, ingress hosts,
resource requests/limits, probes, migration Job, NetworkPolicies, and optional
CRD-backed monitoring resources before release.

## Install or upgrade

```bash
helm upgrade --install nest-react-boilerplate .helm \
  -f .helm/values.yaml \
  -f .helm/values-production.yaml \
  --namespace nest-react-boilerplate \
  --create-namespace \
  --atomic \
  --wait \
  --timeout 10m
```

The pre-install/pre-upgrade migration hook must complete before application
rollout. `--atomic` rolls back a failed Helm release, but database migrations
must still be designed for the rollback window.

## Verify

```bash
kubectl get pods,job,svc,ingress -n nest-react-boilerplate
kubectl rollout status deployment/nest-react-boilerplate-auth-app-api -n nest-react-boilerplate
kubectl rollout status deployment/nest-react-boilerplate-user-app-api -n nest-react-boilerplate
kubectl rollout status deployment/nest-react-boilerplate-admin-app-api -n nest-react-boilerplate
curl -fsS https://auth-app-api.example.com/ready
```

## Roll back

```bash
helm history nest-react-boilerplate -n nest-react-boilerplate
helm rollback nest-react-boilerplate <revision> \
  --namespace nest-react-boilerplate \
  --wait \
  --timeout 10m
```

Record the rollback in Git/production values. Restore PostgreSQL only when the
migration contract requires it; otherwise prefer a corrective forward migration.
