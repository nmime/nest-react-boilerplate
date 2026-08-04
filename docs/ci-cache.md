# CI computation cache

The CI workflow uses `.github/actions/nx-cache` to persist Nx task outputs in
the GitHub Actions cache service. It is intentionally a remote cache without a
separate Nx Cloud, S3, or MinIO credential: the workflow receives no cache
token, and GitHub applies the repository and branch cache-access rules.

Each job has a stable cache scope (`quality`, `e2e`, and so on) to avoid racing
multiple cache uploads for the same key. A new commit restores the most recent
scope cache, then Nx validates every task hash before reusing an output; changed
sources, environment inputs, or declared dependencies execute normally.

Only `.nx/cache` is persisted. Do not add `.env*`, Docker credentials,
`node_modules`, test secrets, or generated deployment credentials to this cache.
Fork pull requests can restore permitted base caches, but they do not receive
deployment secrets and cannot write to the protected default-branch cache.

## Opt-in: shared Nx Cloud / object-store backend

For an organization that wants a single cache shared across every job (and across
developer machines) instead of the per-scope GitHub caches, layer a dedicated
backend on top. Keep this GitHub cache as the no-secret fallback, and never put a
remote-cache token in `nx.json`, source code, image build args, or production
environment files.

To enable **Nx Cloud** (no `nx.json` secret required):

1. Run `pnpm exec nx connect` once — this adds a non-secret `nxCloudId` to `nx.json`.
2. Add the access token as the protected repository secret `NX_CLOUD_ACCESS_TOKEN`.
3. Expose it to each compute job (`fast-check`, `non-runtime-validation`,
   `bun-compat`, `quality`, `e2e`, `visual-regression`) with a job-level env — never
   the workflow top-level `env` (the `secrets` context is not available there) and
   never `.github/actions/nx-cache` (the composite action must stay secret-free):

   ```yaml
   jobs:
     quality:
       env:
         NX_CLOUD_ACCESS_TOKEN: ${{ secrets.NX_CLOUD_ACCESS_TOKEN }}
   ```

   When the secret is unset the value is empty and Nx silently falls back to the
   GitHub Actions cache service, so adding the line is a safe no-op until you
   provision the backend.

### Self-hosted cache, shared by GitLab and GitHub

Nx is pinned at 23.1.0, and two things that older guides recommend do not work
here. `@nx/s3-cache` declares `peerDependencies: { "nx": ">= 18 < 23" }`, so it
cannot be installed against this version without dragging a second `@nx/devkit`
major into the closure. Custom task runners are worse than unsupported: they are
silently ignored. `getTasksRunnerPath()` in `nx/dist/src/tasks-runner/run-command.js`
only ever resolves `nx-cloud` or the built-in runner, so a
`tasksRunnerOptions.default.runner` pointing at an S3 runner is accepted by the
schema, produces a green build, and caches nothing. Verify by observing a remote
cache hit, never by "it didn't error".

The supported path is the HTTP cache, configured entirely by environment:

| Variable                                   | Meaning                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `NX_SELF_HOSTED_REMOTE_CACHE_SERVER`       | Base URL. Nx calls `GET`/`PUT` on `<base>/v1/cache/<hash>` with `application/octet-stream`. |
| `NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN` | Bearer token.                                                                               |

**A bucket URL will not work.** MinIO and S3 do not implement that protocol; a
raw bucket endpoint 404s or 403s on every retrieve and store, and Nx degrades to
local-only _without failing the build_. Run a small cache server in front of the
bucket.

In this repository the GitLab side is already wired: `.gitlab-ci.yml`'s `.node`
template reads `NX_REMOTE_CACHE_URL`, `NX_REMOTE_CACHE_TOKEN_READ` and
`NX_REMOTE_CACHE_TOKEN_WRITE` from protected, masked CI variables. Writes are
restricted to the default branch — an MR pipeline that can write entries `main`
later reads is a supply-chain write primitive, not a cache.

Two correctness prerequisites, both of which are now satisfied and both of which
must stay satisfied:

- **Task inputs must be honest.** A shared cache turns a local-only
  under-invalidation bug into a cross-machine false green. The worst case here
  was `@app/backend-common-tenant-policy:test`, the guard asserting that every
  tenant-scoped table has a row-level-security policy: it scans entity sources
  across `libs/backend/postgres/main` and did not declare them as inputs, so a
  new table could be added and the guard replayed green from cache. Its
  `project.json` now declares
  `{workspaceRoot}/libs/backend/postgres/main/**/*.entity.ts`.
- **Platform must be in the hash.** GitHub runs `ubuntu-22.04` (glibc), GitLab
  runs `node:24.18.0-alpine` (musl). `nx.json`'s `sharedGlobals` therefore
  includes a runtime input of node version, platform and arch, so the two
  providers cannot replay each other's binary-bearing outputs.

Fork pull requests receive no secrets, so these variables are empty there and Nx
falls back to the local cache. That is intended; a fork's slower run is not a
cache regression.
