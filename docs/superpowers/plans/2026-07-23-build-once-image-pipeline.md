# Build-once image pipeline (Option A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile the workspace once per image build so shared libraries are built a single time (not once per app image), while keeping the existing single unified `Dockerfile` and small pruned per-app runtime images.

**Architecture:** The `builder` stage stops taking a single `NX_PROJECT` and instead builds a passed _set_ of projects once (`nx run-many`). All image targets are built in one `docker buildx bake` invocation from a generated `docker-bake.hcl`, so BuildKit runs the shared `builder` node exactly once and each runtime target copies only its slice. The bake file is generated from the existing single source of image truth, `scripts/release-image-plan.mjs`'s `releaseImages` array — no new hand-maintained list.

**Tech Stack:** Docker BuildKit + `docker buildx bake`, Node ESM scripts, Nx 23 (`@nx/js:tsc`), pnpm 11.11.0, `node:test`.

## Global Constraints

- Node `>=24 <25` (pinned `24.18.0`); pnpm `11.11.0` (exact). Copy `PNPM_VERSION` from `scripts/release-image-plan.mjs:14` — do not hardcode a second copy elsewhere; import it.
- The image universe has exactly one authoritative source: `releaseImages` in `scripts/release-image-plan.mjs:18-87`. Every new consumer (bake generator) must import it, never re-list images. (Collapsing the _other_ existing lists — compose, `catalog.ts`, `update-deploy-tags.py` — is a separate follow-on plan; do not touch them here.)
- Barrels/public boundaries use `export *` (project rule) — not relevant here but do not convert any.
- Verify per-command exit codes, never trust a wrapper's aggregate exit (project rule): after each gate command, confirm its own `$?` is 0.
- No behavior change to which images ship or their contents — only _how_ they are built. The `release-image-plan.mjs` selection output (names, matrix, buildArgs) must remain byte-for-byte identical; its existing tests in `scripts/release-image-plan.spec.mjs` must stay green untouched.
- Frontend build args stay `VITE_API_BASE_URL_MODE=same-origin` (matches `package.json:11` and current per-image args).

---

### Task 1: Baseline — measure the current per-image lib recompile (the "before")

**Files:**

- Create: `docs/superpowers/specs/2026-07-23-build-baseline.md`

**Interfaces:**

- Produces: a committed baseline table later tasks compare against (build wall-clock per image, and the shared-lib recompile cost).

- [ ] **Step 1: Confirm a clean builder and capture environment**

Run:

```bash
docker buildx version && docker info --format '{{.NCPU}} CPUs, {{.MemTotal}} bytes' && node -v && pnpm -v
```

Expected: buildx present; CPU/mem printed; `v24.18.0`; `11.11.0`.

- [ ] **Step 2: Prime the shared workspace layer once (foreground)**

The redundant work Option A removes is the per-image `nx` compile, not the shared dependency install — that `workspace` layer is already shared in CI. So warm it once, then measure each backend build against it. Run this in the FOREGROUND (it is the slowest single step; give it a long timeout):

```bash
docker buildx build --target workspace --build-arg PNPM_VERSION=11.11.0 \
  -t nrb-baseline/workspace -f Dockerfile . 2>&1 | tail -3
```

Expected: the `workspace` stage builds and is now cached for the next two builds.

- [ ] **Step 3: Build two lib-sharing backend images against the warm workspace, timing each**

Run each in the FOREGROUND, timing with `date +%s` deltas (do NOT background these):

```bash
S=$(date +%s); docker buildx build --target backend \
  --build-arg NX_PROJECT=auth-app-api \
  --build-arg BUILD_OUTPUT=dist/apps/backend/auth/auth-app-api \
  --build-arg PNPM_VERSION=11.11.0 \
  -t nrb-baseline/auth-app-api -f Dockerfile . 2>&1 | tail -4; E=$(date +%s); echo "auth-app-api elapsed=$((E-S))s"
```

Then the same for `user-app-api` (`BUILD_OUTPUT=dist/apps/backend/user/user-app-api`, tag `nrb-baseline/user-app-api`). Record each `elapsed=` value. With the workspace warm, that time is dominated by the `builder` stage's `nx run <app>:build` — the shared-lib compile that repeats for every app image. The two together are what a single shared compile (Option A) collapses into one.

