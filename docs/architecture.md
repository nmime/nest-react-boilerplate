# Architecture

This repository is an Nx monorepo with flat deployable applications and small shared libraries. It keeps the starter architecture ready to use while leaving clear seams for database, component-test, and feature growth without depending on external reference repositories.

## Frontend apps

- `admin-app` in `apps/frontend/admin`
- `user-app` in `apps/frontend/app`
- `landing-app` in `apps/frontend/landing`

All three apps are Vite React apps. They share React UI primitives from `libs/frontend/ui`, call typed backend wrappers from `libs/frontend/api-client`, and rely on `libs/frontend/api-support` (`@app/frontend-api-support`) for browser-safe request primitives such as `apiFetch`, locale-aware API headers, and fallback API error copy. Keep this API-support alias canonical; do not add secondary TS path aliases that point at the same source root.

## Backend apps

- `admin-app-api` in `apps/backend/admin-app-api`
- `user-app-api` in `apps/backend/user-app-api`
- `auth-app-api` in `apps/backend/auth-app-api`

Each API imports app-specific health configuration from its local `health.config.ts` and uses shared health primitives from `@app/backend/common/health`. The shared `BaseHealthController` exposes `GET /health`, `GET /health/private`, `GET /live`, and `GET /ready`; app e2e tests exercise the HTTP endpoints with Nest testing utilities and `supertest`.

## Shared libraries

The `libs/common` namespace is intentionally small after the frontend/backend split. It is reserved for code that is platform-neutral or contractual enough to be consumed by both sides, plus a few implementation-neutral contracts that must stay stable while backend or frontend adapters change.

Current `libs/common` placement decisions:

