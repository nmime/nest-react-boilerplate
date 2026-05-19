# Testing matrix

| Layer                             | Command                                            | Notes                                                                                                          |
| --------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Formatting                        | `pnpm run format:check`                            | Prettier check for source, generated artifacts, docs, and config files.                                        |
| API contract freshness            | `pnpm api:contracts:check`                         | Regenerates OpenAPI/contract output in a temp area and compares it with committed files.                       |
| Frontend client freshness         | `pnpm api:clients:check`                           | Regenerates `@app/api-client` generated files from committed OpenAPI specs and checks for drift.              |
| Unit/component UI/API             | `pnpm run test` or `pnpm run test:coverage`        | Vitest with 100% gates for testable source.                                                                    |
| Backend Testcontainers components | `pnpm run test:component`                          | Postgres Testcontainers coverage for repository and auth module/controller/service wiring.                     |
| Static/browser frontend e2e       | `pnpm run test:e2e` / `pnpm run test:e2e:coverage` | Builds frontend apps and runs Playwright smoke/coverage checks.                                                |
| Docker smoke                      | `pnpm run test:docker-smoke`                       | Builds/starts compose stack, probes APIs/frontends/proxies, then cleans up.                                    |
| Fullstack e2e                     | `pnpm run test:fullstack`                          | Playwright suite under `apps/e2e/fullstack` against Docker Compose, real Postgres, APIs, nginx, and frontends. |

The fullstack suite runs deterministic API-backed auth/user/admin flows plus frontend route assertions. UI-only registration/login remains intentionally light to avoid brittle form coupling; core auth persistence and same-origin proxy paths are exercised through HTTP and browser assertions.

Database-backed component, Docker smoke, and fullstack tests use the same MikroORM migrator path as local development. Successful runs should leave `mikro_orm_migrations` tracking applied migrations; rerunning `pnpm run db:migrate` should report zero newly executed migrations.

## Preference-flow coverage

Locale/theme preference changes cross backend persistence, generated contracts, API-client wrappers, MobX shell state, and authenticated app/admin flows. For those changes, include the following in the validation report when feasible:

1. `pnpm api:contracts:check` and `pnpm api:clients:check` for OpenAPI/generated client freshness.
2. Backend auth tests for default `system` theme, valid partial preference updates, unsupported locale/theme 400 responses, persistence, JWT/session/authenticated user views, and the `PATCH /auth/me/locale` compatibility route.
3. Shared frontend UI tests for `boilerplate.theme`, invalid stored fallback, `document.documentElement.lang`, `data-theme`, `data-theme-preference`, and `prefers-color-scheme` updates.
4. App/admin tests proving authenticated backend preferences are applied and generated `authControllerUpdatePreferences` mutations are called for language/theme changes.
5. The raw-fetch and hardcoded-copy guards so preference flows continue to use generated clients and translation keys.

Use targeted Nx project tests first when iterating, then run the broader `pnpm run check` path before marking a pull request ready when the environment can support a complete install and test run.