- [ ] **Step 4: Record image sizes**

Run:

```bash
docker image ls --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep nrb-baseline
```

Expected: workspace + two backend sizes printed; record the two backend image sizes.

- [ ] **Step 5: Write the baseline doc**

Create `docs/superpowers/specs/2026-07-23-build-baseline.md` with a table: columns `image | build time warm-workspace (s) | image size`, the two backend rows measured, an `environment` line (CPUs/mem/versions from Step 1), and a one-paragraph note stating that with the workspace layer warm the measured time is dominated by the per-image `nx` shared-lib compile — the quantity Option A collapses to a single compile. Real measured numbers only — no placeholders.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-07-23-build-baseline.md
git commit -m "docs: capture pre-Option-A image build baseline"
```

---

### Task 2: Bake-file generator (TDD) — emit `docker-bake.hcl` from `releaseImages`

**Files:**

- Create: `scripts/generate-bake-file.mjs`
- Test: `scripts/generate-bake-file.spec.mjs`
- Modify: `package.json` (add a `bake:generate` script)

**Interfaces:**

- Consumes: `releaseImages` from `scripts/release-image-plan.mjs` (each entry: `{ name, target, buildArgs, project? }`).
- Produces: `export function buildBakeConfig(images) => { group, target }` returning a JSON object matching Docker Bake's JSON schema, and a `renderBakeJson(images) => string` returning `JSON.stringify(config, null, 2)`. Bake reads `.hcl`, `.json`, or `docker-bake.override.*`; emit JSON (simpler to assert) to a file named `docker-bake.json`.

- [ ] **Step 1: Write the failing test**

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBakeConfig } from './generate-bake-file.mjs';
import { releaseImages } from './release-image-plan.mjs';

test('every release image becomes a bake target with its docker stage', () => {
  const { target } = buildBakeConfig(releaseImages);
  for (const image of releaseImages) {
    assert.ok(target[image.name], `missing bake target ${image.name}`);
    assert.equal(target[image.name].target, image.target);
    assert.equal(target[image.name].dockerfile, 'Dockerfile');
  }
});

test('the default group builds exactly the release image set', () => {
  const { group } = buildBakeConfig(releaseImages);
  assert.deepEqual([...group.default.targets].sort(), releaseImages.map((image) => image.name).sort());
});

test('application images share one NX_BUILD_PROJECTS arg = union of projects', () => {
  const { target } = buildBakeConfig(releaseImages);
  const expected = releaseImages
    .filter((image) => image.project)
    .map((image) => image.project)
    .join(',');
  const appTargets = releaseImages.filter((image) => image.project);
  for (const image of appTargets) {
    assert.equal(target[image.name].args.NX_BUILD_PROJECTS, expected);
  }
});

test('migrator target carries no NX_BUILD_PROJECTS (does not need the build stage)', () => {
  const { target } = buildBakeConfig(releaseImages);
  assert.equal(target.migrator.args.NX_BUILD_PROJECTS, undefined);
});

test('per-image slice args are preserved from buildArgs (BUILD_OUTPUT / FRONTEND_OUTPUT)', () => {
  const { target } = buildBakeConfig(releaseImages);
  assert.equal(target['auth-app-api'].args.BUILD_OUTPUT, 'dist/apps/backend/auth/auth-app-api');
  assert.equal(target['admin-app'].args.FRONTEND_OUTPUT, 'dist/apps/frontend/admin');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/generate-bake-file.spec.mjs`
