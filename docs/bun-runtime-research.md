# Bun runtime support

- Research date: 2026-07-19
- Implementation verified: 2026-07-20
- Repository baseline: `f130b2df052f0a91ec6a4cfbd224350e36d46175`
- Tested Bun: `1.3.14+0d9b296af` (latest stable on the research date)

## Decision

The repository supports Bun 1.3.14 as an alternative JavaScript runtime for a
tested compatibility contract. Node.js 24 and pnpm 11.15.1 remain the canonical
dependency-resolution, coverage, CI baseline, and deployment toolchain.

The supported lane is pinned in `.bun-version` and runs locally and in CI with:

```bash
pnpm run bun:check
```

It verifies the Nx graph, a Vite build, a Vike SSR build and production runtime,
an Expo web export, a NestJS build and HTTP runtime, selected unit tests, and an
API end-to-end suite. The Nest readiness probe also verifies that runtime health
reports Bun rather than Bun's Node-compatibility version.

This distinction matters because `bun run nx ...` normally honors Nx's
`#!/usr/bin/env node` shebang. Use `bun run --bun nx ...` when the intent is to
exercise Nx and its child JavaScript tools under Bun rather than merely launch
the existing Node.js workflow with Bun.

## Current upstream position

- Bun 1.3.14 was the latest stable release on the research date. See the
  [Bun v1.3.14 release](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14).
