# Nest React Boilerplate

[![Node.js](https://img.shields.io/badge/node-26-brightgreen)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-11.5.2-orange)](https://pnpm.io)
[![Nx](https://img.shields.io/badge/Nx-22-blue)](https://nx.dev)

A production-oriented Nx monorepo starter for teams building React frontends and NestJS APIs on PostgreSQL. It includes three React apps, three NestJS APIs, shared libraries, OpenAPI contract generation, database migrations, Docker Compose stacks, and GitHub Actions quality gates.

## What is included

- **Frontend apps:** `landing-app`, `user-app`, and `admin-app` under `apps/frontend/**`.
- **Backend APIs:** `auth-app-api`, `user-app-api`, and `backend-admin-app-api` under `apps/backend/**`.
- **Shared libraries:** backend common/feature/PostgreSQL libraries, frontend UI/API/state libraries, and cross-runtime contracts/i18n libraries under `libs/**`.
- **Productization:** committed OpenAPI contracts, generated clients, CI quality gates, Docker images, local/fullstack Compose, production Compose notes, operations docs, and security/dependency checks.

## Repository layout

```text
apps/             backend APIs, frontend apps, and e2e suites
libs/             shared backend, frontend, feature, common, and PostgreSQL libraries
contracts/        generated committed API contracts, including contracts/openapi
packages/tooling/ domain-grouped repository tooling and QA preset scripts
docs/             architecture, testing, deployment, and operations notes
docker/           full-stack Compose and nginx files
Dockerfile        multi-stage backend/frontend/migrator image build
```

## Prerequisites

| Tool           | Version / note                                                               |
| -------------- | ---------------------------------------------------------------------------- |
| Node.js        | `>=26 <27`; `.nvmrc` pins local development to `26.1.0`                      |
| pnpm           | `11.5.2` from `packageManager`; use Corepack                                 |
| Nx             | `22.7.5` local workspace version; run through `pnpm nx ...`                  |
| Docker Compose | Required for local PostgreSQL, Docker smoke tests, and full-stack containers |
| Git            | Required for normal contribution flow                                        |

Recommended setup:

```bash
nvm use              # or install the Node version from .nvmrc
corepack enable
corepack prepare pnpm@11.5.2 --activate
pnpm install --frozen-lockfile
```

## Quick start: local services

```bash
cp .env.example .env
pnpm run dev:db
pnpm run db:migrate
pnpm run dev:fullstack
```

What this does:

1. `dev:db` starts the root `docker-compose.yml` PostgreSQL service.
2. `db:migrate` runs the MikroORM migrations against `DATABASE_URL` or the local `POSTGRES_*` defaults.
3. `dev:fullstack` starts the three APIs and three Vite frontends with local API base URL defaults.

OpenAPI docs are available at each API's configured `OPENAPI_PATH` when `OPENAPI_ENABLED=true` (enabled in `.env.local.example`, disabled in production examples). APIs share health endpoints from `@app/common/health`: `/health`, `/health/private`, `/live`, and `/ready`; see [API conventions](docs/api-conventions.md#health).

## Running individual apps

Use Nx project names for targeted development:

```bash
# Backend APIs
pnpm nx serve auth-app-api
pnpm nx serve user-app-api
pnpm nx serve backend-admin-app-api

# Frontend apps
pnpm nx serve landing-app
pnpm nx serve user-app
pnpm nx serve admin-app
```

Default local API ports are configured through environment variables: admin API `3001`, user API `3002`, and auth API `3003`. Vite prints the frontend dev-server URL when each frontend starts.

### Design-system and split-tooling checks

- `pnpm run storybook`, `pnpm run storybook:build`, and `pnpm run test:storybook` use the shared UI Storybook config in `libs/frontend/ui/lib/.storybook`.
- `pnpm run frontend:fsd:check` enforces frontend FSD boundaries and public APIs across the split frontend apps/libs.
- `pnpm run lib:configs:check` verifies library config placement after library splits; `pnpm run tooling:static-check` verifies tooling module syntax/typecheck, safe CLI smoke checks, package script references, and the FSD checker.
- API and persistence freshness gates are `pnpm run api:contracts:check`, `pnpm run api:clients:check`, `pnpm run api:openapi:lint`, and `pnpm run db:migrations:check`.

## Environment files and variables

Start from the examples and keep real values out of git:

| File                      | Purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| `.env.example`            | Complete local/reference key list with safe placeholders. |
| `.env.local.example`      | Developer defaults for local apps and local PostgreSQL.   |
| `.env.test.example`       | Test defaults, including in-memory auth persistence.      |
| `.env.production.example` | Production/Compose placeholders and secret-file examples. |

Important variable groups:

| Group                       | Keys                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime mode and ports      | `NODE_ENV`, `PORT`, `ADMIN_APP_API_PORT`, `USER_APP_API_PORT`, `AUTH_APP_API_PORT`, `ADMIN_APP_PORT`, `USER_APP_PORT`, `LANDING_APP_PORT`                                                               |
| Database                    | `DATABASE_URL` or `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_SSL`, `POSTGRES_SSL_REJECT_UNAUTHORIZED`, `POSTGRES_SYNCHRONIZE`, `POSTGRES_LOGGING` |
| Browser/CORS                | `CORS_ORIGINS`, `VITE_AUTH_API_BASE_URL`, `VITE_USER_API_BASE_URL`, `VITE_ADMIN_API_BASE_URL`, `VITE_API_BASE_URL_MODE`                                                                                 |
| Auth/RBAC                   | `AUTH_PERSISTENCE`, `AUTH_JWT_SECRET`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`, `AUTH_JWT_EXPIRES_IN_SECONDS`, `ADMIN_BOOTSTRAP_ENABLED`, `ADMIN_BOOTSTRAP_EMAILS`, `ADMIN_BOOTSTRAP_TENANT_IDS`         |
| Auth token cleanup          | `AUTH_TOKEN_CLEANUP_ENABLED`, `AUTH_TOKEN_CLEANUP_INTERVAL_MS`, `AUTH_TOKEN_CLEANUP_RUN_ON_START`                                                                                                       |
| OAuth/OIDC                  | `AUTH_OAUTH_ENABLED`, `AUTH_OAUTH_ISSUER_URL`, `AUTH_OAUTH_CLIENT_ID`, `AUTH_OAUTH_CLIENT_SECRET`, `AUTH_OAUTH_REDIRECT_URI`, `AUTH_OAUTH_SCOPES`                                                       |
| Analytics                   | `ANALYTICS_ENABLED`, `ANALYTICS_PROVIDER`, `ANALYTICS_PROVIDERS`, `ANALYTICS_APP_NAME`, `ANALYTICS_ENVIRONMENT`, `ANALYTICS_GA4_*`, `ANALYTICS_POSTHOG_*`, `ANALYTICS_UMAMI_*`                          |
| Rate limiting / Redis       | `RATE_LIMIT_ENABLED`, `RATE_LIMIT_STORE`, `RATE_LIMIT_IN_MEMORY_ALLOWED`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `REDIS_URL`, `REDIS_HOSTS`, `REDIS_MODE`, `REDIS_KEY_PREFIX`, `REDIS_DB`            |
| OpenAPI / telemetry / proxy | `OPENAPI_ENABLED`, `OPENAPI_ALLOW_PRODUCTION`, `OPENAPI_PATH`, `OPENAPI_TITLE`, `OPENAPI_VERSION`, `OTEL_*`, `TRUST_PROXY`, `LOG_LEVEL`                                                                 |
| Production images/secrets   | `IMAGE_REGISTRY`, `IMAGE_TAG`, `AUTH_JWT_SECRET_FILE`, `POSTGRES_PASSWORD_FILE`                                                                                                                         |

Security defaults are intentionally conservative: production CORS has no wildcard, admin bootstrap is disabled unless explicitly enabled, OpenAPI is disabled in production examples, production frontend builds require explicit API origins or `VITE_API_BASE_URL_MODE=same-origin`, URL bearer-token bootstrap is ignored outside development/test modes, and OAuth is disabled until provider-specific product code is configured.

## Architecture overview

```text
React frontends (landing/user/admin)
        |
        | Vite dev URLs or nginx same-origin proxy in Docker
        v
NestJS APIs (auth/user/admin) ---- PostgreSQL via MikroORM migrations
        |
        +-- shared bootstrap/config/security libraries
        +-- generated OpenAPI contracts and typed clients
```

- Frontend apps share UI/state/i18n/query/client helpers from `@app/frontend-ui`.
- Backend apps share Nest bootstrap, config, validation, security headers, auth/RBAC, shared health, RFC 9457 Problem Details, and database modules from shared libraries.
- `@app/common/exception` is the singular exception package at `libs/backend/common/exception/lib`; do not introduce an alternate exception library alias/path.
- Health uses `@app/common/health` (`BaseHealthController`, `HealthService`, and app-specific `health.config.ts` providers) for `/health`, `/health/private`, `/live`, and `/ready`.
- Database schema changes are represented as MikroORM migrations and checked by repository tooling.
- API shape changes flow through committed OpenAPI JSON, generated contract types, and generated frontend clients:

```bash
pnpm api:contracts
pnpm api:clients
```

Commit generated JSON under `contracts/openapi/*.json`, contract types under `libs/common/api-contracts/lib/src/generated`, and frontend clients under `libs/frontend/api-client/lib/src/generated` when API surfaces change.

See [OpenAPI and typed client scaffold](docs/api-client.md), [API lifecycle policy](docs/api-lifecycle-policy.md), and [Command matrix](docs/command-matrix.md).

## Testing and QA

Fast PR preflight:

```bash
pnpm run check:fast
```

`check:fast` runs the Prettier check plus Nx lint, typecheck, and unit test targets. Add targeted checks based on what changed:

```bash
pnpm run test:coverage            # runtime TypeScript changes
pnpm run test:e2e                 # frontend/backend e2e smoke coverage
pnpm run test:fullstack           # Docker-backed full-stack Playwright checks
pnpm run db:migrations:check      # migration changes
pnpm run build                    # build, packaging, or Docker changes
pnpm run audit                    # dependency changes
```

Full release-risk checks:

```bash
pnpm run check
pnpm run quality:presets
```

Additional runnable presets include OpenAPI fuzzing, accessibility, cross-browser/mobile Playwright, performance, security DAST, mutation, and property checks. See [Modern QA and testing matrix](docs/testing/modern-qa.md).

## Docker and local full stack

The root `docker-compose.yml` starts PostgreSQL for local development:

```bash
pnpm run dev:db
```

The full-stack Compose file builds the migrator, backend APIs, frontend nginx images, and PostgreSQL:

```bash
pnpm run docker:fullstack
pnpm run test:docker-smoke
pnpm run docker:down
```

The Docker full stack publishes the frontends on `ADMIN_APP_PORT`/`USER_APP_PORT`/`LANDING_APP_PORT` defaults `8081`/`8082`/`8083` and the APIs on `3001`/`3002`/`3003` defaults. Frontend containers can use nginx same-origin proxying for API routes; when you intentionally rely on that pattern, set `VITE_API_BASE_URL_MODE=same-origin` so production builds do not silently fall back to same-origin by accident.

For production-oriented Compose guidance, secret files, Redis rate limiting, and image tags, see [Docker Compose production guide](docs/docker-compose-production.md) and [Deployment and local stack readiness](docs/deployment.md).

## CI/CD

GitHub Actions are configured for pull requests to `main`, pushes to `main`, and manual dispatch. The primary workflows cover:

- Deployment validation for Docker/Compose plus optional PM2, Helm, and
  GitOps/Argo modes.
- Format, lint, typecheck, coverage, component tests, builds, Storybook, visual tests, and dependency audit.
- Static/browser e2e coverage, Docker smoke stack, runtime QA/ops gates, and full-stack Playwright e2e.
- CodeQL, dependency review, quality preset sweeps, release image builds, SBOM/signing, and image scanning.

Run `pnpm run check:fast` before opening a PR and add the targeted commands above for the surfaces you changed. CI uses the repository Node engine (`>=26 <27`) through `.nvmrc`/workflow setup and pnpm `11.5.2`.

## Troubleshooting

| Symptom                                                      | Checks / fix                                                                                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` fails because pnpm is wrong | Run `corepack enable && corepack prepare pnpm@11.5.2 --activate`, then retry.                                                                             |
| PostgreSQL port is already in use                            | Set `POSTGRES_PORT` in `.env` or stop the conflicting local service, then rerun `pnpm run dev:db`.                                                        |
| Migrations cannot connect                                    | Confirm `docker compose ps postgres`, verify `DATABASE_URL` or `POSTGRES_*`, then run `pnpm run db:migrate` again.                                        |
| Browser calls are blocked by CORS                            | Add the exact frontend origin to `CORS_ORIGINS`; do not use wildcards for production.                                                                     |
| OpenAPI docs return 404                                      | Set `OPENAPI_ENABLED=true` and confirm `OPENAPI_PATH` for the API you are serving.                                                                        |
| Docker builds are slow or memory-constrained                 | Keep the documented defaults (`COMPOSE_PARALLEL_LIMIT=1`, `COMPOSE_BAKE=false`, `NX_DAEMON=false`, `NX_PARALLEL=1`) unless the builder has enough memory. |
| Playwright tests fail before opening a browser               | Install browsers with `pnpm exec playwright install --with-deps chromium` or the browser matrix needed by the command.                                    |
| Contracts or generated clients are stale                     | Run `pnpm api:contracts` and `pnpm api:clients`, then commit the generated changes.                                                                       |

## Contributing

1. Create a topic branch from `main`.
2. Keep public commands documented in [Command matrix](docs/command-matrix.md).
3. Add or update tests with code changes.
4. Update `.env*.example` and this README when runtime configuration changes.
5. Run `pnpm run check:fast` plus targeted checks before requesting review.

See [CONTRIBUTING.md](CONTRIBUTING.md) for workspace rules and PR expectations.

## Further reading

- [First feature walkthrough](docs/first-feature-walkthrough.md)
- [Command matrix](docs/command-matrix.md)
- [Deployment and local stack readiness](docs/deployment.md)
- [Operations runbook](docs/operations.md)
- [Production readiness checklist](docs/production-readiness.md)
- [Dependency and supply-chain management](docs/dependency-management.md)
- [Feature flags](docs/feature-flags.md)
- [Notifications](docs/notifications.md)
- [Billing/admin roadmap stubs](docs/billing-admin-roadmap.md)

## License

MIT.