Expected: FAIL — `Cannot find module './generate-bake-file.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { releaseImages } from './release-image-plan.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const parseBuildArgs = (buildArgs) =>
  Object.fromEntries(
    buildArgs
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );

export function buildBakeConfig(images) {
  const nxBuildProjects = images
    .filter((image) => image.project)
    .map((image) => image.project)
    .join(',');

  const target = {};
  for (const image of images) {
    const parsed = parseBuildArgs(image.buildArgs);
    delete parsed.NX_PROJECT;
    delete parsed.NX_TARGET;
    const args = image.project ? { NX_BUILD_PROJECTS: nxBuildProjects, ...parsed } : { ...parsed };
    target[image.name] = { dockerfile: 'Dockerfile', target: image.target, args };
  }

  return { group: { default: { targets: images.map((image) => image.name) } }, target };
}

export function renderBakeJson(images) {
  return `${JSON.stringify(buildBakeConfig(images), null, 2)}\n`;
}

const main = () => {
  writeFileSync(join(rootDir, 'docker-bake.json'), renderBakeJson(releaseImages));
  console.log('Wrote docker-bake.json');
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/generate-bake-file.spec.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the npm script and generate the file**

In `package.json` scripts, add: `"bake:generate": "node scripts/generate-bake-file.mjs"`. Then run:

```bash
pnpm run bake:generate && node -e "JSON.parse(require('fs').readFileSync('docker-bake.json','utf8')); console.log('valid json')"
```

Expected: `Wrote docker-bake.json` then `valid json`.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-bake-file.mjs scripts/generate-bake-file.spec.mjs package.json docker-bake.json
git commit -m "feat(build): generate docker bake file from release image source"
```

---

### Task 3: Restructure the `builder` stage to compile the project set once

**Files:**

- Modify: `Dockerfile:38-58` (the `builder` stage)

**Interfaces:**

- Consumes: `NX_BUILD_PROJECTS` build arg (comma-separated project list from Task 2).
- Produces: a `builder` stage whose layer is identical across all image targets that pass the same `NX_BUILD_PROJECTS`, so BuildKit shares it. Downstream stages (`backend-deps`, `backend`, `site-deps`, `site-runtime`, `frontend`) are unchanged — they already `COPY --from=builder /workspace/dist ...` / their slice.

- [ ] **Step 1: Replace the per-project build with a build-once run-many**

Change the `builder` stage so that instead of:

```dockerfile
FROM workspace AS builder
ARG NX_PROJECT
ARG NX_TARGET=build
... VITE args unchanged ...
RUN --mount=type=cache,target=/workspace/.nx/cache,sharing=locked \
  test -n "${NX_PROJECT}" \
  && pnpm exec nx run "${NX_PROJECT}:${NX_TARGET}"
```

it reads:

```dockerfile
FROM workspace AS builder
ARG NX_BUILD_PROJECTS
... VITE args unchanged ...
RUN --mount=type=cache,target=/workspace/.nx/cache,sharing=locked \
  test -n "${NX_BUILD_PROJECTS}" \
  && pnpm exec nx run-many -t build export --projects="${NX_BUILD_PROJECTS}"
```

Keep every `ARG VITE_*`/`ENV VITE_*` line and the cache mount exactly as they are. The `export` target covers `mobile-app`; projects without it are skipped by nx.

- [ ] **Step 2: Verify the Dockerfile still parses and the builder builds all projects once**

Run:

```bash
docker buildx build --target builder \
  --build-arg NX_BUILD_PROJECTS="admin-app-api,user-app-api,auth-app-api,discord-app-api,telegram-bot-api,notification-scheduler,notification-consumer,admin-app,user-app,landing-app,site-app,mobile-app" \
  --build-arg PNPM_VERSION=11.11.0 \
  -t nrb-builder-once -f Dockerfile . 2>&1 | tail -8
```

Expected: one `nx run-many` invocation builds the whole set; each shared lib compiles once (watch the nx output — each `@app/...` lib appears once, not per app). Build succeeds.

- [ ] **Step 3: Verify a runtime image still assembles from the shared builder**

Run:

```bash
docker buildx build --target backend \
  --build-arg NX_BUILD_PROJECTS="auth-app-api,user-app-api" \
  --build-arg BUILD_OUTPUT=dist/apps/backend/auth/auth-app-api \
  --build-arg PNPM_VERSION=11.11.0 \
  -t nrb-auth-once -f Dockerfile . 2>&1 | tail -5
```

Expected: succeeds; `backend-deps` installs auth's pruned deps; final image copies the whole `dist` + those deps.

- [ ] **Step 4: Smoke the produced image boots**

