# Deployment modes

The repository ships four independently selectable production paths. Run
`pnpm nrb init` before any path so names, domains, registries, and Git sources
belong to the generated product.

| Mode                         | Entrypoint                                                            | Database                                                    | Validation                        |
| ---------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------- |
| Compose + bundled PostgreSQL | production wrapper + bundled DB and Compose Caddy or host Nginx edge  | PostgreSQL service and volume inside the Compose project    | `pnpm run deploy:validate:docker` |
| Compose + external DB        | production wrapper + external DB and Compose Caddy or host Nginx edge | Secret-file URL to operator/cloud PostgreSQL; no Compose DB | `pnpm run deploy:validate:docker` |
| Direct Kubernetes            | `.helm/` + `.helm/values-production.yaml`                             | Platform-managed PostgreSQL and Redis                       | `pnpm run deploy:validate:helm`   |
| Kubernetes GitOps            | Helm chart through `deploy/argocd/` or `deploy/flux/`                 | Platform-managed PostgreSQL and Redis                       | `pnpm run deploy:validate:gitops` |
| PM2                          | Product-owned `ecosystem.config.*` when a project explicitly adds one | Product/platform-owned                                      | `pnpm run deploy:validate:pm2`    |

The generic `pnpm run deploy:validate` command runs all static contracts,
renders both production Compose topologies when Docker Compose is available,
validates Argo CD and Flux manifests, and renders the Helm chart when Helm is
available. CI requires the relevant CLIs, so optional local skips cannot hide a
broken deployment artifact.

These validation commands do not start containers, mutate a cluster, push an
image, or sync a controller.

## Decision flow

```mermaid
flowchart TD
  start([Choose runtime]) --> host{Single Docker host?}
  host -- Yes --> db{Database inside the Compose project?}
  db -- Yes --> bundled[Compose bundled-db overlay]
  db -- No --> external[Compose external-db overlay and DATABASE_URL secret]
  bundled --> domains{Public routing owner?}
  external --> domains
  domains -- One hostname --> single[Compose Caddy single-domain]
  domains -- Per app or wildcard DNS --> multi[Compose Caddy per-app-domains]
  domains -- Existing edge --> proxy[external-proxy]
  host -- No --> k8s{Kubernetes?}
  k8s -- No --> pm2[Add and own a PM2/runtime runbook]
  k8s -- Yes --> controller{GitOps controller owns reconciliation?}
  controller -- No --> helm[Direct Helm upgrade/install]
  controller -- Yes --> gitops[Argo CD or Flux]
  single --> verify[Migration, readiness, logs, backup, rollback]
  multi --> verify
  proxy --> verify
  pm2 --> verify
  helm --> verify
  gitops --> verify
```

## Local development

Local development is separate from production Compose:

```bash
cp .env.example .env
pnpm run dev:db
pnpm run db:migrate
pnpm run dev:fullstack
```

`docker/docker-compose.yml` uses profiles selected by `pnpm nrb setup`; the
production base/overlays do not participate in that selection.

## Compose production

The production base is intentionally incomplete without one database overlay.
This prevents an operator from accidentally believing an external database mode
is active while every API still depends on a local `postgres` service.

```bash
pnpm run deploy:validate:docker
pnpm run docker:prod:config
pnpm run docker:prod:up
```

Select `COMPOSE_DATABASE_MODE`, `COMPOSE_DOMAIN_MODE`, and `COMPOSE_TLS_MODE` in
`.env.production`. Compose supports one public hostname, deterministic per-app
hostnames compatible with wildcard DNS, or an operator-owned external proxy.
All modes mount credentials from files under `docker/secrets/`; production
database credentials and TLS private keys are never interpolated into the
Compose model. See
[docker-compose-production.md](docker-compose-production.md) for setup,
verification, backup, rollback, and shutdown commands.

For an empty Ubuntu/Debian server, use the supported idempotent host Nginx +
Certbot lifecycle in
[single-server-deployment.md](single-server-deployment.md). It installs Node.js
24, the repository-pinned pnpm, Docker Engine/Compose, Nginx, Certbot, systemd
startup, exact-host or DNS-wildcard certificates, immutable-tag updates,
health checks, and guarded rollback without exposing app ports.

## Direct Kubernetes

The app-owned chart deploys applications, migration hooks, Services, probes,
ingress, and optional app-level monitoring resources. It references, but does
not provision, production secrets or stateful platform services.

```bash
pnpm run deploy:validate:helm
helm upgrade --install nest-react-boilerplate .helm \
  -f .helm/values.yaml \
  -f .helm/values-production.yaml \
  --namespace nest-react-boilerplate \
  --create-namespace --atomic --wait --timeout 10m
```

The complete runbook is [deploy/kubernetes/README.md](../deploy/kubernetes/README.md).

## Kubernetes with GitOps

Argo CD and Flux consume the same chart and production values:

```bash
pnpm run deploy:validate:gitops

# Choose one controller, never both for the same release.
kubectl apply -k deploy/argocd
# or
kubectl apply -k deploy/flux
```

The manual promotion workflow verifies all release images at one full Git SHA,
updates production values on a topic branch, and opens a pull request. After
merge, the selected controller reconciles. It does not write directly to `main`.
See [GITOPS.md](../GITOPS.md).

## Release invariants for every mode

- Use only reviewed full-SHA tags (`sha-<40-character-git-sha>`) or digests.
- Create high-entropy secrets outside Git and keep secret files mode `0600`.
- Run the migration step once and require completion before API rollout.
- Use `/live` for liveness, `/ready` for dependency/migration readiness, and
  `/nginx-health` for static frontend containers.
- Verify backups before schema changes and document whether rollback is safe.
- Keep the selected apex (`landing-app` or `site-app`) on the base domain and
  every other public app/API on its exact `<app-id>.<base-domain>` host.
