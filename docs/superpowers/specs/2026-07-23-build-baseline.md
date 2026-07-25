# Build baseline — per-image lib recompile (the "before")

- **Date:** 2026-07-23
- **Branch:** `chore/build-optimization-all-shapes`
- **Scope:** Task 1 of the build-once image pipeline effort — measure the
  redundant per-image `nx` compile that Option A (build once, reuse across
  images) removes. Read-only: no Dockerfile or source change.

## Environment

```
$ docker buildx version && docker info --format '{{.NCPU}} CPUs, {{.MemTotal}} bytes' && node -v && pnpm -v
github.com/docker/buildx v0.33.0 f7897eba028583e0071642db3c011e860444f8cf
12 CPUs, 12600696832 bytes
v24.18.0
11.11.0
```

BuildKit: v0.29.0 (OrbStack `orbstack` builder, docker driver).

## Method

1. Built the shared `workspace` target once (`docker buildx build --target
workspace --build-arg PNPM_VERSION=11.11.0 -t nrb-baseline/workspace -f
Dockerfile .`) to warm the dependency-install layer that CI already shares
   across image builds — **73.4s**, matching `docker buildx history` (`1m
17s`).
2. Built two backend images that share the same library graph
   (`auth-app-api`, `user-app-api`) against that warm workspace, each timed
   end-to-end with `date +%s` deltas per the brief.
3. **Deviation from the brief's literal Step 3 command, required to get a
   real number:** this Docker host still held build cache from an earlier,
   separate interrupted attempt at this same task (a `--no-cache` `backend`
   build for `auth-app-api` that had already completed in the background,
   3m53s, per `docker buildx history`). Re-running the brief's exact command
   against that state hit a full BuildKit layer-cache skip — 2.7s, with the
   `nx run` instruction never executing — which is not a real build and was
   discarded. To get a genuine measurement without discarding the
   legitimately warm `workspace` layer, two corrections were applied before
   timing:
   - `docker buildx prune --filter type=exec.cachemount -f` — clears BuildKit
     cache _mounts_ only (the Nx local compute cache at `/workspace/.nx/cache`
     mounted by the `builder` stage), leaving the regular layer cache
     (including the warm `workspace` stage) untouched.
   - `--no-cache-filter builder,backend-deps,backend` on the two timed builds
     — forces those stages' `RUN` instructions to actually execute instead of
     reusing a matching layer from the earlier interrupted attempt; the
     `workspace` stage (not in the filter) still serves from cache.
     Both timed builds were confirmed genuine by inspecting their logs: Nx
     reported **`Cache: 0/30 hit (0%)`** (auth-app-api) and **`Cache: 0/29 hit
(0%)`** (user-app-api) — every shared-lib task actually recompiled, not
     replayed from Nx's own cache. This mirrors real CI: per finding #7 in
     `docs/superpowers/specs/2026-07-23-build-optimization-all-shapes-design.md`,
     the Nx cache lives in a BuildKit cache _mount_ that the project's
     `cache-to: type=gha` strategy does not export, so each image build's
     runner starts with that mount cold — exactly the state this measurement
     reproduces locally.

## Results

| image                                      | build time, warm workspace (s) | image size |
| ------------------------------------------ | ------------------------------ | ---------- |
| `nrb-baseline/workspace` (prime, one-time) | 73                             | 5.51GB     |
| `nrb-baseline/auth-app-api`                | 75                             | 672MB      |
| `nrb-baseline/user-app-api`                | 45                             | 420MB      |

Raw command output:

```
auth-app-api elapsed=75s
user-app-api elapsed=45s
```

```
$ docker image ls --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep nrb-baseline
nrb-baseline/user-app-api:latest 420MB
nrb-baseline/auth-app-api:latest 672MB
nrb-baseline/workspace:latest 5.51GB
```

## Note

With the `workspace` stage warm (dependency fetch/install already paid for
and shared, as it is in CI), the remaining wall-clock for each backend image
— 75s for `auth-app-api`, 45s for `user-app-api` — is dominated by the
`builder` stage's `RUN pnpm exec nx run <app>:build`, confirmed by the Nx
task log: that single step recompiles the app's entire dependency graph
(30 tasks for `auth-app-api`, 29 for `user-app-api`), the large majority of
which — `@app/common-config`, `@app/common-i18n-*`, `@app/backend-common-*`,
etc. — are libraries shared by both apps and are therefore compiled twice
across these two images with zero reuse between them (`Cache: 0/30` and
`Cache: 0/29`, i.e. 0% Nx-cache reuse across the two builds in this
environment, matching the CI reality described above). This per-image
shared-lib recompile — not the workspace install, and not the final
`backend-deps`/image-assembly steps, which are comparatively small — is
exactly the quantity a build-once compile (Option A) collapses from N
redundant runs into one.

## After Option A — proof via `docker buildx bake` (Task 4)

