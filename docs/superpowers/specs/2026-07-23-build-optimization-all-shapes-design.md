# Build optimization across all shapes — design

- **Date:** 2026-07-23
- **Status:** Approved — image build strategy Option A confirmed by owner 2026-07-23
- **Branch:** `chore/build-optimization-all-shapes`
- **Owner:** build/deploy tooling

## Context

The repository already ships a mature, well-optimized build and deploy system
across every delivery shape:

- **Docker** — one unified multi-stage `Dockerfile`; Alpine base; pnpm
  `fetch` + `--offline --frozen-lockfile` install layering; BuildKit cache
  mounts for Nx; pruned per-app dependency graphs
  (`generatePackageJson`/`generateLockfile`/`excludeLibsInPackageJson`);
  non-root runtime everywhere (`su-exec`, `nginx-unprivileged`, `setcap`);
  secret-loading entrypoint. Release adds SBOM + Trivy + cosign signing.
- **Local** — `pnpm dev` fullstack orchestrator, profile-gated compose,
  single-postgres dev DB, Vite 8/Rolldown HMR.
- **Helm** — a single **generic** chart that loops `.Values.apps` (no
  hardcoded app list in templates); readiness/liveness/startup probes; HPA;
  PDB; NetworkPolicy; production security contexts; observability stack;
  backup CronJob.
- **GitOps** — both ArgoCD and Flux entrypoints; digest-pinned two-stage
  promotion via PR; semantic-release.
- **CI** — 13-job GitHub Actions pipeline + GitLab mirror; Nx GitHub-Actions
  cache; `nx affected` on PRs; Bun-compat gate.

This is a polish-and-verify effort, not a rescue. The audit surfaced a small
set of concrete, worthwhile candidates:

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                 | Type              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1   | Buildable-image "universe" hand-maintained across ~4 files that must stay in sync (`scripts/release-image-plan.mjs`, `docker/docker-compose.yml`, `docker/docker-compose.prod.build.yml`, `packages/tooling/src/setup/catalog.ts`)                                                                                                                                                                                                      | Config drift risk |
| 2   | No `readOnlyRootFilesystem` on any container                                                                                                                                                                                                                                                                                                                                                                                            | Hardening gap     |
| 3   | No committed `values-staging.yaml` (only a recipe comment)                                                                                                                                                                                                                                                                                                                                                                              | Completeness      |
| 4   | HPA is CPU-only (no memory / custom metrics)                                                                                                                                                                                                                                                                                                                                                                                            | Scaling           |
| 5   | Backend builds via `tsc` (needs path-transform); no `composite`/`incremental`                                                                                                                                                                                                                                                                                                                                                           | Build speed       |
| 6   | Frontend Vite builds use defaults (no explicit chunking/compression/budgets)                                                                                                                                                                                                                                                                                                                                                            | Bundle size       |
| 7   | **Shared libs recompile once per app image in the release CI matrix** — each image runs `nx run <app>:build` on its own runner; the Nx cache is a BuildKit cache mount that `cache-to: type=gha` does not export, and the `builder` layer is keyed by `NX_PROJECT`, so lib compilation is never shared across images (local `nx run-many` is unaffected — libs build once there) — resolved by Option A (build-once + bake), 2026-07-23 | Build speed       |

## Goals

All four requested outcomes are in scope:

1. **Verify it all works** — build every Docker target, boot compose (dev +
   prod modes), render/lint the Helm chart, run local — prove each shape works
   and fix any breakage.
2. **Faster build & run** — measured reductions in build time (CI + local +
   image) and runtime startup/footprint; only keep changes that beat baseline.
3. **Config unification** — the image universe derives from a single source
   (Nx project metadata/tags), removing the hand-maintained-list drift class.
4. **Close hardening gaps** — `readOnlyRootFilesystem`, committed
   `values-staging.yaml`, HPA memory metric, and anything else the audit turns
   up.

## Non-goals

- Standing up a local `kind`/`k3d` cluster. Helm verification is
  `helm lint` + `helm template` (both value sets) + existing validators. No
  live `helm install`.
- Introducing Nx Cloud or any external remote-cache credential (S3/MinIO).
  The GitHub-Actions cache strategy stays as-is by deliberate project policy.
- Adopting distroless base images. The runtime needs a shell
  (`secret-entrypoint.sh`, `sh -c` CMD); Alpine + non-root already covers the
  size/CVE goal. Documented as considered-and-rejected.
- Unrelated refactoring outside the build/deploy surface.

## Approach: verify-first, phased (Approach A)

