# Testing matrix

| Layer                             | Command                                            | Notes                                                                                                          |
| --------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Unit/component UI/API             | `pnpm run test` or `pnpm run test:coverage`        | Vitest with 100% gates for testable source.                                                                    |
| Backend Testcontainers components | `pnpm run test:component`                          | Postgres Testcontainers coverage for repository and auth module/controller/service wiring.                     |
| Static/browser frontend e2e       | `pnpm run test:e2e` / `pnpm run test:e2e:coverage` | Builds frontend apps and runs Playwright smoke/coverage checks.                                                |
| Docker smoke                      | `pnpm run test:docker-smoke`                       | Builds/starts compose stack, probes APIs/frontends/proxies, then cleans up.                                    |
| Fullstack e2e                     | `pnpm run test:fullstack`                          | Playwright suite under `apps/e2e/fullstack` against Docker Compose, real Postgres, APIs, nginx, and frontends. |

The fullstack suite runs deterministic API-backed auth/user/admin flows plus
frontend route assertions. UI-only registration/login remains intentionally light
to avoid brittle form coupling; core auth persistence and same-origin proxy paths
are exercised through HTTP and browser assertions.

Database-backed component, Docker smoke, and fullstack tests use the same MikroORM migrator path as local development. Successful runs should leave `mikro_orm_migrations` tracking applied migrations; rerunning `pnpm run db:migrate` should report zero newly executed migrations.
