# Boilerplate Readiness, Setup CLI, and Nx Generators Design

**Date:** 2026-07-10
**Status:** Approved
**Baseline:** `0da22822f3fa6c222f9a55d4023174122259c830`

## Goal

Make every supported app and library buildable, testable, documented, and ready for extension, then provide one declarative setup engine exposed through both an `nrb` CLI and native Nx generators.

## Compatibility Policy

“Latest” means the newest version compatible with the supported runtime and framework matrix. Node remains on the latest Node 24 release supported by the repository. TypeScript remains on 6.x until NestJS and Nx explicitly support TypeScript 7 and the workspace's `baseUrl` aliases are migrated. Expo-managed dependencies follow Expo's compatibility matrix. Every deferment is recorded in `docs/dependency-management.md` with its exact constraint and revisit condition.

All 15 workspace manifests use one version for shared direct dependencies unless a documented runtime constraint requires otherwise. Production and development audit findings are resolved, removed, or explicitly blocked by an upstream issue; advisory metadata is never dismissed solely because another importer has a fixed copy.

## Baseline Findings

- 79 Nx projects and 15 pnpm workspace packages (`pnpm list -r --depth -1 --json`); generated and dependency manifests are excluded from this count.
- Frozen installation and the production audit pass.
- 45 outdated entries were reported; Docker uses pnpm 11.10.0 while the workspace declares 11.11.0.
- Better Auth client plugin exports have drifted, blocking frontend typechecks and builds.
- Frontend tests fail under React 19 because the production React condition is selected and `React.act` is unavailable.
- Tooling typechecks fail from an implicit-any callback and missing test/type dependencies.
- One confirmed lint error uses an unbound MikroORM method.
- Formatting currently reports broad drift and must be scoped to source-controlled, non-generated files before applying changes.
- The existing `project:init` is an untested token replacer; the vertical-slice generator has inline templates and no Nx generator entry point.

## Architecture

### Shared setup engine

`packages/tooling/src/setup/` owns configuration, planning, validation, and application. Front ends may collect inputs, but they cannot write files directly.

- `schema.ts`: versioned Zod schema for `nrb.config.json`.
- `presets.ts`: deterministic defaults for `minimal`, `web`, `fullstack`, `bots`, and `enterprise`.
- `catalog.ts`: supported apps and capabilities with dependency/conflict rules.
- `planner.ts`: converts current workspace state and requested config into an immutable operation plan.
- `operations.ts`: typed create/update/delete/json-merge operations.
- `apply.ts`: atomic application through a filesystem adapter with conflict detection.
- `state.ts`: `.nrb/state.json` schema, config digest, generator version, and applied operation hashes.
- `doctor.ts`: environment, manifest, dependency, Nx graph, and generated-state checks.
- `adapters/node-filesystem.ts`: CLI filesystem implementation.
- `adapters/nx-tree.ts`: Nx `Tree` implementation.

Operations are deterministic and idempotent. A second run with the same config produces an empty plan. Existing user content is never overwritten unless its prior generated hash matches state or `--force` is supplied. Destructive pruning is limited to a fresh clone or explicit `--prune`; dry-run remains the default preview for destructive operations.

### Configuration

`nrb.config.json` includes:

- `schemaVersion` and project identity.
- preset.
- selected applications: admin, user, landing, site, mobile, auth API, admin API, user API, Telegram API/worker, Discord API.
- capabilities: PostgreSQL/MikroORM, Redis, NATS, Better Auth providers, OpenTelemetry, Docker, Kubernetes/GitOps.
- package scope, domains, database name, organization, and default language.

Catalog rules reject invalid combinations before planning. Mobile remains Expo-compatible. Backend services keep NestJS/Fastify. Database selection initially supports the repository's tested PostgreSQL/MikroORM path; unsupported alternatives are rejected rather than generating non-working code.

### CLI

The package exposes `nrb` and keeps `repo-tooling` as a backward-compatible alias.

- `nrb setup [--config path] [--preset name] [--non-interactive] [--dry-run] [--prune] [--force]`
- `nrb doctor [--json]`
- `nrb add app <kind> <name>`
- `nrb add lib <kind> <name>`
- `nrb add feature <name> --api-app <api> --frontend-app <app>`

Interactive mode uses `node:readline/promises`, so setup does not add a prompt framework dependency. Noninteractive mode requires complete validated input and produces machine-readable failures.

### Nx generators

`packages/tooling/generators.json` exposes `setup`, `application`, `library`, and `feature`. Generator schemas provide `nx g ... --help`, validation, and defaults. Implementations use the shared planner with the Nx Tree adapter and call `formatFiles` only for touched files. The current vertical-slice command delegates to the `feature` planner so CLI and Nx output cannot drift.

### Documentation

`docs/README.md` becomes the central index. New guides cover quick start, configuration, presets/technology support, CLI, Nx generators, extension authoring, migration, and troubleshooting. After setup, generated projects receive `nrb.config.json` plus `.nrb/summary.md` containing the selected preset, apps, capabilities, applied operation count, and exact next commands; component tests assert both files.

## Safety and Compatibility

- Dirty-worktree guard for setup and pruning.
- Dry-run plan with stable ordering.
- Atomic writes and rollback on write failure.
- No secret values in config or state.
- Schema migration rejects unknown future versions and upgrades known older versions explicitly.
- Existing `pnpm init:project` and `pnpm generate:feature` continue to work.
- Generated files carry no fragile timestamps; deterministic snapshots remain stable.

## Test Strategy

- Unit: schemas, presets, catalog constraints, planners, state migration, argument parsing, and each template.
- Component: compose multiple generators against an in-memory tree and validate Nx/package/tsconfig integration.
- E2E: copy the repository to a disposable git worktree, run noninteractive setup, run setup again to prove idempotency, generate an app/lib/feature, and build/test the generated targets.
- Regression: frozen install, audit, format, lint, typecheck, all available builds and tests, backend component tests, auth E2E, and generator smoke runs.

## Acceptance

The campaign is complete only when compatible dependencies are current; all 79 source projects are classified as deployable, library, generated/static, or infrastructure-test and pass every target applicable to that class; the setup CLI and Nx generators pass unit/component/e2e tests; Markdown passes markdownlint, internal links resolve, and quick-start commands execute in a clean checkout; the remote GitHub tree matches the verified local tree; and every incompatible deferred major has an explicit documented reason and revisit trigger. Infrastructure-dependent E2E targets must run when Docker is available; otherwise their static generator validation runs and the environment limitation is recorded rather than represented as a pass.
