# Release and Kubernetes hardening

## Endpoint manifest and release smoke harness

`packages/tooling/baselines/endpoint-manifest.generated.json` is the canonical
endpoint inventory of the release: every HTTP route (Nest controller decorators
discovered statically), every committed non-HTTP endpoint (bot commands, cron
wrappers, consumer loops, from the feature `*EndpointRegistry` modules), and
every frontend route (admin/user route registries, Astro pages, site pages).
Each row carries an auth classification, a coverage classification with test
evidence, and — for every externally reachable row — a smoke classification.
The Better Auth `/api/auth/*` surface is an honestly delegated row: its source
is the static catch-all controller, its evidence is
`libs/backend/feature/auth/main/lib/src/application/better-auth-runtime-contract.spec.ts`
(which pins the child-route behavior the handler forwards to), and its smoke
classification is `delegated-runtime`, so the HTTP smoke reports it explicitly
instead of invoking it.

### Commands

```bash
# regenerate the baseline from source and rewrite the checked-in manifest
pnpm run endpoints:manifest:generate

# gate: fail on any new, removed, re-classified, duplicate, unclassified,
# malformed, or missing source/evidence row
pnpm run endpoints:manifest:check

# deployment instrument: run the classified HTTP smoke matrix against live
# base URLs (requires the base URL env vars below; refuses to pass otherwise)
pnpm run release:smoke
```

### Release smoke: what it invokes and what it expects

`release:smoke` consumes the checked-in manifest and issues GET-only probes
against each row's `baseUrlEnv` (missing base URL is a hard failure that names
the variable). Per-origin cookie jars persist `Set-Cookie` across a run, and a
seeded session comes from `<BASE_URL_ENV with _BASE_URL replaced by
_SESSION_COOKIE>` (e.g. `ADMIN_API_BASE_URL` + `ADMIN_API_SESSION_COOKIE`),
taking a cookie-header value. Cookie values are used in requests only and
never appear in output.

| Classification        | Probed as                                       | Expected                                                                                                                                                                                                                              |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `automatic`           | one anonymous GET                               | 2xx (health/live/ready, public pages)                                                                                                                                                                                                 |
| `cookie-session`      | one GET with the per-origin jar                 | 2xx or 3xx (SPA shells)                                                                                                                                                                                                               |
| `public-conditional`  | one anonymous GET                               | 2xx when enabled/reachable, 4xx when disabled or off-network (`/docs`, `/docs/openapi.json`, `/health/private`)                                                                                                                       |
| `rbac-allowed-denied` | anonymous GET, then GET with the session cookie | denied half must be 401/403 (the guard runs before any lookup); allowed half must match the row's `expectedStatusClasses` — 2xx, plus 404 for parameterized routes probed with the sentinel id `00000000-0000-0000-0000-000000000000` |
| `delegated-runtime`   | not invoked                                     | reported explicitly; pinned by the runtime-contract spec                                                                                                                                                                              |
| `manual-fixture`      | never invoked (state-changing methods)          | reported explicitly                                                                                                                                                                                                                   |
| `signed-provider`     | not invoked (needs provider signatures)         | reported explicitly                                                                                                                                                                                                                   |

Refusal semantics, all before any probe when applicable:

- An externally reachable row without a smoke classification is a hard
  refusal that lists the offending rows.
- A malformed manifest (invalid JSON, `schemaVersion` other than 1,
  non-array `rows`, missing or invalid fields/classifications) is a hard
  failure that names the row and field.
- An anonymous probe to a session-gated route that is not denied (401/403)
  fails the run and prints the unexpected status.
- An `rbac-allowed-denied` row whose allowed half cannot be verified because
  no session cookie was seeded is counted in `rbacAllowedUnverified` and
  reported per row — the harness never shrinks its evidence silently.
- Sensitive query values (`token`, `secret`, `password`, `code`, `key`,
  `cookie`, `session`) are replaced with `[REDACTED]` in all output.

### Gate wiring (exact)

- Root `package.json` chains: `check:fast` and `ci:pr` run
  `pnpm run endpoints:manifest:check` immediately after
  `pnpm run tooling:static-check`. The check is a standalone tooling command
  (`nrb endpoints:manifest --check`); `tooling:static-check`'s JSON output
  keys are unchanged.
- The `packages/tooling` unit suite (`node --test` via
  `packages/tooling/scripts/run-tests.mjs`) runs
  `packages/tooling/src/commands/release/endpoint-manifest.test.ts`, which
  re-discovers every source and diffs it against the checked-in baseline —
  the same gate also runs inside the unit lane.
- `release-smoke.test.ts` in the same suite pins the harness against an
  ephemeral local HTTP server: cookie jar, redaction, status matching,
  rbac denied/allowed halves, refusal, and malformed-manifest hard failures.

Deployment-time consumer: section E of the release acceptance matrix at
`/home/daytona/release-audit/release-acceptance-matrix.md` (boot every
backend from built dist, request every endpoint family, authenticated
session/RBAC flows and negative cases). The harness above is the executable
form of that section's HTTP matrix; the matrix file is an audit artifact and
is referenced, not edited, by this repository.

## Image immutability

Release images are built by the `release-images` job in `.gitlab-ci.yml` and
pushed as `<registry>/<owner>/<repo>/<image>:sha-<git-sha>`. The job also emits
BuildKit provenance/SBOM attestations, uploads SPDX SBOM artifacts, scans image
digests with Trivy, and signs pushed digests with cosign keyless signing via the
forge OIDC identity.

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
`pnpm exec nx run-many -t build export --projects="${NX_BUILD_PROJECTS:-$NX_PROJECT}"`.
Per-image `RUNTIME_PROJECT`, `BUILD_OUTPUT`, and `FRONTEND_OUTPUT` are declared
only in later slice stages so BuildKit reuses one compile layer across Bake
targets. Frontend (nginx) images copy only their per-app `dist/` output via
`FRONTEND_OUTPUT`; backend and site stages then prune `node_modules` from that
app's generated lockfile. Compose still passes the
legacy `NX_PROJECT` arg per service — the `${NX_BUILD_PROJECTS:-$NX_PROJECT}`
fallback keeps that path working unchanged.

The `release-images` job builds every planned image in one shared
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
