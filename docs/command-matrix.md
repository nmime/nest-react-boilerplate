# Command matrix

Use this matrix as the supported DX contract for local development and CI. Prefer these package scripts over direct `nx` or ad-hoc `node packages/tooling/scripts/*` calls so command names stay stable while implementations move.

| Goal                         | Command                                       | When to run                               | Notes                                                                                                       |
| ---------------------------- | --------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Start all serve targets      | `pnpm dev`                                    | Daily development                         | Uses Nx `run-many -t serve`.                                                                                |
| Start Docker fullstack       | `pnpm dev:fullstack`                          | Product walkthroughs and cross-app checks | Routes through `repo-tooling dev fullstack`.                                                                |
| Start local Postgres         | `pnpm dev:db`                                 | Before API/database work                  | Uses the root Docker Compose file.                                                                          |
| Build everything             | `pnpm build`                                  | Before release or image builds            | Runs all Nx build targets.                                                                                  |
| Unit/component tests         | `pnpm test`                                   | Before every PR                           | Runs all Nx test targets.                                                                                   |
| Coverage gate                | `pnpm run test:coverage`                      | Runtime TypeScript changes                | Runs configured coverage gates for testable app and library source.                                         |
| Frontend component tests     | `pnpm test:component`                         | UI library or page changes                | Runs component-test targets.                                                                                |
| E2E smoke                    | `pnpm test:e2e`                               | Cross-app behavior changes                | Covers `admin-app`, `user-app`, `landing-app`, `backend-admin-app-api`, `user-app-api`, and `auth-app-api`. |
| Docker fullstack             | `pnpm run docker:fullstack`                   | Docker/local stack validation             | Builds and starts the full-stack `docker/docker-compose.yml` stack through repository tooling.              |
| Docker smoke                 | `pnpm run test:docker-smoke`                  | Docker image or Compose changes           | Runs the Docker smoke stack validation used by CI.                                                          |
| Deployment config validation | `node scripts/validate-deployment-config.mjs` | Docker, Helm, env, or deployment changes  | Runs static deployment assertions; CI runs it before Helm rendering.                                        |
| Docker teardown              | `pnpm run docker:down`                        | After Docker validation                   | Stops the full-stack Compose services and removes orphans.                                                  |
| Fullstack Playwright         | `pnpm run test:fullstack`                     | Docker-backed full-stack behavior         | Runs full-stack Playwright checks against the Docker Compose stack.                                         |
| Lint                         | `pnpm lint`                                   | Before PR                                 | Enforces workspace import and code rules.                                                                   |
| Typecheck                    | `pnpm typecheck`                              | Before PR                                 | Runs all Nx typecheck targets.                                                                              |
| Format                       | `pnpm format` / `pnpm format:check`           | Before PR / CI                            | Prettier with unknown file support.                                                                         |
| Fast PR preflight            | `pnpm run check:fast`                         | Before every PR                           | Runs format check plus Nx lint, typecheck, and tests without release-risk gates.                            |
| Dependency audit             | `pnpm run audit`                              | Before dependency PRs and CI              | Runs the repository script with moderate-or-higher vulnerability gating.                                    |
| Database migrate             | `pnpm db:migrate`                             | After changing migrations                 | Uses tooling env loader.                                                                                    |
| Migration drift check        | `pnpm db:migrations:check`                    | Before PR with DB changes                 | Validates naming and drift.                                                                                 |
| API OpenAPI export           | `pnpm api:openapi`                            | API shape changes                         | Produces OpenAPI contracts.                                                                                 |
| API client generation        | `pnpm api:clients`                            | After OpenAPI changes                     | Updates generated clients.                                                                                  |
| API contract check           | `pnpm api:contracts:check`                    | CI and API PRs                            | Fails on stale contracts.                                                                                   |
| Generate a vertical slice    | `pnpm generate:feature <name> -- --dry-run`   | Before starting a product feature         | Scaffolds DTO/controller/service/entity/migration/client/UI/checklist. Remove `--dry-run` to write files.   |
| Full quality gate            | `pnpm check`                                  | Before merging release-risk work          | Runs formatting, API, QA, lint, typecheck, and tests.                                                       |
| Quality preset sweep         | `pnpm run quality:presets`                    | Release-risk or scheduled QA sweeps       | Runs the modern QA preset bundle documented in `docs/testing/modern-qa.md`.                                 |

## Recommended PR preflight

For most changes, run the fast local preflight before opening a PR:

```bash
pnpm run check:fast
```

Add targeted checks from the table above for migrations, dependency changes, cross-app behavior, Docker/deployment work, or release-risk changes.

## Project names and paths

| Project                 | Path                         | Purpose                                         |
| ----------------------- | ---------------------------- | ----------------------------------------------- |
| `landing-app`           | `apps/frontend/landing`      | Marketing/landing React app.                    |
| `user-app`              | `apps/frontend/app`          | Authenticated user React app.                   |
| `admin-app`             | `apps/frontend/admin`        | Admin React app.                                |
| `auth-app-api`          | `apps/backend/auth-app-api`  | Auth/session API.                               |
| `user-app-api`          | `apps/backend/user-app-api`  | User-facing API.                               |
| `backend-admin-app-api` | `apps/backend/admin-app-api` | Admin-facing API.                               |
| `@app/frontend-ui`      | `libs/frontend/ui/lib`       | Shared UI, state, i18n, query, and API helpers. |

## Tooling policy

- Add new local automation under `packages/tooling/src` and expose it through `packages/tooling/bin/repo-tooling.mjs` plus a root package script when it is part of the public DX.
- Do not add root-level `tools/` or `scripts/` compatibility wrappers; they were removed in favor of the workspace tooling package.
- If a command appears in docs, it must appear here or in `packages/tooling/README.md`.
