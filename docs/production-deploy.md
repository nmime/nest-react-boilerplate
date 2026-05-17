# Production deployment with Kubernetes and Ansible

This repository follows the same separation used by `nmime/opwerf` with `nmime/ansible-k8s-full-setup`:

- the platform repository provisions Kubernetes, ingress, cert-manager, External Secrets, observability, databases, backups, and GitOps controllers;
- this application repository owns only app images, a small `.helm/` chart, environment overlays, migration jobs, services, probes, ingress, and rollback notes;
- production credentials are created outside the chart and referenced with `secrets.existingSecret`.

The live `opwerf` chart pattern inspected for this pass uses `.helm/values*.yaml`, `secrets.existingSecret`, ConfigMaps, Deployments, Services, Ingress/TLS, optional autoscaling/monitoring/network policy, and an ArgoCD example. The live Ansible platform repo documents direct `ansible-playbook` deployment with `group_vars/all.yml`, `inventory/hosts.yml`, Gateway API, Vault/External Secrets-ready secret ownership, PostgreSQL backups, `kubectl`/`helm` verification, rollback, and troubleshooting commands.

## 1. Bootstrap platform

Use `ansible-k8s-full-setup` from an operator workstation, matching the live repository README:

```bash
git clone https://github.com/nmime/ansible-k8s-full-setup.git
cd ansible-k8s-full-setup
export HCLOUD_TOKEN="..."
cp group_vars/all.yml.example group_vars/all.yml
# edit group_vars/all.yml: domain, hcloud_token lookup, cluster size, optional PostgreSQL/Dragonfly/Temporal, edge CDN
ansible-playbook -i inventory/hosts.yml site.yml
```

For app workloads, enable the platform services you depend on (PostgreSQL, ingress/Gateway API, cert-manager, Vault/External Secrets, monitoring, and backups) in `group_vars/all.yml`; keep app-specific chart values in this repository.

Keep application-specific values generic in this repo; put cluster addresses, secret backends, and DNS ownership in platform inventory.

## 2. Build and publish images

Build each deployable target and publish immutable tags:

```bash
IMAGE_TAG=$(git rev-parse --short HEAD)
docker build --target backend --build-arg NX_PROJECT=backend-admin-app-api --build-arg BUILD_OUTPUT=dist/apps/backend/admin-app-api -t ghcr.io/your-github-org/nest-react-boilerplate/admin-app-api:$IMAGE_TAG .
docker build --target backend --build-arg NX_PROJECT=user-app-api --build-arg BUILD_OUTPUT=dist/apps/backend/user-app-api -t ghcr.io/your-github-org/nest-react-boilerplate/user-app-api:$IMAGE_TAG .
docker build --target backend --build-arg NX_PROJECT=auth-app-api --build-arg BUILD_OUTPUT=dist/apps/backend/auth-app-api -t ghcr.io/your-github-org/nest-react-boilerplate/auth-app-api:$IMAGE_TAG .
docker build --target frontend --build-arg NX_PROJECT=landing-app --build-arg FRONTEND_OUTPUT=dist/apps/frontend/landing -t ghcr.io/your-github-org/nest-react-boilerplate/landing-app:$IMAGE_TAG .
docker build --target frontend --build-arg NX_PROJECT=user-app --build-arg FRONTEND_OUTPUT=dist/apps/frontend/app -t ghcr.io/your-github-org/nest-react-boilerplate/user-app:$IMAGE_TAG .
docker build --target frontend --build-arg NX_PROJECT=admin-app --build-arg FRONTEND_OUTPUT=dist/apps/frontend/admin -t ghcr.io/your-github-org/nest-react-boilerplate/admin-app:$IMAGE_TAG .
docker build --target migrator -t ghcr.io/your-github-org/nest-react-boilerplate/migrator:$IMAGE_TAG .
docker push ghcr.io/your-github-org/nest-react-boilerplate/admin-app-api:$IMAGE_TAG
docker push ghcr.io/your-github-org/nest-react-boilerplate/user-app-api:$IMAGE_TAG
docker push ghcr.io/your-github-org/nest-react-boilerplate/auth-app-api:$IMAGE_TAG
docker push ghcr.io/your-github-org/nest-react-boilerplate/landing-app:$IMAGE_TAG
docker push ghcr.io/your-github-org/nest-react-boilerplate/user-app:$IMAGE_TAG
docker push ghcr.io/your-github-org/nest-react-boilerplate/admin-app:$IMAGE_TAG
docker push ghcr.io/your-github-org/nest-react-boilerplate/migrator:$IMAGE_TAG
```

The commands match the current multi-target Dockerfile (`backend`, `frontend`, `migrator`) and pass the Nx project/output arguments explicitly.

## 3. Create namespace and secrets

```bash
kubectl create namespace nest-react-boilerplate
kubectl create secret generic nest-react-boilerplate-production-secrets \
  -n nest-react-boilerplate \
  --from-literal=AUTH_JWT_SECRET='replace-from-secret-manager' \
  --from-literal=DATABASE_URL='postgres://user:password@postgresql:5432/nest_react_boilerplate'
```

Prefer External Secrets Operator/Vault in production. The inline command above is only a shape example.

## 4. Deploy with Helm

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

The chart runs the migration job as a Helm pre-install/pre-upgrade hook when `migrations.enabled=true`.

## 5. Ingress, TLS, and probes

Enable ingress once DNS and cert-manager are ready:

```bash
helm upgrade --install nest-react-boilerplate .helm \
  --namespace nest-react-boilerplate \
  --set ingress.enabled=true \
  --set-string ingress.tls[0].secretName=nest-react-boilerplate-tls
```

Backend probes use `/live` and `/ready`; frontend probes use `/`. `auth-app-api` readiness checks PostgreSQL because MikroORM is registered there.

## 6. Verification

```bash
kubectl get pods,svc,ingress -n nest-react-boilerplate
kubectl logs job/nest-react-boilerplate-migrate -n nest-react-boilerplate
kubectl rollout status deploy/nest-react-boilerplate-auth-api -n nest-react-boilerplate
curl -fsS https://auth.example.com/ready
```

## 7. Backup and restore

Use platform-native PostgreSQL backups when available. For manual app-level backups:

```bash
pnpm db:backup -- --output backups/pre-release.dump
pnpm db:restore -- --input backups/pre-release.dump --dry-run
```

For in-cluster restores, run from a locked-down job/pod with network access to the database and require `--yes`.

## 8. Rollback

```bash
helm history nest-react-boilerplate -n nest-react-boilerplate
helm rollback nest-react-boilerplate <revision> -n nest-react-boilerplate
kubectl rollout status deploy/nest-react-boilerplate-auth-api -n nest-react-boilerplate
```

If a migration is not backward compatible, restore the database backup first or roll forward with a corrective migration.
