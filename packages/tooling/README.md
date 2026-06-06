# @repo/tooling

Workspace-local tooling package for repository scripts. Use the TypeScript CLI entrypoint instead of wiring root scripts to individual files:

```bash
node packages/tooling/bin/repo-tooling.mjs --help
node packages/tooling/bin/repo-tooling.mjs project check-library-configs
node packages/tooling/bin/repo-tooling.mjs project generate-vertical-slice invoices --dry-run
node packages/tooling/bin/repo-tooling.mjs qa mutation --dry-run
node packages/tooling/bin/repo-tooling.mjs tooling static-check
node packages/tooling/bin/repo-tooling.mjs db migrations rollback-check
```

New commands should be implemented under `packages/tooling/src/commands` and registered in `packages/tooling/src/cli.ts`. Product-facing command names should also be listed in `docs/command-matrix.md`. The package uses `jiti` so command implementations stay in TypeScript without a build step for local workspace usage.

Compatibility scripts still live under `packages/tooling/scripts` grouped by domain:

- `api/` OpenAPI export, contract generation/checks, and typed client generation/checks.
- `db/` environment loading, migrations, seed/reset/backup/restore helpers.
- `docker/` Docker runtime checks, smoke tests, and fullstack e2e wrappers.
- `dev/` local fullstack orchestration.
- `project/` repository/project maintenance helpers.
- `testing/` Storybook, browser e2e coverage, and visual regression helpers.
- `qa/` local QA presets for OpenAPI lint/fuzz, consumer contracts, accessibility, browser matrix, performance, security SAST/secret scanning/DAST, mutation, and property checks.
- `src/` TypeScript CLI, commands, and shared runtime helpers.

Do not add root-level `tools/` wrappers. New local commands should be routed through `repo-tooling`.

`repo-tooling tooling static-check` is the safe static validation entrypoint for operational `.mjs` tooling. It checks syntax and help-only CLI imports without executing deploy, Docker, destructive, or runtime-heavy scripts. `repo-tooling db migrations rollback-check` is intentionally separate: it is the real Testcontainers/PostgreSQL rollback check and requires a Docker-capable environment.

All QA presets are designed to be useful locally without depending on GitHub Actions. Expensive presets support `--dry-run` and environment variables documented in `docs/testing/modern-qa.md` so CI can choose a different cadence later.