Run:

```bash
docker run --rm -e CONTAINER=true nrb-auth-once node -e "console.log('node ok in image')"
```

Expected: `node ok in image`. (Full app boot needs env/DB; this confirms the image + entrypoint layer are intact. The compose smoke in Task 5 exercises a real boot.)

- [ ] **Step 5: Commit**

```bash
git add Dockerfile
git commit -m "refactor(docker): build the workspace once in the shared builder stage"
```

---

### Task 4: Build the full image set in one bake run and prove libs compile once (the "after")

**Files:**

- Modify: `docs/superpowers/specs/2026-07-23-build-baseline.md` (append the "after" section)

**Interfaces:**

- Consumes: `docker-bake.json` (Task 2), the build-once `builder` (Task 3).

Execution rules: run every build in the FOREGROUND with Bash `timeout: 600000`; never background, never pause. The `workspace` layer is already warm on this host.

- [ ] **Step 1 (PRIMARY — the proof): bake the two backend images together and confirm ONE shared compile**

The committed `docker-bake.json` sets `NX_BUILD_PROJECTS` to the full 12-project union (correct for a full release). For an apples-to-apples comparison with Task 1's "before" (which timed only auth + user), override the arg to just those two so the shared builder compiles the same graph the "before" measured — once — and force the compile-bearing stages to actually run while keeping the warm `workspace`:

```bash
S=$(date +%s); docker buildx bake -f docker-bake.json \
  --set '*.args.NX_BUILD_PROJECTS=auth-app-api,user-app-api' \
  --set '*.no-cache-filter=builder,backend-deps,backend' \
  auth-app-api user-app-api 2>&1 | tee /tmp/bake-after.log | tail -20; E=$(date +%s); echo "bake-both elapsed=$((E-S))s"
```

Then confirm the shared builder ran exactly once:

```bash
grep -c "nx run-many" /tmp/bake-after.log
```

Expected: both images build; `nx run-many` appears a single time (count `1`) — the builder node is shared across both targets, so shared libs compile once. Record `elapsed=`.

If `docker buildx bake` rejects either `--set` flag on this buildx version, fall back to `docker buildx bake -f docker-bake.json auth-app-api user-app-api` (full union, still one shared compile), record that timing, and note in the doc that the wall-clock then covers the full 12-project compile rather than just auth+user. The single-`nx run-many` proof (grep count `1`) is the required deliverable either way.

- [ ] **Step 2: Append the after-numbers to the baseline doc**

In `docs/superpowers/specs/2026-07-23-build-baseline.md`, add an "After Option A" section: the measured `elapsed=` for building `auth-app-api`+`user-app-api` together via bake with a single shared compile, next to Task 1's "before" sum (auth 75s + user 45s = 120s built separately, two compiles). State the delta and the `grep` count proving one compile. Note any fallback used. Real numbers only.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-23-build-baseline.md
git commit -m "docs: record Option A after-numbers (single shared compile)"
```

---

### Task 5: Compose backward-compatibility + docker smoke

**Files:**

- Modify: `Dockerfile` (the `builder` stage — add an `NX_PROJECT` fallback)

**Interfaces:**

- Consumes: `docker/docker-compose.yml`, `docker/docker-compose.prod.build.yml` (both pass the legacy `NX_PROJECT` build arg per service — 12 each), and the repo's `pnpm run test:docker-smoke` gate.

**Why this task exists:** Task 3 replaced the builder's `ARG NX_PROJECT` with `ARG NX_BUILD_PROJECTS` and guards on `test -n "${NX_BUILD_PROJECTS}"`. But `docker/docker-compose.yml` and `docker/docker-compose.prod.build.yml` still build each service with `NX_PROJECT: <app>` (verified: 12 occurrences each). Left as-is, every compose build now fails the guard. Rather than rewrite 24 compose service definitions, make the builder accept `NX_PROJECT` as a single-project fallback — bake keeps passing `NX_BUILD_PROJECTS` (the union), compose keeps passing `NX_PROJECT` (one app), both work.

Execution rules: FOREGROUND builds only, Bash `timeout: 600000`, never background, never pause. The `workspace` layer is warm on this host.

- [ ] **Step 1: Add the `NX_PROJECT` fallback to the builder stage**

In the `builder` stage of `Dockerfile`, keep `ARG NX_BUILD_PROJECTS`, add `ARG NX_PROJECT` right after it, and change the RUN so it uses whichever is set:

```dockerfile
FROM workspace AS builder
ARG NX_BUILD_PROJECTS
ARG NX_PROJECT
... VITE ARG/ENV lines unchanged ...
RUN --mount=type=cache,target=/workspace/.nx/cache,sharing=locked \
  PROJECTS="${NX_BUILD_PROJECTS:-$NX_PROJECT}" \
  && test -n "${PROJECTS}" \
  && pnpm exec nx run-many -t build export --projects="${PROJECTS}"
