# @repo/tooling

Workspace-local tooling package for repository scripts. Use the TypeScript CLI entrypoint instead of wiring root scripts to individual files:

```bash
node packages/tooling/bin/repo-tooling.mjs --help
node packages/tooling/bin/repo-tooling.mjs project check-library-configs
node packages/tooling/bin/repo-tooling.mjs qa mutation --dry-run
```

New commands should be implemented under `packages/tooling/src/commands` and registered in `packages/tooling/src/cli.ts`. The package uses `jiti` so command implementations stay in TypeScript without a build step for local workspace usage.

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

All QA presets are designed to be useful locally without depending on GitHub Actions. Expensive presets support `--dry-run` and environment variables documented in `docs/testing/modern-qa.md` so CI can choose a different cadence later.
