# @repo/tooling

Workspace-local tooling package for repository scripts. Implementations live under `packages/tooling/scripts` grouped by domain:

- `api/` OpenAPI export, contract generation/checks, and typed client generation/checks.
- `db/` environment loading, migrations, seed/reset/backup/restore helpers.
- `docker/` Docker runtime checks, smoke tests, and fullstack e2e wrappers.
- `dev/` local fullstack orchestration.
- `project/` repository/project maintenance helpers.
- `testing/` Storybook, browser e2e coverage, and visual regression helpers.
- `qa/` local QA presets for OpenAPI lint/fuzz, consumer contracts, accessibility, browser matrix, performance, security SAST/secret scanning/DAST, mutation, and property checks.
- `src/` shared TypeScript helper exports.

Root `tools/*` files are compatibility shims only; update implementations here.

All QA presets are designed to be useful locally without depending on GitHub Actions. Expensive presets support `--dry-run` and environment variables documented in `docs/testing/modern-qa.md` so CI can choose a different cadence later.
