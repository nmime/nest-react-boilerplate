# @repo/tooling

Workspace-local tooling package for repository scripts. Use the TypeScript CLI entrypoint instead of wiring root scripts to individual files:

```bash
pnpm --filter @repo/tooling tooling --help
pnpm --filter @repo/tooling tooling project check-library-configs
pnpm --filter @repo/tooling tooling project generate-vertical-slice invoices --dry-run
pnpm --filter @repo/tooling tooling qa mutation --dry-run
pnpm --filter @repo/tooling tooling tooling static-check
pnpm --filter @repo/tooling tooling db migrations rollback-check
```

New commands should be implemented under `packages/tooling/src/commands` and registered in `packages/tooling/src/cli.ts`. Product-facing command names should also be listed in `docs/command-matrix.md`. The package uses `jiti` so command implementations stay in TypeScript without a build step for local workspace usage.

TS-first command implementations live under `packages/tooling/src/commands` grouped by domain:

- `api/` OpenAPI export, contract generation/checks, and typed client generation/checks.
- `db/` environment loading, migrations, seed/reset/backup/restore helpers.
- `docker/` Docker runtime checks, smoke tests, and fullstack e2e wrappers.
- `dev/` local fullstack orchestration.
- `project/` repository/project maintenance helpers.
- `testing/` Storybook, browser e2e coverage, and visual regression helpers.
- `qa/` local QA presets for OpenAPI lint/fuzz, consumer contracts, accessibility, browser matrix, performance, security SAST/secret scanning/DAST, mutation, and property checks.

Do not add root-level `tools/` wrappers. New local commands should be routed through `repo-tooling`.

`repo-tooling tooling static-check` is the safe static validation entrypoint for operational TypeScript tooling. It checks help-only CLI imports, command module presence, TypeScript typechecking, and package-script references without executing deploy, Docker, destructive, or runtime-heavy scripts. `repo-tooling db migrations rollback-check` is intentionally separate: it is the real Testcontainers/PostgreSQL rollback check and requires a Docker-capable environment.

All QA presets are designed to be useful locally without depending on GitHub Actions. Expensive presets support `--dry-run` and environment variables documented in `docs/testing/modern-qa.md` so CI can choose a different cadence later.

## CI/security/deployment guardrails

- `pnpm run tooling:static-check` performs syntax checks for repository tooling and safe CLI help smoke tests. It intentionally avoids running Docker, deployment, or destructive database commands.
- `pnpm run format:changed` checks only changed Prettier-supported files against `origin/main...HEAD`; use it in PR-sized gates when full-repository formatting is too memory-heavy.
- `pnpm run test:security:secrets` runs the native secret scanner by default and can be promoted to gitleaks with `SECRET_SCAN_ENGINE=gitleaks`. If an external engine is explicitly requested and unavailable, the command fails unless `SECRET_SCAN_FAIL_ON_UNAVAILABLE_EXTERNAL=false` is set for local dry-runs.
- `pnpm run test:security:sast` runs native SAST rules by default and can be promoted to semgrep with `SECURITY_SAST_ENGINE=semgrep`. External engine unavailability is fail-closed by default.
- `pnpm run deploy:validate` is the no-deploy validation bundle for production Docker Compose, Helm, and deployment docs/config hardening.
- `pnpm run branch:cleanup:check` previews merged-branch cleanup. `pnpm run branch:cleanup -- --apply` is required to delete local merged branches; remote deletion additionally requires `--remote`. Protected branches (`main`, `master`, `develop`, `release/*`, `hotfix/*`, production/staging names, and `origin/HEAD`) are never candidates.

Node and package-manager versions are intentionally pinned through `.nvmrc`, `packageManager`, `engines`, `devEngines`, and `.npmrc` strictness. Use Node 26.x and pnpm 11.5.2 for local parity with CI.
