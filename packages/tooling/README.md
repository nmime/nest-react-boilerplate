# @repo/tooling

Workspace-local tooling package for repository scripts. Implementations live under `packages/tooling/scripts` grouped by domain:

- `api/` OpenAPI export, contract generation/checks, and typed client generation/checks.
- `db/` environment loading, migrations, seed/reset/backup/restore helpers.
- `docker/` Docker runtime checks, smoke tests, and fullstack e2e wrappers.
- `dev/` local fullstack orchestration.
- `project/` repository/project maintenance helpers.
- `testing/` Storybook, visual, browser e2e coverage, and static smoke helpers.
- `qa/` optional modern QA presets for OpenAPI lint/fuzz, accessibility, browser matrix, performance, security DAST, mutation, and property checks.
- `src/` shared TypeScript helper exports.

Root `tools/*` files are compatibility shims only; update implementations here.
