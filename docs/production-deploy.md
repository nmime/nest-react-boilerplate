# Production deployment modes

This repository supports optional, composable deployment modes instead of one
global production path. Docker/Compose, PM2, Helm, and Helm + GitOps/Argo can be
validated independently and combined with platform-owned infrastructure where
appropriate. Use Helm and Kubernetes only when you choose a Helm-based
mode.

The separation mirrors the `nmime/ansible-k8s-full-setup` pattern:

- the platform repository provisions Kubernetes, ingress/Gateway API,
  cert-manager, ArgoCD, External Secrets/Vault, observability, databases,
  backups, and other cluster services;
- this application repository owns app images, Docker Compose definitions, the
  optional `.helm/` chart, app values, migration jobs, services, probes, ingress
  shape, and rollback notes;
- production credentials are created outside committed files and passed through
  Docker secret files, runtime environment variables, Kubernetes Secrets, or
  External Secrets references such as `secrets.existingSecret`.

## Production artifact flow

```mermaid
flowchart LR
  sha[Git commit SHA] --> build[Build Dockerfile targets<br/>backend, frontend, migrator]
  build --> image[GHCR images tagged sha-git-sha or pinned by digest]
  image --> sbom[SBOM/provenance artifacts]
  image --> scan[Trivy/CodeQL/security gates]
  scan --> sign[Cosign keyless signatures]
  sbom --> promote{Selected runtime}
  sign --> promote
  promote --> compose[Compose .env.production immutable IMAGE_TAG]
  promote --> helm[Helm values image tags/digests]
  promote --> argo[Argo-tracked values commit or image updater]
  promote --> pm2[PM2 release directory/image when product-owned]
  compose --> migrate[Controlled PostgreSQL migration step]
  helm --> migrate
  argo --> migrate
  pm2 --> migrate
  migrate --> verify[/ready smoke, logs, rollback notes]
```

Every production mode starts from the same immutable source artifact: a reviewed
Git commit and images tagged with that commit SHA or addressed by digest. Mode
specific runbooks consume those artifacts; they should not rebuild from an
uncommitted worktree or deploy mutable tags such as `latest`, `main`, or `dev`.

## Validation commands are no-deploy checks

Run the validation command for the mode you intend to use:

| Mode                     | Command                                      | Helm needed?                                                        | What it does                                                                           |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Generic bundle           | `pnpm run deploy:validate`                   | No global requirement; Helm rendering is skipped if Helm is missing | Runs Docker static checks, optional GitOps/PM2 checks, and Helm static checks          |
| Docker/Compose           | `pnpm run deploy:validate:docker`            | No                                                                  | Validates deployment config and production Compose config                              |
| PM2                      | `pnpm run deploy:validate:pm2`               | No                                                                  | Validates `ecosystem.config.{js,cjs,mjs}` when present; otherwise reports a no-op skip |
| GitOps/Argo              | `pnpm run deploy:validate:gitops`            | No for manifest checks                                              | Validates `deploy/argocd/application.yaml` when GitOps mode is selected                |
| Helm                     | `pnpm run deploy:validate:helm`              | Yes                                                                 | Runs static Helm checks plus strict Helm render validation                             |
| Generic with Helm render | `REQUIRE_HELM=true pnpm run deploy:validate` | Yes                                                                 | Enforces Helm render validation in the generic bundle                                  |

These commands do not deploy: they do not run `docker compose up`, `helm
upgrade`, `kubectl apply`, Argo sync, or image pushes.

## Docker/Compose mode

Use Compose for local full-stack testing or a small single-server deployment.
See [docker-compose-production.md](docker-compose-production.md) for the actual
runbook.

Prerequisites for actual deployment:

- Docker Engine and Docker Compose plugin on the target host;
- an immutable image tag or digest for every service (`sha-<git-sha>` is the
  documented tag shape);
- `.env.production` derived from `.env.production.example` and edited for real
  domains, ports, CORS origins, and registry names;
- Docker secret files under `docker/secrets/` or an equivalent secret injection
  path, with committed examples treated as placeholders only;
- a backup plan for the PostgreSQL volume before migrations.

Preflight only:

```bash
pnpm run deploy:validate:docker
docker compose --env-file .env.production -f docker/docker-compose.prod.yml config
node scripts/validate-docker-compose-prod.mjs
```

Deployment, when intentionally performed by an operator, is the documented
`docker compose ... up -d` flow. Rollback is tag/digest based: restore the
previous immutable `IMAGE_TAG` or compose override, run the update command, and
restore the database backup only if the migrated schema is not backward
compatible.

## PM2 mode

PM2 is optional and not overclaimed as a supported default runtime. At the time
of this documentation, the repository does not include an
`ecosystem.config.{js,cjs,mjs}` file. Therefore:

```bash
pnpm run deploy:validate:pm2
```

is a no-op validation that reports the missing ecosystem config and exits
successfully. If a product adds an ecosystem config later, keep secrets in the
runtime environment or secret manager, do not reference committed production env
files, and use this command as the static PM2 preflight.

Actual PM2 deployment and rollback are operator-owned: keep the previous release
or image available, restart from the previous ecosystem config/environment on
rollback, and handle database compatibility with backups or corrective
migrations.

## Helm mode

Use Helm mode when directly releasing the app chart to Kubernetes. Helm 3 is
needed for strict render/lint validation and for actual `helm upgrade` or
`helm rollback` commands.

Prerequisites for actual Helm deployment:

- a Kubernetes cluster and kubeconfig supplied by the platform/operator;
- Helm 3 installed on the operator or CI runner;
- immutable app and migrator image tags or digests;
- a Kubernetes Secret or ExternalSecret-produced Secret referenced by
  `secrets.existingSecret`;
- platform-owned ingress/TLS, databases, observability, and backups ready before
  enabling corresponding chart features.

Strict preflight:

```bash
pnpm run deploy:validate:helm
# or make the generic bundle enforce Helm rendering:
REQUIRE_HELM=true pnpm run deploy:validate
```

Example direct deployment shape:

```bash
helm upgrade --install nest-react-boilerplate .helm \
  --namespace nest-react-boilerplate --create-namespace \
  --set-string secrets.existingSecret=nest-react-boilerplate-production-secrets \
  --set-string migrations.image.tag=$IMAGE_TAG \
  --set-string apps.authApi.image.tag=$IMAGE_TAG \
  --set-string apps.userApi.image.tag=$IMAGE_TAG \
  --set-string apps.adminApi.image.tag=$IMAGE_TAG \
  --set-string apps.landing.image.tag=$IMAGE_TAG \
  --set-string apps.userFrontend.image.tag=$IMAGE_TAG \
  --set-string apps.adminFrontend.image.tag=$IMAGE_TAG \
  --wait --timeout 10m
```

The chart runs the migration job as a Helm pre-install/pre-upgrade hook when
`migrations.enabled=true`. Backend probes use `/live` and `/ready`; frontend
probes use `/nginx-health` from the unprivileged nginx containers.

Verification:

```bash
kubectl get pods,svc,ingress -n nest-react-boilerplate
kubectl logs job/nest-react-boilerplate-migrate -n nest-react-boilerplate
kubectl rollout status deploy/nest-react-boilerplate-auth-api -n nest-react-boilerplate
curl -fsS https://auth.example.com/ready
```

Rollback:

```bash
helm history nest-react-boilerplate -n nest-react-boilerplate
helm rollback nest-react-boilerplate <revision> -n nest-react-boilerplate
kubectl rollout status deploy/nest-react-boilerplate-auth-api -n nest-react-boilerplate
```

If a migration is not backward compatible, restore the database backup first or
roll forward with a corrective migration.

## Helm + GitOps/Argo mode

Use GitOps mode when ArgoCD watches the app chart and values from Git. The
optional `deploy/argocd/application.yaml` manifest is a starting point, not a
requirement for non-GitOps deployments.

Preflight for the manifest:

```bash
pnpm run deploy:validate:gitops
```

For this mode, keep the ownership boundary clear:

- app repo: `.helm/`, app values, image tags/digests, app Secret references,
  migration hooks, Services, probes, and app ingress routes;
- platform repo: cluster creation, ArgoCD installation/projects, External
  Secrets/Vault, ingress controllers/Gateway API, DNS/TLS issuers, managed or
  in-cluster databases, observability, backup schedules, and disaster recovery.

Rollbacks are Git or image rollbacks: revert the Argo-tracked commit, values
change, image digest, or immutable tag, then let Argo reconcile. Use Argo health
and sync status plus the same Kubernetes smoke checks as Helm mode. Database
rollback rules remain migration-dependent.

## Build and publish images

All production modes that run containers need immutable images. Build each
deployable target and publish immutable tags:

```bash
IMAGE_TAG=$(git rev-parse --short HEAD)
docker build --target backend --build-arg NX_PROJECT=backend-admin-app-api --build-arg BUILD_OUTPUT=dist/apps/backend/admin-app-api -t ghcr.io/your-github-org/nest-react-boilerplate/admin-app-api:$IMAGE_TAG .
docker build --target backend --build-arg NX_PROJECT=user-app-api --build-arg BUILD_OUTPUT=dist/apps/backend/user-app-api -t ghcr.io/your-github-org/nest-react-boilerplate/user-app-api:$IMAGE_TAG .
docker build --target backend --build-arg NX_PROJECT=auth-app-api --build-arg BUILD_OUTPUT=dist/apps/backend/auth-app-api -t ghcr.io/your-github-org/nest-react-boilerplate/auth-app-api:$IMAGE_TAG .
docker build --target frontend --build-arg NX_PROJECT=landing-app --build-arg FRONTEND_OUTPUT=dist/apps/frontend/landing -t ghcr.io/your-github-org/nest-react-boilerplate/landing-app:$IMAGE_TAG .
docker build --target frontend --build-arg NX_PROJECT=user-app --build-arg FRONTEND_OUTPUT=dist/apps/frontend/app -t ghcr.io/your-github-org/nest-react-boilerplate/user-app:$IMAGE_TAG .
docker build --target frontend --build-arg NX_PROJECT=admin-app --build-arg FRONTEND_OUTPUT=dist/apps/frontend/admin -t ghcr.io/your-github-org/nest-react-boilerplate/admin-app:$IMAGE_TAG .
docker build --target migrator -t ghcr.io/your-github-org/nest-react-boilerplate/migrator:$IMAGE_TAG .
```

Push, scan, sign, and promote images according to the selected release process.
The commands match the current multi-target Dockerfile (`backend`, `frontend`,
`migrator`) and pass the Nx project/output arguments explicitly.

## Backup and restore

Use platform-native PostgreSQL backups when available. For manual app-level
backups:

```bash
pnpm db:backup -- --output backups/pre-release.dump
pnpm db:restore -- --input backups/pre-release.dump --dry-run
```

For in-cluster restores, run from a locked-down job/pod with network access to
the database and require `--yes`. For Compose restores, follow
[docker-compose-production.md](docker-compose-production.md#6-backup-and-restore).