- Nx documents Bun as a supported package manager for Nx workspaces, including
  `bun install` and `bunx`. Nx Cloud agents need a custom launch template. See
  [Nx's Bun CI guide](https://nx.dev/docs/guides/nx-cloud/use-bun).
- Bun can migrate `pnpm-lock.yaml`, supports isolated installs, workspaces,
  frozen installs, and minimum-release-age policy. See
  [`bun install`](https://bun.sh/docs/pm/cli/install) and
  [Bun workspaces](https://bun.sh/docs/pm/workspaces).
- Bun does not run every dependency lifecycle script by default. Required
  packages must be allowlisted with `trustedDependencies`. See
  [Bun lifecycle scripts](https://bun.sh/docs/pm/lifecycle).
- Bun's Node compatibility is intentionally incomplete. In particular,
  `node:inspector`, `node:test`, `node:async_hooks`, `node:child_process`, and
  several process/runtime APIs are partial. See
  [Bun's Node.js compatibility table](https://bun.sh/docs/runtime/nodejs-compat).
- OpenTelemetry JavaScript officially supports Node.js and browsers; Bun is not
  listed as a supported server runtime. This repository uses the Node SDK and
  Node auto-instrumentations, so production support needs explicit integration
  proof. See
  [OpenTelemetry JavaScript runtime support](https://opentelemetry.io/docs/languages/js/).

## Empirical compatibility matrix

The original research probes ran in the isolated `codex/latest-bun-research`
worktree from the baseline above. Implemented Phase 0 surfaces were reverified
through `pnpm run bun:check` on the implementation date. The Bun binary was the
official macOS arm64 1.3.14 release; the machine's installed Bun 1.2.21 was not
upgraded.

| Surface                           | Result                       | Evidence and limitation                                                                                                                                                                                        |
| --------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bun lock migration                | Pass with required follow-up | `bun install --lockfile-only` migrated the pnpm graph to a 927 KiB `bun.lock` and copied workspace paths plus overrides into root `package.json`. It did not make Bun canonical or remove pnpm-only policy.    |
| Frozen Bun install                | Pass                         | A warm `bun ci` checked 2,700 installs across 2,978 packages in 615 ms. `@swc/core` and then `nx` appeared as blocked lifecycle scripts; both need explicit trust.                                             |
| Nx project graph under Bun        | Pass                         | `NX_DAEMON=false bun run --bun nx show projects` resolved the complete graph. `bun run --bun nx report` reported Bun 1.3.14 and Node-compatibility value 24.3.0.                                               |
| Nest API build under Bun          | Pass with deployment warning | `bun run --bun nx run auth-app-api:build --skip-nx-cache` built the API and its 27 dependencies. Nx warned: `Bun lockfile generation is unsupported`; the per-app pruned deployment lockfile was not produced. |
| Vite admin build under Bun        | Pass                         | `bun run --bun nx run admin-app:build --skip-nx-cache` completed.                                                                                                                                              |
| Vike SSR build under Bun          | Pass                         | `bun run --bun nx run site-app:build --skip-nx-cache` completed.                                                                                                                                               |
| Expo web export under Bun         | Pass                         | `bun run --bun nx run mobile-app:export --skip-nx-cache` exported the mobile web bundle.                                                                                                                       |
| Vike development server under Bun | Pass                         | `bun run --bun nx run site-app:serve` served the application on `localhost:4203`; HTTP `/` returned 200.                                                                                                       |
| Vike production runtime on Bun    | Pass                         | The built `dist/apps/frontend/site/server/index.js` ran directly with Bun; `/health`, `/`, and `/problems` returned 200.                                                                                       |
| Nest production artifact on Bun   | Pass for local smoke         | The built auth API ran directly with Bun using development in-memory auth. `/live` and `/ready` returned 200, and readiness identified Bun. This is not production dependency/telemetry certification.         |
| Backend unit tests on Bun         | Pass                         | The supported lane passed 43 bootstrap, 39 exception, 48 health, and 8 auth API tests; one intentionally environment-gated auth test was skipped.                                                              |
| Backend E2E on Bun                | Runtime pass, coverage fail  | Three auth API E2E tests passed and one environment-gated test skipped when V8 coverage was disabled. The normal config still requires Node's inspector-backed coverage APIs.                                  |
| Repository doctor on Bun          | Pass                         | The doctor reports Bun 1.3.14 instead of its Node compatibility value and verifies canonical pnpm through Node so Bun's shebang override cannot produce a false failure.                                       |
| Tooling static check on Bun       | Outside supported contract   | The checker relies on Node's `--check`, `--test`, `--import`, and `--test-isolation` flags. It remains in the mandatory Node lane rather than weakening those checks for Bun.                                  |
| Runtime health details            | Pass                         | Runtime health detects `process.versions.bun`; the Bun HTTP smoke requires the Nest readiness response to report `runtime: "bun"`.                                                                             |

The initial forced-Bun probes emitted repeated `NO_COLOR` versus `FORCE_COLOR`
warnings. The supported command removes both conflicting variables from child
processes, so the compatibility lane remains readable locally and in CI.

## Why a direct replacement is unsafe

### Package-manager and supply-chain policy

The canonical package metadata currently spans `package.json`,
`pnpm-workspace.yaml`, `.npmrc`, and `pnpm-lock.yaml`. It includes exact pnpm
pinning, strict manager enforcement, dependency overrides, package extensions,
minimum release age, build-script approval, offline Docker fetches, and pnpm
deploy behavior.

Bun's one-time migration preserved the effective locked dependency graph, but
supporting future dependency changes requires permanent Bun-native policy:

1. Add root `workspaces`, Bun-compatible `overrides`, and
   `trustedDependencies: ["@swc/core", "nx"]`.
2. Add a pinned `.bun-version` and a reviewed `bunfig.toml` using isolated
   linking and `minimumReleaseAge = 86400` seconds.
3. Re-express the `react-native-worklets@0.10.0` missing-dependency extension,
   or prove that every clean Bun resolution retains the corrected graph.
4. Decide which lockfile is canonical. Long-lived dual `pnpm-lock.yaml` and
   `bun.lock` files need an automated parity/regeneration check; manual dual
   maintenance is not acceptable for the repository's supply-chain rules.
5. Replace pnpm-specific audit, fetch, deploy, filter, and `dlx` operations with
   tested Bun equivalents before removing pnpm.

### Repository commands and generators

Root scripts, the `nrb` CLI, QA commands, generators, generated READMEs, and
error messages contain executable pnpm and Node assumptions. High-impact
examples include:

- `dev` calls a pnpm script; `dev/fullstack.ts` spawns both `node` and `pnpm`.
- API contract/client generation spawns pnpm and Nx.
- Playwright, Lighthouse, Stryker, Spectral, Storybook, Docker E2E, and database
  flows explicitly require pnpm.
- The static checker uses `process.execPath` with Node-only CLI flags.
- Doctor and CI-alignment tests enforce pnpm and `pnpm-lock.yaml`.
- Scaffolding templates generate pnpm-only commands and backend projects with
  `generateLockfile: true`.

Introduce one package-manager/runtime adapter in repository tooling rather than
scattering `if Bun` branches. It should expose the current runtime, canonical
package manager, executable runner, workspace filter operation, and lockfile
path. Generated commands must consume the same adapter/contract.

### Tests and coverage

Vitest itself runs on Bun for the tested suites, but the repository's V8
coverage configuration depends on inspector APIs Bun does not implement. The
Node test runner is also used for repository scripts and tooling tests, while
Bun documents its `node:test` implementation as partial.

Keep the Node coverage lane initially. A future all-Bun lane must either:

- retain Vitest but use a coverage provider that works correctly on Bun and
  preserves the existing thresholds/artifacts, or
- migrate selected suites to `bun:test` with explicit parity for mocks,
  snapshots, timers, coverage, Nx reporting, and CI artifacts.

Do not disable coverage merely to make the Bun lane green.

### Deployment and production runtime

Production is currently Node/pnpm-shaped end to end:

- Docker stages use `node:24.18.0-alpine`, install pnpm, use `pnpm fetch`, and
  install or deploy pruned application dependencies.
- Backend Nx projects generate a pruned `package.json` and pnpm lockfile.
- Runtime images and Compose health checks invoke `node`.
- The secret entrypoint drops privileges to the `node` user.
- Single-server tooling downloads Node archives, installs Corepack/pnpm, and
  creates systemd commands around `/usr/local/bin/node`.
- CI, release, CodeQL, and dependency-review workflows set up Node and cache the
  pnpm lockfile.

The lowest-risk production experiment is to keep the existing pnpm builder and
pruned `node_modules`, then replace only the final runtime command/image with
Bun. A full Bun builder needs a replacement for Nx's unsupported Bun lockfile
generation and pnpm's portable `deploy` output. Installing the entire production
workspace is a functional fallback, but image size and attack-surface regression
must be measured before acceptance.

Before a production rollout, certify PostgreSQL/MikroORM, Redis, NATS,
`AsyncLocalStorage` request IDs, graceful shutdown, worker/child-process paths,
Node-API packages, source maps, memory behavior, and OTLP export against real
services. Bun implements `AsyncLocalStorage`, but its surrounding async hooks
support remains partial; passing a few HTTP requests is not sufficient proof.

## Recommended rollout

### Phase 0: supported alternative Bun runtime lane — implemented

Node 24 and pnpm 11.15.1 remain canonical. The repository now includes:

- the exact Bun 1.3.14 pin in `.bun-version`;
- the stable `pnpm run bun:check` command, which forces Nx and child JavaScript
  tools to execute under Bun;
- a CI compatibility job for the Nx graph, Nest build/runtime, Vite build,
  Vike build/runtime, Expo web export, and selected unit/E2E tests without
  replacing the mandatory Node coverage job;
- correct health reporting via `process.versions.bun`;
- a Bun-aware doctor that distinguishes Bun from its Node compatibility value.

Acceptance: the optional lane is reproducible and green, while all existing
Node/pnpm checks and deployment artifacts remain unchanged.

### Phase 1: supported local Bun package manager

Make Bun metadata explicit, commit `bun.lock`, add the two trusted dependencies,
port supply-chain policy to `bunfig.toml`, and add clean-install parity checks on
Linux and macOS. Convert the CLI/runtime adapter and developer commands so
`bun install`, `bun nrb setup`, `bun dev`, builds, and non-coverage tests do not
need pnpm.

Keep Node/pnpm deployment until the new lock and generated workspace behavior
survive dependency updates, setup/scaffolding verification, and security audit.

### Phase 2: production Bun runtime

Use the existing build/pruning pipeline initially and run the artifacts on Bun
in a canary runtime image. Add real dependency and OpenTelemetry integration
tests, load/soak comparisons, graceful shutdown tests, and rollback-ready image
selection. Fix the runtime user, Compose commands, health checks, and deployment
validators.

Acceptance: feature parity, telemetry parity, no health/runtime misreporting,
no image-size/security regression, and measured memory/latency behavior under
the repository's production workload profile.

### Phase 3: Bun-native build and operations

Only after Phase 2 is stable, replace pnpm deploy/pruned-lock behavior, Node CI
setup, Docker builders, and single-server installation. Remove the pnpm lock and
policy only when Bun is the sole canonical package manager and every generator,
doctor, validator, CI workflow, deployment mode, and recovery runbook agrees.

## Current implementation boundary

The supported contract stops at Phase 0. It provides continuous runtime
compatibility evidence without weakening existing reproducibility or coverage
guarantees. Package-manager and production-image migration remain separate work
because their rollback, supply-chain, observability, and security boundaries are
materially different.
