# Release and Kubernetes hardening

## Image immutability

Release images are built by `.github/workflows/release-images.yml` and pushed to
GHCR as `ghcr.io/<owner>/<repo>/<image>:sha-<git-sha>`. The workflow also emits
BuildKit provenance/SBOM attestations, uploads SPDX SBOM artifacts, scans image
digests with Trivy, and signs pushed digests with cosign keyless signing via
GitHub OIDC.

Production Helm values intentionally avoid `latest`. Prefer setting
`*.image.digest` to the pushed digest, or set every `*.image.tag` to the
workflow's `sha-<git-sha>` tag.

## Container image build (bake)

Application image ownership, Docker targets, and output slices come from
`appCatalog` in `packages/tooling/src/setup/catalog.ts`; the dedicated migrator
remains release-owned metadata. Setup writes the product's eligible image names
to `.nrb/closure.json` as `releaseImages`. `pnpm run bake:generate` validates
that closure against the live Nx graph and derives `docker-bake.json` for only
those images, with every app image sharing a single `NX_BUILD_PROJECTS` arg.
Pass `--only "a,b"` to reduce that selected set further; names outside the
closure fail instead of being silently dropped.

Affected Nx projects and migration paths are always intersected with selected
`releaseImages`. A global image input or `force_full` builds every selected
image, never every catalog image. Provider-free selections omit `migrator`;
PostgreSQL and MongoDB selections include it. Release and promotion fail closed
when `nrb.config.json`, `.nrb/closure.json`, or its generated manifests are
missing or stale. Run setup and commit the product-owned selection before using
those workflows.

The Dockerfile's `builder` stage compiles the workspace **once** —
`pnpm exec nx run-many -t build export --projects="${NX_BUILD_PROJECTS:-$NX_PROJECT}"`
— so shared libraries build a single time no matter how many app images are
requested in the same bake. Frontend (nginx) images copy only their per-app `dist/` output via `FRONTEND_OUTPUT`; backend and site-runtime images copy the shared builder's full `dist/` and select their entrypoint via the `BUILD_OUTPUT` environment variable, with only `node_modules`/`package.json` per-app pruned. Slicing each
backend/site image down to only its own app's `dist/` (plus its transitive
libs) is a possible future optimization; today the extra compiled output is
dormant (never executed — the entrypoint runs only `$BUILD_OUTPUT`) and the
identical `dist/` layer is registry-deduplicated across backend images.
Compose still passes the
legacy `NX_PROJECT` arg per service — the `${NX_BUILD_PROJECTS:-$NX_PROJECT}`
fallback keeps that path working unchanged.

`.github/workflows/release-images.yml` builds every planned image in one shared
`docker buildx bake` invocation (rather than a per-image matrix job), then loops
over the build's `--metadata-file` digests to run the SBOM/Trivy/cosign steps
above per image. Tag releases force a complete selected-closure build so every
selected and enabled GitOps workload can be promoted at that SHA. Manual runs
may retain affected-only planning until a promotable full selected build is
requested with `force_full`.

The release workflow does not prime Docker's `workspace` target directly. Both
dependency preparation and image output flow through the generated selected
Bake plan, whose every target carries the validated normalized
`nrb-closure=.nrb/closure` context.

GitOps promotion intersects the candidate revision's fresh closure
`releaseImages` with effective enabled ownership from `.helm/values.yaml`,
`.helm/values-production.yaml`, and the matching setup-generated
`.helm/values-selection.yaml` overlay. Initial and later promotions require an immutable
candidate digest for every image in that exact intersection. Missing required
digests and supplied unselected or disabled digests fail; images outside the
intersection keep their current values. Explicit all-reference contexts remain
maintainer-only and never participate in product promotion.

Local commands:

```bash
# generate a product Bake file from the current selected closure
pnpm run bake:generate

# regenerate it scoped to an affected subset (manual/non-tag planning)
node scripts/generate-bake-file.mjs --only "auth-app-api,user-app-api"

# explicit PostgreSQL all-reference maintainer artifact
pnpm run bake:generate:all

# materialize the equivalent complete MongoDB reference context
pnpm nrb closure materialize --all-reference --provider mongodb

# inspect the resolved plan without building anything
docker buildx bake -f docker-bake.json --print auth-app-api user-app-api

# build the scoped image set — the builder compiles once and both images share it
docker buildx bake -f docker-bake.json auth-app-api user-app-api
```

The all-reference Bake command attaches `.nrb/reference/postgres` to every
generated target as the `nrb-closure` named BuildKit context. Product Bake
generation remains selection-bound, attaches only the normalized
`.nrb/closure` context, and does not use reference contexts. Every generated
target has an explicit context; Bake generation rejects a missing context
instead of allowing Docker's default `.` context to provide dependency metadata.

Measured locally: building `auth-app-api` and `user-app-api` as two separate
image builds compiled the shared library graph twice (120s total); building
the same pair together via `docker buildx bake` compiles it once (99s total,
one `nx run-many` invocation) — see
[2026-07-23-build-baseline.md](superpowers/specs/2026-07-23-build-baseline.md)
for the full measurement. The release-workflow rewrite that drives this from
CI is static-validated (`--print`, `deploy:validate:docker`) pending a real CI
run.

## Helm validation

Run the same render gate as CI:

```bash
bash scripts/validate-helm.sh
# or
pnpm run helm:validate
```

The gate renders default and production values, rejects `:latest` in production,
and verifies nginx frontends point at Kubernetes Service DNS names.

## Runtime port and nginx behavior

API containers use their per-app Helm `apps.<name>.port` value as both
`containerPort` and the `PORT` environment variable. Node app images can bind
port 80 as a non-root user, so Services expose `servicePort: 80` and route by
named target port.

Frontend images still include the docker-compose nginx config for local use. In
Kubernetes, Helm mounts a rendered ConfigMap at
`/etc/nginx/conf.d/default.conf`; upstreams resolve to
`<release>-auth-app-api`, `<release>-user-app-api`, and
`<release>-admin-app-api` Services.
