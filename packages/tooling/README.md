# @repo/tooling

Workspace-local tooling package for repository scripts. Use the TypeScript CLI entrypoint instead of wiring root scripts to individual files:

```bash
pnpm --filter @repo/tooling tooling --help
pnpm --filter @repo/tooling tooling project check-library-configs
pnpm --filter @repo/tooling tooling project generate-vertical-slice invoices \
  --api-app user-app-api \
  --frontend-app user-app \
  --dry-run
pnpm --filter @repo/tooling tooling qa mutation --dry-run
pnpm --filter @repo/tooling tooling images webp --dry-run
pnpm --filter @repo/tooling tooling ui shadcn add dialog
pnpm --filter @repo/tooling tooling ui registry search --source magicui --query ripple
pnpm --filter @repo/tooling tooling ui registry add --source magicui ripple --view
pnpm --filter @repo/tooling tooling tooling static-check
pnpm --filter @repo/tooling tooling project dependency-map --json
pnpm --filter @repo/tooling tooling db migrations rollback-check
pnpm nrb closure check
pnpm nrb closure install
pnpm nrb closure run build
pnpm nrb closure materialize --all-reference --provider postgres
pnpm --filter @repo/tooling tooling spec validate
pnpm --filter @repo/tooling tooling spec verify --lane pr --base origin/main --head HEAD
pnpm run bun:check
```

New commands should be implemented under `packages/tooling/src/commands` and registered in `packages/tooling/src/cli.ts`. Product-facing command names should also be listed in `docs/command-matrix.md`. The package uses `jiti` so command implementations stay in TypeScript without a build step for local workspace usage.

TS-first command implementations live under `packages/tooling/src/commands` grouped by domain:

- `api/` OpenAPI export, contract generation/checks, and typed client generation/checks.
- `db/` environment loading, migrations, seed/reset/backup/restore helpers.
- `docker/` Docker runtime checks, smoke tests, and fullstack e2e wrappers.
- `dev/` local fullstack orchestration.
- `project/` repository/project maintenance helpers.
  `project dependency-map` reports live dependency ownership and counts for every pnpm workspace.
  `closure` derives and enforces setup-selected Nx projects, exact product
  external packages, and separately declared tooling support packages. Setup
  writes selected manifests only; lock generation and installation require the
  explicit `closure install` command, which replaces prior workspace links with
  `.nrb/closure/node_modules`. Use `pnpm run tooling:install` only when
  explicitly restoring the full maintainer workspace. Maintainer reference
  closure generation is explicit and provider-specific.
- `images/` asset optimization helpers such as PNG/JPG/JPEG to WebP conversion.
- `ui/` reviewed source-owned shadcn/Magic UI discovery and import helpers.
  Aceternity is non-persistent research preview only: this template never
  applies or distributes it, and each downstream product must explicitly own
  any later licence, dependency, source, integration, and test decision.
- `testing/` Storybook, browser e2e coverage, and visual regression helpers.
- `qa/` local QA presets for resource-aware aggregate tests, OpenAPI lint/fuzz, consumer contracts, accessibility, browser matrix, performance, security SAST/secret scanning/DAST, mutation, and property checks.
- `spec/` OpenSpec validation, complete trace generation, revision impact
  calculation, executable-test marker enforcement, requirement-level project
  ownership, lane-aware evidence execution, and dossier rendering.

Do not add root-level `tools/` wrappers. New local commands should be routed through `repo-tooling`.

`repo-tooling tooling static-check` is the safe static validation entrypoint for operational TypeScript tooling. It checks command-module import graphs, help-only CLI smoke runs, TypeScript typechecking, package-script and tooling-command references, the tooling generator regression suite, and stale architecture/version denylist terms, including retired Postgres shared-library path spellings, without starting Docker, deploy, destructive, or runtime-stack work (the regression-suite child is hermetic). Local `.claude/worktrees/**` storage is outside every repository inventory. Historical working specs under `docs/superpowers/**` are excluded only from the current architecture/version denylist and remain subject to applicable safety and structure rules. `repo-tooling db migrations rollback-check` is intentionally separate: it is the real Testcontainers/PostgreSQL rollback check and requires a Docker-capable environment.

## `tooling:static-check` output and memory model

`pnpm run tooling:static-check` is the first gate of both `ci:pr` and `check:fast`. Its heavy checks run as a strictly sequential worker pool (`spawnSync`, one child at a time) with per-child heap caps appended last to the inherited `NODE_OPTIONS`, so an operator-set larger cap cannot override the gate cap:

| Child                                                                                                 | Cap    |
| ----------------------------------------------------------------------------------------------------- | ------ |
| Syntax checks (`node --check`)                                                                        | 512 MB |
| Tooling typecheck (`tsc --noEmit -p packages/tooling/tsconfig.json`)                                  | 1 GiB  |
| Tooling generator regression suite (`run-tests.mjs`, `SKIP_INTEGRATION=1`, `NODE_TEST_CONCURRENCY=1`) | 1 GiB  |
| CLI smoke commands (12 `repo-tooling ... --help` invocations)                                         | 512 MB |
| Frontend FSD self/workspace checks                                                                    | 512 MB |