```

Keep the `build export` target list and the cache mount exactly as in Task 3. Do not touch any other stage.

- [ ] **Step 2: Verify a representative compose build now succeeds (backend + frontend + migrator)**

`test:docker-smoke` builds the whole stack and can be very slow; first prove the fallback fixes the arg mismatch with a bounded build of three representative services:

```bash
docker compose -f docker/docker-compose.yml build migrate admin-app-api admin-app 2>&1 | tail -15; echo "compose-build exit=$?"
```

Expected: `compose-build exit=0` — each service's `NX_PROJECT` arg now drives the builder via the fallback (the old failure mode was the empty-`NX_BUILD_PROJECTS` guard). If it fails, debug the root cause in the `builder` stage only (do not weaken the build); do not modify the compose files.

- [ ] **Step 3: Run the repo's docker smoke gate**

Run (long-running; foreground, max timeout):

```bash
pnpm run test:docker-smoke; echo "smoke exit=$?"
```

Expected: `smoke exit=0`. If the gate cannot finish within the 600000ms foreground timeout on this host, do NOT background it: record in your report that Step 2's representative compose build passed and that the full smoke gate exceeded the local timeout (it runs in CI), and report DONE_WITH_CONCERNS. A real failure (non-zero exit, not a timeout) must be root-caused in the `builder` stage and re-run until green.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "fix(docker): accept NX_PROJECT fallback in build-once builder for compose"
```

---

### Task 6: Adopt bake in the release workflow (CI), keeping affected selection, SBOM, scan, sign

**Files:**

- Modify: `.github/workflows/release-images.yml:133-222` (the `build-scan-sign` matrix job)
- Modify: `scripts/generate-bake-file.mjs` (accept an optional image-name filter for affected-only bakes)
- Test: `scripts/generate-bake-file.spec.mjs` (add a filter test)

**Interfaces:**

- Consumes: `image-plan` job outputs (`selected_images`, `has_images`) already produced by `scripts/release-image-plan.mjs`.
- Produces: a single bake build of only the affected images, then a post-build loop that runs SBOM/Trivy/cosign per built image (unchanged tools, same digests).

- [ ] **Step 1: Write the failing filter test**

```javascript
test('buildBakeConfig can restrict the default group to selected image names', () => {
  const { group, target } = buildBakeConfig(releaseImages, ['auth-app-api', 'migrator']);
  assert.deepEqual([...group.default.targets].sort(), ['auth-app-api', 'migrator']);
  assert.ok(target['auth-app-api'] && target.migrator);
  assert.equal(target['auth-app-api'].args.NX_BUILD_PROJECTS, 'auth-app-api');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test scripts/generate-bake-file.spec.mjs`
Expected: FAIL — `buildBakeConfig` ignores the second argument / arity mismatch.

- [ ] **Step 3: Implement the filter**

Update `buildBakeConfig(images, selectedNames)`: when `selectedNames` is a non-empty array, build `group.default.targets` and the `target` map from only the images whose `name` is in `selectedNames`, and compute `NX_BUILD_PROJECTS` from the _selected_ images' `project` fields (so an affected subset compiles just those, not the full union). When `selectedNames` is undefined/empty, keep the full set (existing behavior — do not break Task 2's 5 tests). Add a `--only=a,b,c` (and space-tolerant `--only "a,b"`) CLI flag in `main()` that splits on commas, trims, drops empties, and forwards to `renderBakeJson(releaseImages, names)`; with no `--only`, `main()` behaves exactly as before.

