# Production deployment

Production starts from one reviewed Git commit and immutable images tagged
`sha-<full-40-character-git-sha>` or pinned by digest. The repository supports
single-host Compose, direct Helm, and Helm through Argo CD or Flux. PM2 remains
an opt-in extension only when a product adds and owns an ecosystem config.

Use the canonical runbooks:

- mode matrix and invariants: [deployment.md](deployment.md)
- Compose with bundled or external PostgreSQL:
  [docker-compose-production.md](docker-compose-production.md)
- idempotent host Nginx + Certbot deployment:
  [single-server-deployment.md](single-server-deployment.md)
- direct Kubernetes/Helm: [deploy/kubernetes/README.md](../deploy/kubernetes/README.md)
- Argo CD and Flux GitOps: [GITOPS.md](../GITOPS.md)
- environment keys: [environment-variables.md](environment-variables.md)
- production checklist: [production-readiness.md](production-readiness.md)

## Artifact flow

```mermaid
flowchart LR
  commit[Reviewed Git SHA] --> release[Release images workflow]
  release --> verify[SBOM, scan, signature, immutable full-SHA tags]
  verify --> runtime{Selected runtime}
  runtime --> compose[Compose database + domain + TLS topology]
  runtime --> helm[Direct Helm]
  runtime --> gitops[Promotion PR then Argo CD or Flux]
  compose --> migrate[Controlled migration]
  helm --> migrate
  gitops --> migrate
  migrate --> ready[/ready and rollout verification]
```

## Required preflight

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run deploy:validate
```

Then run the strict selected-mode command:

```bash
pnpm run deploy:validate:docker
pnpm run deploy:validate:helm
pnpm run deploy:validate:gitops
```

The commands are no-deploy checks. CI additionally requires Docker Compose,
Helm, and kubectl rendering so missing local tools cannot silently approve a
broken release contract.

## Compose

Select database ownership, public-domain ownership, and TLS ownership in
`.env.production`, then render the complete model:

```bash
pnpm run docker:prod:config
```

Bundled mode creates PostgreSQL and a persistent volume. External mode mounts a
`DATABASE_URL` secret file and contains no PostgreSQL service, volume, or
password secret. Both modes run the migrator before APIs. The production base
file is not a standalone topology. Domain modes support one public hostname,
deterministic per-app hostnames with explicit or wildcard DNS, or an existing
external proxy. See the Compose runbook for automatic and provided TLS modes.

## Direct Helm

The current supported Helm line is Helm 4; CI pins `v4.2.2`. Match the Helm
support policy to the target Kubernetes version. Provision the app Secret,
registry pull Secret, PostgreSQL, Redis, ingress, DNS, TLS, and backups before
installing the chart.

```bash
helm upgrade --install nest-react-boilerplate .helm \
  -f .helm/values.yaml \
  -f .helm/values-production.yaml \
  --namespace nest-react-boilerplate \
  --create-namespace --atomic --wait --timeout 10m
```

## GitOps

Choose one controller for a release:

```bash
kubectl apply -k deploy/argocd
# or
kubectl apply -k deploy/flux
```

Run the manual **Promote GitOps release** workflow with the exact source SHA
after release images exist. It verifies all 11 images and opens a promotion PR.
Only a reviewed merge changes the desired production version.

## Backup, verification, and rollback

Before migrations, verify a recoverable database backup. After rollout, check
migration completion, workload rollout status, `/ready`, logs, ingress/TLS, and
the public domain map.

Compose rollback restores the previous immutable `IMAGE_TAG` and reruns the
selected mode. Direct Helm uses `helm history` and `helm rollback`. GitOps
reverts or supersedes the promotion commit and lets the controller reconcile.
Database restoration is required only when the schema is incompatible with the
previous application; otherwise prefer a corrective forward migration.