Establish a green, measured baseline across every shape **first**, then change
one bounded phase at a time and re-verify after each. The baseline is both the
deliverable for goal #1 and the before/after yardstick for goal #2. Rejected
alternatives: optimize-first/verify-last (no baseline, unattributable
regressions) and parallel worktrees (all workstreams touch the same files).

### Phase 0 — Baseline & verify (goal #1)

Capture a baseline table and confirm green:

- Every Docker target built cold and warm (`workspace`, `migrator`, `builder`,
  `backend`, `site-runtime`, `frontend`) — record wall-clock + final image
  size per target.
- Build several backend app images in sequence and isolate how much of each
  build is shared-lib recompilation (finding #7) — the number that justifies
  the Phase 3 build-once restructure.
- Dev compose boots (`docker/docker-compose.yml` selected/fullstack); prod
  compose config + boot for `bundled-db` and `external-db` modes
  (`scripts/compose-production.mjs`).
- `helm lint` + `helm template` against `values.yaml` and
  `values.yaml + values-production.yaml`; `pnpm deploy:validate`
  (docker/helm/gitops/pm2).
- Local `nx run-many -t build`, `typecheck`, and a representative `test` run —
  cold (cleared Nx cache) and warm.
- Frontend production bundle sizes per SPA + the Vike/site server build.

**Deliverable:** `docs/superpowers/specs/2026-07-23-build-baseline.md` (or an
appendix to this doc) with the numbers, plus fixes for anything found broken.

### Phase 1 — Config unification (goal #3)

Make the image catalog derive from a single source of truth rather than the
~4 hand-maintained lists.

- **Source of truth:** per-project metadata on the Nx graph — a small
  `metadata` block in each buildable `project.json` carrying the image name,
  build target, and any build args the release plan needs, discovered via a
  `docker:image` tag. `migrator` (not an Nx project) is handled by an explicit
  path rule as today.
- **Consumers derived from it:** `scripts/release-image-plan.mjs`
  candidate list, the compose service set, and `catalog.ts` grouping.
- **Method (behavior-preserving, TDD):** first add/extend a spec that asserts
  the derived list **exactly equals** the current hand-maintained lists
  (name-for-name, args-for-args). Only once that passes do consumers switch to
  the derived source. Keep a drift guard (`docker:manifests:check`-style) so a
  new app that forgets the marker fails CI rather than silently dropping out.

**Correctness bar:** the release plan, compose services, and catalog resolve
to the identical set/args as before the change.

### Phase 2 — Hardening gaps (goal #4)

- **`readOnlyRootFilesystem: true`** on every container, with `emptyDir`
  mounts for the genuinely-writable paths (nginx `/var/cache/nginx`,
  `/var/run`, `/tmp`; app `/tmp` where needed). Templated in `.helm/` and set
  in `values-production.yaml`; also applied to the compose runtime where it
  applies.
- **`values-staging.yaml`** — a real, committed staging overlay derived from
  the production recipe (lower replicas/resources, staging hosts, staging
  secret name), wired so ArgoCD/Flux/direct-helm can consume it.
- **HPA memory metric** — add a memory-utilization target alongside CPU in
  `.helm/templates/hpa.yaml` and the `autoscaling` values, gated so CPU-only
  behavior is preserved when memory target is unset.
- Any additional gap the audit surfaces (e.g. missing `seccompProfile` on an
  aux workload) fixed here.

**Verification:** `helm template` diff review + `helm lint` + a real container
run per changed image to confirm the read-only root filesystem does not break
startup (writable mounts sufficient).

### Phase 3 — Faster build & run (goal #2)

Measure → change → re-measure. Keep only what beats baseline.

- **Nx** — evaluate raising `parallel` from the default 3 toward available
  cores for `run-many`/`affected`; confirm no cache-correctness regressions.
- **Docker** — verify cache-mount and layer-order effectiveness; enable
  `COMPOSE_BAKE` for parallel multi-image builds where not already on;
  consider a pnpm-store cache mount on the per-app prod install layer.
- **Compile the workspace once, not per image (finding #7)** — the release
  matrix recompiles shared libs inside every app image because the Nx cache
  mount is not shared across runners. Evaluate a single shared build:
  a "build" stage/job runs `nx run-many`/`nx affected -t build` once,
  producing the full `dist/`, and each image `COPY`s only its slice; or
  export the Nx cache / prebuilt `dist` to the matrix (gha artifact or a
  shared exported stage) so lib compilation happens once total. Keep
  `nx affected` image selection. Quantify the per-image lib-recompile cost in
  Phase 0 and keep whichever structure builds the full image set fastest
  without weakening per-image reproducibility.
- **Frontend** — explicit `manualChunks`/vendor splitting where it helps;
  nginx brotli + gzip precompression of static assets; per-app bundle-size
  budgets to catch regressions; confirm prod sourcemaps stay off outside E2E.
- **Backend build (switchable option + benchmark)** — add swc/esbuild as an
  **alternative** backend build path while keeping `tsc` the default. This is
  a boilerplate, so the deliverable is _choice plus evidence_: an alternate
  Nx target/executor, an equivalent `@app/*` path handling for the alternate
  toolchain (swc `paths`/plugin or an esbuild paths plugin, validated against
  the pruned per-app `package.json` node resolution), and a documented
  head-to-head benchmark (build time, image boot, smoke pass) so a downstream
  user can pick. Default stays `tsc` unless the alternate proves strictly
  better and passes every gate.
- **Runtime** — container cold-start timing before/after.

**Correctness bar for every speed change:** the built artifact still passes
`test:docker-smoke` and the app boots; a change that only speeds things up but
weakens verification is not kept.

## Decision: image build strategy (vs the in-house reference monorepo)

A separate in-house product monorepo (a reference, not part of this repo) was
reviewed for its build approach. It uses Werf with
two Dockerfiles (one for all backends, one per frontend); the backend build
runs a single `nx run-many -t build --projects='tag:platform:backend'`, bakes
the whole `dist/` into one fat backend image, and selects the running service at
**runtime** via Helm `args`. It compiles shared libs exactly once, aided by an
Nx **S3/MinIO remote cache**.

**Adopted:** that reference's _insight_ — compile the workspace once so shared libs
build a single time.

**Not adopted:** its _machinery_ — Werf, private base-image registry, external
Helm chart, S3 remote cache, and the fat single-image + runtime-selection
model. Reasons: a boilerplate must be self-contained/forkable; the remote
cache conflicts with this project's deliberate no-remote-cache policy; and the
fat image ships the union of all backend deps + all app code to every pod
(larger, less isolated, no per-app rollback). The one fat-image advantage
("add an app = add a values file") is delivered instead by Phase 1's
single-source catalog (finding #1) without sacrificing per-app isolation.

**Chosen structure (finding #7 fix) — Option A, confirmed by owner
2026-07-23:** keep the single unified Dockerfile and
its pruned per-app runtime images, but make the shared `builder` stage compile
the workspace **once** (`nx run-many` / `nx affected -t build`, libs once) and
drive the image set with **`docker buildx bake`**, so BuildKit runs the shared
`builder` node a single time and emits N slim per-app images that each `COPY`
only their `dist/` slice + pruned deps. No remote cache required. The exact CI
shape (single bake job vs. matrix that restores a shared build) is chosen in
Phase 3 from the Phase 0 numbers, but the recompile-per-image behavior is
eliminated either way.

## Testing & verification strategy

- **TDD** for Phase 1 (spec asserts derived == hand-maintained before switch)
  and for the alternate backend build (smoke parity required before the option
  is offered; `tsc` remains the default regardless).
- **Repo validators as gates** at every phase: `pnpm deploy:validate`
  (+`:docker`/`:helm`/`:gitops`/`:pm2`), `pnpm test:docker-smoke`,
  `helm lint`, `docker:manifests:check`, and `nx affected -t lint typecheck
test build` on the touched projects.
- **Benchmarks** recorded as tables (cold/warm, per target) so speed claims
  are evidence-backed, not asserted.

## Risks & rollback

- **Config unification** is the highest-value but most delicate change;
  behavior-preserving TDD + drift guard contains it. Rollback = revert the
  consumer switch, keep hand lists.
- **`readOnlyRootFilesystem`** can break a container that writes to an
  unmounted path; caught by the per-image runtime check before it lands.
- **Alternate backend build** is isolated behind an opt-in target; `tsc`
  remains default, so the risky path never gates the release unless it wins
  outright.
- All work is on `chore/build-optimization-all-shapes`; nothing is committed
  to `main` or pushed without explicit approval.

## Deliverables

1. Baseline + after benchmark tables (build time, image size, bundle size,
   cold-start).
2. Single-source image catalog with drift guard; hand lists removed.
3. Hardening: `readOnlyRootFilesystem`, `values-staging.yaml`, HPA memory.
4. Switchable backend build (tsc default + swc/esbuild option) with a
   documented comparison.
5. Any doc updates under `docs/` for changed workflows.