- **Scope:** Task 4 — bake `auth-app-api` and `user-app-api` together in a
  single `docker buildx bake` invocation and prove the shared `builder`
  stage (Task 3's one `nx run-many -t build export`) compiles once instead
  of once per image, then compare wall-clock against Task 1's 120s
  "before". Same warm `workspace` layer as Task 1; the `docker-bake.json`
  from Task 2 gives both targets the identical `builder` node once
  `NX_BUILD_PROJECTS` is narrowed to just these two apps.

### Command (primary, scope-narrowed to match Task 1)

```bash
S=$(date +%s); docker buildx bake -f docker-bake.json \
  --set '*.args.NX_BUILD_PROJECTS=auth-app-api,user-app-api' \
  --set '*.no-cache-filter=builder,backend-deps,backend' \
  auth-app-api user-app-api 2>&1 | tee bake-after.log; E=$(date +%s)
grep -c "nx run-many" bake-after.log
```

### Required proof: single shared compile

```
$ grep -c "nx run-many" bake-after.log
1
```

`nx run-many -t build export --projects="..."` appears **exactly once** in
the full log for both `auth-app-api` and `user-app-api` — BuildKit resolved
the identical `builder` node (same base, same args once `NX_BUILD_PROJECTS`
is aligned) as one shared node and reused it for the second image instead
of recompiling. This holds in both runs described below regardless of cache
state, since it is a property of the build graph (one node, two consumers),
not of whether that node was a cache hit.

### Fallback note: `--set '*.no-cache-filter=...'` is not a supported bake attribute

The brief's `--no-cache-filter` `--set` was not _rejected_ with an error in
its plain `key=value` form — it was silently accepted and had no effect
(confirmed: absent from `docker buildx bake --print` output; the indexed
form `--set 'target.no-cache-filter[0]=builder'` fails outright with
`ERROR: unknown key: no-cache-filter[2]`). `no-cache-filter` is a
`docker buildx build` flag, not a recognized `docker buildx bake` target
attribute in buildx v0.33.0. Net effect: the first run of the primary
command above found the `builder` step already `CACHED` — this environment
still held a matching cached layer from an earlier same-day attempt at this
exact `NX_BUILD_PROJECTS=auth-app-api,user-app-api` subset (`docker buildx
du --verbose` showed cache entries for the literal
`nx run-many ... --projects="auth-app-api,user-app-api"` command, created
minutes before this task ran) — elapsed **40s**, not a genuine compile, and
discarded as not representative (the same category of problem Task 1 hit
and worked around).

To get a real, comparable "after" number without the unsupported
`--no-cache-filter` flag, and without a blanket `--no-cache` (which would
also evict the deliberately-warm `workspace` layer, breaking the
apples-to-apples setup), two corrections were applied, mirroring Task 1's
method:

- `docker buildx prune --filter type=exec.cachemount -f` — clears the Nx
  local compute cache mount (same as Task 1).
- Reordered the (semantically identical) arg value to
  `NX_BUILD_PROJECTS=user-app-api,auth-app-api` — a real, legitimate input
  change (Nx does not care about project order) that changes the `builder`
  RUN instruction's literal command text, forcing BuildKit to treat it as a
  new cache key and actually execute it, while the `workspace` stage (whose
  cache key does not depend on this arg) stays warm and untouched.

### Genuine ("after") measurement

```bash
docker buildx prune --filter type=exec.cachemount -f
S=$(date +%s); docker buildx bake -f docker-bake.json \
  --set '*.args.NX_BUILD_PROJECTS=user-app-api,auth-app-api' \
  --set '*.no-cache-filter=builder,backend-deps,backend' \
  auth-app-api user-app-api 2>&1 | tee bake-after-fresh.log; E=$(date +%s)
echo "bake-both-fresh elapsed=$((E-S))s"    # 99s
grep -c "nx run-many" bake-after-fresh.log  # 1
```

The `builder` step's own Nx run reported **`Cache: 0/33 hit (0%)`** —
"Successfully ran target build for 2 projects and 31 tasks they depend on"
(33 tasks total), a genuine, zero-cache compile just like Task 1's `0/30`
and `0/29`. The step itself (`#21 DONE 25.4s`) is the one shared compile;
the rest of the 99s covers both images' `backend-deps` installs and image
exports. Both final images were written to the local image store at the
same sizes as Task 1's baseline (`auth-app-api` 672,521,491 bytes ≈ 672MB;
`user-app-api` 420,642,103 bytes ≈ 420MB — matching `nrb-baseline/*`
exactly), confirming the bake-built images are equivalent artifacts to the
per-image "before" builds.

### Results

|                                        | before (Task 1)            | after (Task 4, Option A)        |
| -------------------------------------- | -------------------------- | ------------------------------- |
| images built                           | 2, separately              | 2, together in one bake         |
| compiles                               | 2 (once per image)         | **1** (shared `builder` node)   |
| `nx run-many` invocations (grep proof) | 2 (one per `docker build`) | **1**                           |
| gross Nx tasks run                     | 30 + 29 = 59               | 33 (deduplicated union)         |
| Nx cache hit                           | 0/30, 0/29 (0%)            | 0/33 (0%) — genuine, comparable |
| wall-clock                             | 75s + 45s = **120s**       | **99s**                         |

**Delta: 120s to 99s, a 21s / 17.5% reduction** on this narrowed two-app
scope — even though the 99s still pays for two separate `backend-deps`
installs and two image exports (Option A does not touch those). The more
telling number is the task-level dedup: 59 gross task-runs before (with
heavy, previously-uncounted overlap between the two apps' shared libs)
collapse to 33 unique task-runs after — the redundant shared-lib recompile
finding #7 targeted is gone, proven structurally by the single
`nx run-many` invocation (`grep -c` = 1) and confirmed numerically by the
task count and wall-clock both dropping. At full-fleet scale (12 projects,
more images sharing one compile instead of N), the collapsed-task-count
effect — not this two-app wall-clock delta — is where Option A's savings
mostly live.