The parent process is capped at 1 GiB by the `packages/tooling` npm script, so the worst-case footprint is the parent plus the single largest child, never their sum. Measured in a 4 GB cgroup, the gate completes in roughly 158 s at about a 1.4 GB tree peak.

On success the command prints exactly one machine-readable JSON line on stdout (no `phases` array):

```json
{
  "status": "ok",
  "checkedSyntax": "<n>",
  "toolingTypecheck": "ok",
  "generatorRegressionTests": "ok",
  "commandImportSmoke": "<n>",
  "importSmoke": "<n>",
  "frontendFsdSelfTest": "ok",
  "frontendFsdWorkspaceCheck": "ok",
  "workspaceMetadata": "ok",
  "generatedContractImportPatterns": "<n>",
  "staleReferenceDenylist": "<n>",
  "packageScriptReferences": "<n>"
}
```

The `<n>` counts describe the current tree (checked syntax files, import-smoked command modules, smoke commands, static guard table sizes, and extracted script references); the `"ok"` strings are phase-level booleans by name. On failure the command exits 1 and prints a human-readable per-check list (command, file, exit code, stderr/stdout tails) on stderr — there is no JSON failure contract.

Related memory models: workspace typecheck runs one fresh tsc child process per tsconfig instead of one accumulated whole-workspace program, so peak memory is the largest single program and heap is released between programs (the `--child` runner it spawns is plain JavaScript). Root `eslint.config.js` uses typescript-eslint `projectService` — one shared incremental tsserver program per lint process — for type-aware rules, while `packages/tooling` keeps the historical whole-workspace program.

All QA presets are designed to be useful locally without depending on GitHub Actions. Expensive presets support `--dry-run` and environment variables documented in `docs/testing/modern-qa.md` so CI can choose a different cadence later.

World-class executable command overrides are shell-free JSON argv arrays. The
CLI reuses the active pnpm/Corepack module on every platform and applies a
bounded timeout. Journey, observability, and concurrency evidence requires an
explicit behavior command; HTTP-only probes remain canary/reliability evidence.

## CI/security/deployment guardrails

- `pnpm run tooling:static-check` performs syntax checks for repository tooling, safe CLI help smoke tests, package-script reference checks, generator regression tests, and stale architecture/version/Postgres path wording guards. It intentionally avoids running Docker, deployment, or destructive database commands.
- `pnpm run agent:skills:check` tests the skill validator and checks every
  repo-local skill's trigger metadata, context/evidence sections, local
  references, interface prompt, package hygiene, catalog entry, workflow
  discovery, and required specification-lifecycle routing.
- `pnpm run format:changed` checks only changed Prettier-supported files against `origin/main...HEAD`; use it in PR-sized gates when full-repository formatting is too memory-heavy. Formatting intentionally uses stock Prettier defaults plus `.prettierignore`; no explicit Prettier config is required unless style requirements change.
- `pnpm run images:webp` converts PNG/JPG/JPEG assets to WebP side-by-side by default. Use `pnpm run images:webp:check` for a non-mutating dry-run, pass input directories after `--`, and use `--replace` only when source image deletion is intended.
- `pnpm run test:security:secrets` runs the native secret scanner by default and can be promoted to gitleaks with `SECRET_SCAN_ENGINE=gitleaks`. If an external engine is explicitly requested and unavailable, the command fails unless `SECRET_SCAN_FAIL_ON_UNAVAILABLE_EXTERNAL=false` is set for local dry-runs. The gitleaks engine always names its config — the product-owned root `.gitleaks.toml`, overridable with `--gitleaks-config` or `GITLEAKS_CONFIG` — and writes gitleaks' own report beside the scan summary rather than over it.
- `pnpm run test:security:sast` runs native SAST rules by default and can be promoted to semgrep with `SECURITY_SAST_ENGINE=semgrep`. External engine unavailability is fail-closed by default.
- `pnpm run deploy:validate` is the no-deploy validation bundle for production Docker Compose plus optional Helm, GitOps/Argo, and PM2 modes. Local runs do not require Helm globally: Helm rendering is skipped when Helm is unavailable unless `pnpm run deploy:validate:helm`, `--mode=helm`, or `REQUIRE_HELM=true` is used.
- `pnpm run branch:cleanup:check` previews merged-branch cleanup. `pnpm run branch:cleanup -- --apply` is required to delete local merged branches; remote deletion additionally requires `--remote`. Protected branches (`main`, `master`, `develop`, `release/*`, `hotfix/*`, production/staging names, and `origin/HEAD`) are never candidates.
- `pnpm run git:conventions` validates typed branch names, Conventional Commit subjects, linear history, and agent attribution. Human and trusted dependency-bot identities are accepted; known assistant identities must be replaced by exact `nmime` author/committer ownership. Use `--branch <name> --range <revision-range>` for CI or history audits.

Node and package-manager versions are intentionally pinned through `.nvmrc`, `packageManager`, `engines`, and `.npmrc` strictness. Use Node 24.18.0 and pnpm 11.15.1 for the canonical toolchain. Bun 1.3.14 is pinned through `.bun-version`; after `pnpm nrb closure install`, `pnpm run bun:check` runs every selected server deployment artifact through real isolated startup/readiness/lifecycle or headless process probes under Node and Bun. Bun is a runtime only, never a second package manager.