- [ ] **Step 4: Run tests green**

Run: `node --test scripts/generate-bake-file.spec.mjs`
Expected: PASS (6 tests — the 5 from Task 2 plus the new filter test).

- [ ] **Step 5: Commit the generator filter (verifiable half)**

```bash
git add scripts/generate-bake-file.mjs scripts/generate-bake-file.spec.mjs
git commit -m "feat(build): affected-only bake filter (generate-bake-file --only)"
```

- [ ] **Step 6: Rewire the release CI to one shared bake job**

This half changes `.github/workflows/release-images.yml` and can only be validated statically here (no GHCR/runners locally); a real CI run is the final proof. Replace the entire `strategy.matrix` `build-scan-sign` job (currently lines ~133-222) with a SINGLE non-matrix job. Keep the `helm-render`, `image-plan`, and `workspace-cache` jobs and all `env`/`permissions` unchanged. The new job's steps, concretely:

1. `actions/checkout` (pin unchanged), `pnpm/action-setup` (`version: ${{ env.PNPM_VERSION }}`), `actions/setup-node` (`node-version-file: .nvmrc`) — needed to run the generator; `docker/setup-buildx-action`; `docker/login-action` to GHCR (all with the SAME pinned SHAs already in the file).
2. Generate the affected bake file:
   ```bash
   node scripts/generate-bake-file.mjs --only "${SELECTED_IMAGES}"
   ```
   with `SELECTED_IMAGES: ${{ needs.image-plan.outputs.selected_images }}` in the step `env`.
3. Build, push, attest — ONE bake invocation builds all affected targets from the single shared `builder`:
   ```bash
   IFS=',' read -ra NAMES <<< "${SELECTED_IMAGES}"
   set_args=()
   for name in "${NAMES[@]}"; do
     set_args+=(--set "${name}.tags=${IMAGE_PREFIX}/${name}:sha-${GITHUB_SHA}")
   done
   docker buildx bake -f docker-bake.json "${NAMES[@]}" "${set_args[@]}" \
     --set "*.args.VITE_TELEGRAM_AUTH_ENABLED=${VITE_TELEGRAM_AUTH_ENABLED}" \
     --set "*.cache-from=type=gha,scope=release-workspace" \
     --set "*.cache-from=type=gha,scope=release-bake" \
     --set "*.cache-to=type=gha,mode=max,scope=release-bake" \
     --set "*.attest=type=provenance,mode=max" \
     --set "*.attest=type=sbom" \
     --push --metadata-file bake-metadata.json
   ```
   env: `VITE_TELEGRAM_AUTH_ENABLED: ${{ vars.VITE_TELEGRAM_AUTH_ENABLED || 'false' }}`. This preserves the current `provenance: mode=max` + `sbom: true` as bake `attest` entries and the `release-workspace` cache reuse. (OCI `labels` via `--set '*.labels.<key>=<value>'` are best-effort — if this buildx version rejects the dotted-key form, omit the labels and note it; they are metadata, not security-critical.)