| Project                                                   | Decision                            | Why it remains or moves                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/common/api-contracts` (`@app/api-contracts`)        | Keep common                         | Generated OpenAPI/contract review types describe the API boundary between backend producers and frontend/generated clients. It must stay independent of either runtime even when direct frontend app imports are discouraged in favor of `@app/api-client`.                                                                             |
| `libs/common/config` (`@app/common-config`)               | Keep common                         | The Joi-backed `createConfig` helper is a tiny platform-neutral configuration accessor used by backend config modules today and safe for other Node/shared packages without pulling Nest app concerns into common.                                                                                                                      |
| `libs/common/i18n` (`@app/common/i18n`)                   | Keep common                         | Locale types, translation lookup, fallback behavior, interpolation, and request-locale helpers are shared by frontend UI/API support and backend response/locale middleware. Locale JSON assets live outside the library as thin domain files under root `i18n/en/*.json` and `i18n/ru/*.json`, with `en` as fallback.                  |
| `libs/common/notifications` (`@app/common/notifications`) | Keep common                         | The package exposes provider-neutral notification/email contracts plus noop/in-memory implementations for tests and local development. Real delivery adapters should be added under backend-specific infrastructure, but the message/result contract can remain shared.                                                                 |
| `libs/common/websocket` (`@app/common/websocket`)         | Keep common for now; backend-tagged | It is currently an adapter/client abstraction and broadcast operation contract with no browser or Nest dependency. It is tagged `platform:backend` because no frontend consumer exists today; split into backend/frontend packages only when a browser websocket client or backend gateway implementation needs platform-specific code. |
| `libs/common/feature-flags` (`@app/common/feature-flags`) | Keep common                         | The flag key/value/context/provider contract is shared by backend providers and future frontend/client gates; backend-specific modules and persistence adapters already live under `libs/backend/common/feature-flags` and `libs/backend/postgres/main/feature-flags`.                                                                  |

- `libs/backend/common/bootstrap` creates Nest apps with the common backend foundation: raw-body capture, cookie parsing, Helmet, deny-all robots, extended query parsing, request IDs/logging, CORS, rate limiting, validation, response mapping, exception filtering, and Swagger setup.
- `libs/backend/common/exception` provides RFC 9457 Problem Details exceptions, the `ProblemDetails` model, the `BaseException` model, the `Exception` factory, status mapping, and `ApiExceptions`. The public alias is singular: `@app/common/exception` -> `libs/backend/common/exception/lib`.
- `libs/backend/common/health` provides the shared `BaseHealthController`, `HealthService`, health decorators/guards/interceptors, and indicator contract. Apps contribute app-specific health providers/config, while the shared controller owns `/health`, `/health/private`, `/live`, and `/ready`.
- `libs/backend/common/response` is the response mapper layer. It standardizes `{ data }` success responses, maps `neverthrow` results, and exposes `ExceptionsResponseTransformer`/`ExceptionsFilter`.
- `libs/backend/common/swagger` centralizes OpenAPI/Swagger setup with bearer security and problem response schemas.
- `libs/common/feature-flags` defines the cross-platform feature flag provider contract plus static/environment implementations; backend Nest module adapters live under `libs/backend/common/feature-flags`.
- `libs/common/notifications` defines cross-platform notification/email provider contracts plus noop/in-memory implementations for local development and tests.
- `libs/backend/common/validation` creates `createValidationPipe` validation exceptions backed by RFC 9457 Problem Details. Validation failures use the `errors[]` extension with field `detail` and JSON Pointer `pointer` entries.
- `libs/backend/feature/auth/shared` contains auth roles, permissions, user/session contracts, default access-policy helpers, reusable bearer guard/RBAC decorators, and a disabled-by-default OAuth/OIDC foundation.
- `libs/backend/feature/auth/main` contains register/login/me/logout controllers and JWT/password application services.
- `libs/backend/feature/user/shared` and `libs/backend/feature/user/main` contain the protected user profile feature.
- Admin shared code is split by runtime: `libs/frontend/feature/admin/shared/lib` (`@app/frontend/feature-admin-shared`) contains frontend-safe admin contracts, while `libs/backend/feature/admin/shared/lib` (`@app/backend/feature-admin-shared`) contains backend admin RBAC/permission logic. `libs/backend/feature/admin/main` contains the protected admin API orchestration.
- `libs/frontend/api-support` is the frontend-safe non-UI utility boundary for API request state: locale getters, `apiFetch`/`apiRequest`, header construction, URL resolution, and fallback API error copy. It is the only non-test frontend source that may call raw `fetch`.
- `libs/frontend/api-client` is the generated/typed SDK layer. It wraps backend OpenAPI clients and may depend on API support, shared contracts, and common utilities, but not on React UI.
- `libs/frontend/ui` contains shared React components, layout, providers, and a compatibility re-export for the existing API helper surface. New request implementation code belongs in API support, not UI.

## Nx architecture tags

Projects use multiple tag dimensions so module-boundary rules can describe architecture without relying on folder names alone.

- `platform:backend`, `platform:frontend`, `platform:shared` describe runtime surface.
- `type:backend-app` and `type:frontend-app` mark deployable applications and keep app-specific constraints explicit; apps should not also carry a generic `type:app` tag.
- `type:feature-main` is reserved for backend feature modules that own controllers, use cases, and application-facing orchestration.
- `type:feature-shared` is for feature-level contracts/services shared by multiple apps or feature-main libs within the same runtime platform. Admin uses both frontend and backend feature-shared libraries; keep their `platform:*` tags separate.
- `type:data-access` is reserved for database modules with entities, repositories, and persistence adapters.
- `type:test-util` is reserved for test factories, Testcontainers setup, and component-test harnesses; test utilities should not also carry `type:common`.
- `type:common`, `type:ui`, `type:util`, and `type:sdk` describe shared building blocks. Frontend apps may consume SDKs directly, SDKs may consume non-UI utilities, and UI should stay on UI/common/util dependencies rather than importing SDKs.
- `scope:<domain>` identifies a single ownership boundary such as `scope:auth`, `scope:admin`, `scope:user`, `scope:landing`, `scope:feature-flags`, or `scope:shared`. Postgres is modeled by the `libs/backend/postgres/**` source root plus `type:data-access`, not by a second `scope:postgres` tag on domain data-access libraries.

New libraries should use the taxonomy above and, where practical, keep feature, data-access, and test-util responsibilities split.

Platform boundaries are enforced by tags as well as paths: frontend projects must not import `platform:backend` libraries, backend projects must not import `platform:frontend` libraries, and admin shared code must stay on the correct side of the frontend/backend split.

## Library naming conventions

Backend feature libraries use `libs/backend/feature/...` paths and singular `@app/feature-*` aliases, except admin shared runtime-specific aliases. New admin shared imports must use the explicit platform alias for their runtime:

- Feature main: `@app/feature-auth-main`, `@app/feature-user-main`, `@app/feature-admin-main`.
- Feature shared: `@app/feature-auth-shared`, `@app/feature-user-shared`, `@app/frontend/feature-admin-shared` (frontend admin contracts), and `@app/backend/feature-admin-shared` (backend admin RBAC/permission logic).
- Data access: `@app/postgres-main`, `@app/postgres-main-auth`.
- Test utilities: `@app/common-component-test`, `@app/feature-auth-test`.
- Frontend API support: `@app/frontend-api-support`.
- Frontend API SDK: `@app/api-client`.
- Frontend UI: `@app/frontend-ui`.
- Backend exception foundation: `@app/common/exception` only. Keep the path singular at `libs/backend/common/exception/lib` and Nx project name `@app/common/exception`.
- Backend health foundation: `@app/backend/common/health` at `libs/backend/common/health/lib`.

For the next DB stage, data-access libs should contain `entity/`, `repository/`, and module/config exports. Feature libs should consume repositories through Nest providers instead of importing app code.

## Postgres data-access layer

The first data-access libraries live under `libs/backend/postgres/main/*/lib`; import them through their `@app/postgres-main*` aliases instead of spelling source-file paths in application code.

- `@app/postgres-main` (`libs/backend/postgres/main/shared/lib`, source root `libs/backend/postgres/main/shared/lib/src`) owns shared Postgres/MikroORM configuration, the root module helper, and transaction helpers.
- `@app/postgres-main-auth` (`libs/backend/postgres/main/auth/lib`, source root `libs/backend/postgres/main/auth/lib/src`) owns auth persistence objects such as `entity/` and `repository/` exports.

Configuration is environment driven. `DATABASE_URL` takes precedence; otherwise `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` are used with local-safe defaults. `POSTGRES_SSL=true` enables SSL and `POSTGRES_SSL_REJECT_UNAUTHORIZED=false` can be used for managed databases that require it. MikroORM does not auto-sync schemas in this boilerplate; schema changes are explicit MikroORM `Migration` classes under data-access libraries and are applied by `pnpm run db:migrate`, which records state in `mikro_orm_migrations`. Runtime migration does not read raw SQL files or use `psql` loops.

Repository wrappers return `neverthrow` `ResultAsync` values so feature code can handle persistence failures explicitly. New data-access libraries should follow the same shape: `entity/`, `repository/`, a Nest module, and a public `index.ts` barrel. Testcontainers-backed component tests live beside repository code as `*.component-spec.ts` and run only through the `component-test` target.

## API contracts and clients

OpenAPI producer output is committed as JSON under `apps/backend/*-app-api/contracts/openapi/*.json`. Shared generated contract/review types live under `libs/common/api-contracts/lib/src/generated`, and generated frontend clients live under `libs/frontend/api-client/lib/src/generated`. Backend API surface changes must keep these artifacts in sync with the source controllers and DTOs.

## i18n and Problem Details

Supported locales are `en` and `ru`; root locale catalogs live as thin domain files under `i18n/en/*.json` and `i18n/ru/*.json`, and fallback is `en`. Backend exception localization preserves RFC 9457 wire terms: `type`, `title`, `status`, `detail`, `instance`, `application/problem+json`, and stable `urn:problem:*` values. Client logic should key off status/code/type rather than localized text.

## Planned testing layers

- Unit tests stay under the `test` target and continue to use Vitest coverage with 100% thresholds for testable source.
- Component tests run under separate `component-test` targets and use Testcontainers for real service dependencies. They require Docker and are intentionally separate from unit tests so normal `test` targets do not start containers.
- `@app/common-component-test` provides shared PostgreSQL container helpers for DB-backed component tests.
- Backend e2e tests should exercise Nest apps through HTTP with `supertest`; DB-backed e2e/component tests should use Testcontainers and isolated fixtures.
- Frontend e2e currently uses static build smoke tests. Browser-level e2e coverage requires an instrumented browser test setup and will be introduced separately rather than hidden behind the existing static smoke target.

## E2E coverage

Backend e2e tests run as explicit Nx `e2e` targets for each Nest API app. They use Nest testing modules plus `supertest` for real HTTP requests and write V8 coverage reports under `coverage/e2e/apps/backend/*`. Unit coverage gates remain separate and still enforce 100% on testable source.

Frontend e2e tests run real Chromium smoke checks against an instrumented Vite production build for each React app. `VITE_E2E_COVERAGE=true` enables `vite-plugin-istanbul`; the browser exposes `window.__coverage__`, and `packages/tooling/src/commands/testing/frontend-browser-e2e-coverage.ts` writes text, LCOV, and JSON reports under `coverage/e2e/apps/frontend/*`. Production builds are unaffected because instrumentation is opt-in by environment variable.

Use `pnpm run test:e2e:coverage` to run all backend and frontend e2e coverage targets. Playwright Chromium must be installed first with `pnpm exec playwright install chromium` locally, or `pnpm exec playwright install --with-deps chromium` on GitHub Actions.

## Deployable outputs

Nx builds backend apps into `dist/apps/backend/*` and frontend apps into `dist/apps/frontend/*`. The root Dockerfile can package any backend app as a Node runtime image or any frontend app as an nginx static image.

## Current Nx topology diagram

```mermaid
graph TD
  AdminApp[admin-app] --> ApiClient[@app/api-client]
  UserApp[user-app] --> ApiClient
  LandingApp[landing-app] --> FrontendUi[@app/frontend-ui]
  AdminApp --> FrontendUi
  UserApp --> FrontendUi
  ApiClient --> ApiSupport[@app/frontend-api-support]
  ApiClient --> GeneratedClients[libs/frontend/api-client/lib/src/generated/**]
  GeneratedClients --> OpenApi[apps/backend/*-app-api/contracts/openapi/*.json]
  OpenApi --> SharedTypes[libs/common/api-contracts/lib/src/generated/**]
  UserApp --> ConsumerPact[apps/frontend/app/contracts/consumers/frontend-auth.pact.json]
  ConsumerPact --> AuthApi[auth-app-api]
  AdminApi[admin-app-api] --> Bootstrap[@app/common/bootstrap]
  UserApi[user-app-api] --> Bootstrap
  AuthApi --> Bootstrap
  Bootstrap --> Exception[@app/common/exception]
  Bootstrap --> Response[@app/common/response]
  Bootstrap --> Validation[@app/common/validation]
  AuthApi --> PgAuth[@app/postgres-main-auth]
  AuthApi --> PgShared[@app/postgres-main]
  AdminApi --> PgFlags[@app/postgres-main-feature-flags]
  PgFlags --> PgShared
```

## Current contract and persistence layout

OpenAPI producer output is committed as JSON under `apps/backend/*-app-api/contracts/openapi/*.json`. The committed consumer Pact is `apps/frontend/app/contracts/consumers/frontend-auth.pact.json`. Shared generated contract/review types live under `libs/common/api-contracts/lib/src/generated/**`, and generated frontend clients live under `libs/frontend/api-client/lib/src/generated/**`. The authoritative manifest and layout helpers are tooling-owned at `packages/tooling/config/api-contracts.json`, `packages/tooling/config/api-contracts.schema.json`, `packages/tooling/src/commands/api/contract-layout.ts`, and `packages/tooling/src/commands/api/contracts-manifest.ts`; the repository-root `config/` directory is intentionally absent.

There is intentionally no repository-root contract artifact directory and no `openapi` or `consumers` artifact subtree inside `libs/common/api-contracts`; that library owns generated source under `lib/src/generated/**` only.

Canonical Postgres data access lives under `libs/backend/postgres/**`. Use `@app/postgres-main`, `@app/postgres-main-auth`, and `@app/postgres-main-feature-flags` instead of non-canonical database paths. API errors standardize on RFC 9457 Problem Details through the singular `@app/common/exception` alias.
