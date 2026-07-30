# Production deployment

Production starts from one reviewed Git commit and images published under
`sha-<full-40-character-git-sha>` tags or pinned by digest. A digest is the
immutable artifact identity; a SHA-shaped registry tag still requires
repository policy that prevents mutation. The repository supports
single-host Compose, direct Helm, and Helm through Argo CD or Flux. PM2 remains
an advanced native Node path through the shipped `ecosystem.config.cjs`.

Use the canonical runbooks:

- mode matrix and invariants: [deployment.md](deployment.md)
- Compose with bundled or external PostgreSQL/MongoDB:
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
  commit[Reviewed Git SHA + current selected closure] --> release[Release selected images workflow]
  release --> verify[Signed SBOM, passing scan, SLSA provenance, signature, and digest]
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

Run `pnpm nrb setup` and `pnpm nrb closure check` before release. The release
planner intersects affected and force-full image sets with
`.nrb/closure.json`'s `releaseImages`; force-full means all selected images.
`pnpm run bake:generate:all` explicitly materializes the PostgreSQL
all-reference context for maintainer validation and attaches it to every Bake
target as the `nrb-closure` BuildKit context. MongoDB maintainers can run
`pnpm nrb closure materialize --all-reference --provider mongodb`. Neither path
is an implicit product fallback or used by product release/deploy workflows.
Product Bake and source Compose builds instead validate and attach the normalized
`.nrb/closure` context produced by `pnpm nrb closure install`. Dockerfile reads
all closure/config/package/workspace/lock metadata with
`COPY --from=nrb-closure`; the default source context cannot substitute it.

## Compose

Select database ownership, public-domain ownership, and TLS ownership in
`.env.production`, then render the complete model:

```bash
pnpm run docker:prod:config
```

`DATABASE_ENGINE` selects PostgreSQL or MongoDB independently from
`COMPOSE_DATABASE_MODE`. Bundled mode creates the selected service and a
persistent volume; bundled MongoDB is a one-node replica set and is not HA.
External mode mounts `DATABASE_URL` or `MONGODB_URI` from a secret file and
contains no database service/volume. Both modes run the provider-aware migrator before APIs. The production base
file is not a standalone topology. Domain modes support one public hostname,
deterministic per-app hostnames with explicit or wildcard DNS, or an existing
external proxy. See the Compose runbook for automatic and provided TLS modes.
MongoDB uses separate runtime, migration, and backup/restore principals in both
ownership modes; only the runtime credential reaches application containers.

## Direct Helm

The current supported Helm line is Helm 4; CI pins `v4.2.3`. Match the Helm
support policy to the target Kubernetes version. `pnpm run helm:validate`
downloads the pinned kubeconform `v0.8.0` binary into the ignored local tool
cache when it is not already installed, verifies the official archive checksum,
and performs strict Kubernetes schema validation. Provision the app Secret,
registry pull Secret, the selected external PostgreSQL or multi-node MongoDB
replica set, Redis, ingress, DNS, TLS, and backups before
installing the chart.

```bash
helm upgrade --install nest-react-boilerplate .helm \
  -f .helm/values.yaml \
  -f .helm/values-production.yaml \
  -f .helm/values-selection.yaml \
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
after release images exist. It verifies the selected closure at that source
revision, intersects its `releaseImages` with enabled Helm deployment ownership,
using the matching setup-generated `.helm/values-selection.yaml`, and requires
every digest in that exact set. A registry manifest is not sufficient: each selected
digest must have a valid keyless signature from the exact release workflow and
source SHA plus signed SPDX SBOM, SLSA provenance, and passing Trivy policy
attestations. The workflow opens `release/gitops-sha-<full-sha>` and creates a
promotion PR. Tag-triggered image releases build the complete selected closure
set; use `force_full` for a promotable manual image run. Unselected or disabled
image values are not promoted.
Only a reviewed merge changes the desired production version.

## Backup, verification, and rollback

Before migrations, verify a recoverable selected-provider backup. After rollout, check
migration completion, workload rollout status, `/ready`, logs, ingress/TLS, and
the public domain map.

Compose rollback restores the previous verified `IMAGE_TAG` or digest and reruns the
selected mode. Direct Helm uses `helm history` and `helm rollback`. GitOps
reverts or supersedes the promotion commit and lets the controller reconcile.
Database restoration is required only when the schema is incompatible with the
previous application; otherwise prefer a corrective forward migration.

For an existing Kubernetes release, run the explicit-context, no-mutation live
preflight from the direct Kubernetes runbook. It uses strict server-side dry-run
for candidate admission and rollback, checks current rollout and release
history, and requires a recent successful backup before release approval.