4. Install the scan/sign CLIs (Actions can't be looped, so use the tools directly): `anchore/sbom-action`'s syft, `aquasecurity/setup-trivy` (or the trivy install script), and `sigstore/cosign-installer` (pin to the SAME cosign-installer SHA already in the file). syft can be installed via `anchore/sbom-action/download-syft` at its pinned SHA.
5. SBOM + scan + sign each pushed digest from the bake metadata, collecting outputs into dirs, WITHOUT failing before uploads:
   ```bash
   mkdir -p sboms sarifs
   IFS=',' read -ra NAMES <<< "${SELECTED_IMAGES}"
   scan_failed=0
   for name in "${NAMES[@]}"; do
     digest=$(jq -r --arg t "$name" '.[$t]."containerimage.digest"' bake-metadata.json)
     ref="${IMAGE_PREFIX}/${name}@${digest}"
     syft "$ref" -o "spdx-json=sboms/sbom-${name}.spdx.json"
     trivy image --format sarif --output "sarifs/trivy-${name}.sarif" \
       --vuln-type os,library --severity CRITICAL,HIGH --exit-code 1 "$ref" || scan_failed=1
     cosign sign --yes "$ref"
   done
   echo "scan_failed=${scan_failed}" >> "$GITHUB_ENV"
   ```
6. Upload SBOMs (`actions/upload-artifact`, `if: always()`, `path: sboms/`, `if-no-files-found: error`) and Trivy SARIFs (`github/codeql-action/upload-sarif` at its pinned SHA, `if: always()`, `sarif_file: sarifs`).
7. Final gate step: `if: always()` `run: test "${scan_failed:-0}" = 0` so a CRITICAL/HIGH finding still fails the job AFTER the SARIF upload (matching the current `exit-code: 1` behavior).

- [ ] **Step 7: Validate statically**

Run:

```bash
node scripts/generate-bake-file.mjs --only "migrator,auth-app-api,user-app-api"
docker buildx bake -f docker-bake.json --print migrator auth-app-api user-app-api 2>&1 | tail -40
node -e "const c=require('./docker-bake.json'); if(c.group.default.targets.length!==3) throw new Error('expected 3 selected targets'); if(c.target['auth-app-api'].args.NX_BUILD_PROJECTS!=='auth-app-api,user-app-api') throw new Error('NX_BUILD_PROJECTS should be the selected projects only: '+c.target['auth-app-api'].args.NX_BUILD_PROJECTS); console.log('bake --only shape ok')"
pnpm run deploy:validate:docker; echo "validate exit=$?"
```

Expected: `--print` resolves a plan whose targets all share ONE `builder` (identical `NX_BUILD_PROJECTS=auth-app-api,user-app-api`, migrator excepted); the node assertion prints `bake --only shape ok`; `validate exit=0`. If `actionlint` is available (`command -v actionlint`), also run it on the workflow and fix any error it reports. Regenerate the committed full `docker-bake.json` afterward (`pnpm run bake:generate`) so the repo copy is the full set, not the 3-image `--only` output.

- [ ] **Step 8: Commit the CI rewrite**

```bash
git add .github/workflows/release-images.yml docker-bake.json
git commit -m "ci(release): build affected images in one shared bake, loop scan/sign"
```

---

### Task 7: Sync deployment validators to the build-once pipeline

**Files:**

- Modify: `scripts/validate-deployment-config.mjs` (and any other validator whose assertions our Dockerfile/CI changes broke — candidates: `scripts/validate-github-workflows.mjs`, `scripts/validate-gitops-config.mjs`).

**Why this task exists:** Task 3 removed `ARG NX_TARGET=build` from the Dockerfile builder and Task 6 replaced the per-image release matrix with a single bake job. Several repo validators assert the OLD structure by substring, so `pnpm run deploy:validate` now fails — and one of these (`validate-deployment-config.mjs`) is the CI `helm-render` gate, so the release pipeline is red until fixed. Each broken assertion's INTENT still holds under the new form; update the evidence string to match, do not delete the check.

**Interfaces:**

- Consumes: the new `Dockerfile` builder (`pnpm exec nx run-many -t build export --projects="${PROJECTS}"`, with `ARG NX_BUILD_PROJECTS` + `ARG NX_PROJECT` fallback) and the new single-bake `release-images.yml`.

- [ ] **Step 1: Reproduce the full failure set**

Run and capture EVERY assertion failure (run each mode; they abort on first failure, so re-run after each fix):

```bash
pnpm run deploy:validate 2>&1 | tail -20; echo "all exit=$?"
node scripts/validate-github-workflows.mjs 2>&1 | tail -20; echo "workflows exit=$?"
```

Known starting failures (confirmed): `validate-deployment-config.mjs:93` asserts the literal `ARG NX_TARGET=build`; `:638` asserts the old matrix build-arg `VITE_TELEGRAM_AUTH_ENABLED=${{ vars.VITE_TELEGRAM_AUTH_ENABLED || 'false' }}`; `:669` has a now-stale label mentioning "matrix builds". There may be more in the other two validators — find them all.

- [ ] **Step 2: Fix `validate-deployment-config.mjs:93` (mobile-export evidence)**

The intent is "the builder supports non-`build` targets such as mobile export". The new evidence is the run-many target list. Change the needle from `'ARG NX_TARGET=build'` to `'run-many -t build export'` (keep the same label), so it asserts the builder actually runs the `export` target.

- [ ] **Step 3: Fix `validate-deployment-config.mjs:638` (VITE_TELEGRAM flag flows into the release build)**

The intent is "the release build passes `VITE_TELEGRAM_AUTH_ENABLED` from repo vars (default false)". Read the new `.github/workflows/release-images.yml`, find the exact line that now carries `vars.VITE_TELEGRAM_AUTH_ENABLED || 'false'` (the step `env:` entry `VITE_TELEGRAM_AUTH_ENABLED: ${{ vars.VITE_TELEGRAM_AUTH_ENABLED || 'false' }}`), and update the needle to that exact substring. Preserve the assertion's label/intent.

- [ ] **Step 4: Fix `validate-deployment-config.mjs:669` label + any matrix-era wording**

The `'workspace-cache'` needle still passes, but its label says "before matrix builds". Update the label to reflect the single shared bake (e.g. "release workflow primes a shared dependency cache before the bake build"). Fix any other now-false label wording you touched.

- [ ] **Step 5: Fix any additional breaks in the other validators**

For each remaining failure surfaced in Step 1 (e.g. in `validate-github-workflows.mjs` or `validate-gitops-config.mjs`), update the evidence string to the new build-once/single-bake form, preserving the check's intent. Do not weaken or remove a check to make it pass.

- [ ] **Step 6: Confirm the whole validation suite is green**

```bash
pnpm run deploy:validate; echo "deploy:validate exit=$?"
node scripts/validate-github-workflows.mjs; echo "workflows exit=$?"
node --test scripts/generate-bake-file.spec.mjs 2>&1 | tail -3
pnpm run docker:manifests:check; echo "manifests exit=$?"
```

Expected: all exit 0; bake tests still 6/6. If a validator legitimately cannot be satisfied by the new design (not just an evidence-string mismatch), STOP and report it — do not delete the assertion.

- [ ] **Step 7: Commit**

```bash
git add scripts/
git commit -m "fix(validate): sync deployment validators to build-once bake pipeline"
```

---

### Task 8: Documentation

**Files:**

- Modify: `docs/deployment.md` or the nearest build doc (grep for the current image-build description) — document the bake path and the single-source `releaseImages` → `docker-bake.json` flow.
- Modify: `docs/superpowers/specs/2026-07-23-build-optimization-all-shapes-design.md` (tick finding #7 as implemented).

- [ ] **Step 1: Update the build doc**

Add a short section: "Container images are built with `docker buildx bake` from `docker-bake.json`, generated by `pnpm run bake:generate` from the single `releaseImages` source. The shared `builder` stage compiles the workspace once; each image copies its slice." Include the local commands from Task 4 Step 1 and Task 6 Step 6.

- [ ] **Step 2: Mark finding #7 resolved in the design spec**

In the findings table row #7, append "— resolved by Option A (build-once + bake), 2026-07-..".

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs: document the build-once bake image pipeline"
```

---

## Self-Review notes

- **Spec coverage:** implements finding #7 (build-once) and consumes finding #1's _existing_ single source (`releaseImages`) without expanding scope into the full catalog unification (deliberately deferred to a follow-on plan, per Global Constraints).
- **No behavior change:** `release-image-plan.mjs` and its tests are untouched; image contents unchanged (runtime stages unchanged). Verified by Task 5 smoke + Task 6 `--print`.
- **Type/name consistency:** `buildBakeConfig(images, selectedNames?)`, `renderBakeJson(images)`, arg `NX_BUILD_PROJECTS`, output `docker-bake.json` used consistently across Tasks 2/4/6.
- **Risk:** the CI rewrite (Task 6) is the heaviest and only fully exercised in CI; local `--print` + `deploy:validate` gate it before merge. If bake tag/attest wiring proves fiddly, Task 6 can ship as a follow-up while Tasks 1-5 already deliver the local build-once win.
