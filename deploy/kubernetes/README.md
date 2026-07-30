# Direct Kubernetes deployment

This directory documents the direct Helm release path. The chart itself lives in
`.helm/` so the same artifact is consumed by direct Helm, Argo CD, and Flux.

## Prerequisites

1. Run `pnpm nrb init` and commit product-owned names, registry paths, and domains.
2. Publish `sha-<full-git-sha>` images for every workload that is both in the
   fresh setup-selected closure and enabled in Helm, including the migrator only
   for a durable-provider selection with migrations enabled. Record each digest.
3. Provision reachable Redis and either PostgreSQL or a transaction-capable,
   multi-node MongoDB replica set; the app chart does not own their lifecycle.
4. Provision the Secret referenced by `secrets.existingSecret` with at least
   `SESSION_SECRET`, `BETTER_AUTH_SECRET`, and the selected database credential:
   `DATABASE_URL` for PostgreSQL or a replica-set `MONGODB_URI` for MongoDB. A
   MongoDB release also needs the separate Secret named by
   `migrations.mongodbExistingSecret` with `MONGODB_MIGRATION_URI`. If backups
   are enabled, the Secret named by `backups.mongodb.existingSecret` must contain
   a deployment-wide `MONGODB_BACKUP_RESTORE_URI` for an `admin`-authenticated
   principal with the built-in `backup` and `restore` roles plus the custom
   `anyAction` on `anyResource` role required for oplog replay.
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
  -f .helm/values-selection.yaml \
  --namespace nest-react-boilerplate > /tmp/nest-react-boilerplate.yaml
```

Review the rendered image tags, Secret reference, namespace, ingress hosts,
resource requests/limits, probes, migration Job, NetworkPolicies, and optional
CRD-backed monitoring resources before release.

For an existing release, add live API schema, admission, rollout, rollback, and
backup evidence without changing cluster state:

```bash
node scripts/validate-kubernetes-live.mjs \
  --context production-preflight \
  --namespace nest-react-boilerplate \
  --release nest-react-boilerplate \
  --backup-cronjob nest-react-boilerplate-postgres-backup
```

The command requires an explicit kubeconfig context and persists no cluster
changes. It performs read queries, local rendering, `--dry-run=server`, and
`--no-hooks` rollback simulation. It:

- submits the candidate render through strict server-side apply validation so
  installed CRD schemas and dry-run-safe admission policies evaluate it; the
  dry-run uses `--force-conflicts` so fields owned by Helm, Argo CD, or Flux do
  not produce false failures and no ownership is persisted;
- checks current Deployment rollout status and requires at least one usable
  previous Helm revision;
- runs Helm upgrade and rollback simulations against the server without
  persisting resources or executing migration hooks;
- requires the selected backup CronJob to be active with a successful run no
  older than 90 minutes, then submits its Job template through server dry-run.

Use `--backup-cronjob` for a platform-owned backup job and
`--max-backup-age-minutes` to match the approved RPO. A first install cannot
prove current rollout or rollback history; use the static Helm/kubeconform gate,
then run this live preflight before the next promotion. The command intentionally
fails rather than treating missing history or backup evidence as success.

### Live preflight authorization

`production-preflight` is a non-persisting context, not a read-only identity.
Kubernetes authorization does not grant lesser verbs for server dry-run, so the
identity must be allowed to perform the simulated mutations. For the checked-in
production values it needs:

- `get`, `list`, and `watch` for Deployments, `get` for the selected CronJob,
  and `get`/`list` for Helm release Secrets in the release namespace;
- `create`, `patch`, `update`, and `delete` for ConfigMaps, Services,
  ServiceAccounts, Deployments, Jobs, Ingresses, NetworkPolicies,
  HorizontalPodAutoscalers, PodDisruptionBudgets, PrometheusRules, and
  ServiceMonitors rendered in the release and `coroot` namespaces;
- the same simulated mutation verbs for the chart-owned `coroot` Namespace,
  ClusterRole, and ClusterRoleBinding at cluster scope;
- `create` for the backup preflight Job in the release namespace.

Product overlays that render additional resource kinds need the corresponding
verbs. Admission webhooks used by the cluster must declare dry-run-safe side
effects. Confirm the dedicated identity before use with `kubectl auth can-i`;
do not reuse a broad deployment credential merely to make this preflight pass.

## Install or upgrade

```bash
helm upgrade --install nest-react-boilerplate .helm \
  -f .helm/values.yaml \
  -f .helm/values-production.yaml \
  -f .helm/values-selection.yaml \
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

Record the rollback in Git/production values. Restore the selected database
provider only when the migration contract requires it, using the matching
PostgreSQL or MongoDB restore workflow; otherwise prefer a corrective forward
migration.
