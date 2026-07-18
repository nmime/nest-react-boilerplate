# Architecture

This repository is an Nx monorepo with flat deployable applications and small shared libraries. It keeps the starter architecture ready to use while leaving clear seams for database, component-test, and feature growth without depending on external reference repositories.

## Frontend apps

No deployable is the monorepo default. Every frontend has a distinct product
or runtime role, and the fullstack core profile selects them together.
Use the generated [Project Catalog](project-catalog.md) for exact application
IDs, Nx roots, runtimes, dependencies, and template hostnames.
The frontend runtime is split by deployment shape. `landing-app` is the
Astro + React islands marketing surface, `site-app` is the Vike + React SSR
product/user site scaffold, `admin-app` remains a Vite React SPA, and
`user-app` is the Vite user SPA. `mobile-app` is the Expo/React Native app and consumes the
Tamagui native facade from `@app/frontend-ui-native`. Web apps consume
shadcn-style React DOM primitives from
`@app/frontend-ui-web`, non-visual i18n/query/state helpers from
`@app/frontend-runtime`, typed backend wrappers from `libs/frontend/api-client`,
and browser-safe request primitives from `libs/frontend/api-support`
(`@app/frontend-api-support`). Keep this API-support alias canonical; do not add
secondary TS path aliases that point at the same source root.

## Backend apps

Each API imports app-specific health configuration from its local `health.config.ts` and uses shared health primitives from `@app/backend-common-health`. The shared `BaseHealthController` exposes `GET /health`, `GET /health/private`, `GET /live`, and `GET /ready`; app e2e tests exercise the HTTP endpoints with Nest testing utilities and `supertest`.

### Request context (CLS)

Every HTTP request runs inside a **Continuation Local Storage** context via Node's built-in `AsyncLocalStorage`, with zero new dependencies.

**Pipeline:**

```
Request → ClsInterceptor (enters CLS, generates requestId from x-request-id or UUID)
         → ValidationPipe
         → Controller (requestContext.getRequestId())
         → Service (requestContext.getRequestId())
         → Repository
         ← ExceptionsFilter (requestContext.getRequestId(), sets x-request-id header)
```

**API:**

```typescript
import { requestContext } from '@app/backend-common-bootstrap';

const requestId = requestContext.getRequestId(); // string | undefined
requestContext.set('userId', 'abc-123'); // attach to context
const userId = requestContext.get('userId'); // read from context
```

**Why CLS over middleware headers:** async/await, promises, and NestJS interceptors naturally cross async boundaries. `AsyncLocalStorage` follows the execution context automatically — no manual passing, guaranteed same ID across the entire pipeline.

### Error handling (RFC 9457)

All HTTP errors are **RFC 9457 Problem Details** with `Content-Type: application/problem+json`.

**Exception factory** — static definitions at class creation time:

```typescript
const NotFoundException = Exception({
  name: 'NotFoundException',
  kind: ExceptionKind.Client,
  problemType: 'not_found',
  title: 'Not Found',
  detail: 'The requested resource was not found',
  status: 404,
});
```

- **Static fields** (`type`, `title`, `detail`, `status`) are class-level constants — never mutable at runtime
- **Runtime context** only accepts: `{ data? → info in response, meta? (private diagnostics), cause? }`
- **Domain exceptions:** `ResourceNotFoundException`, `UnauthorizedException`, `ForbiddenException`, `ConflictException`, `BadRequestException`, `InternalException`, `ClientDataValidationException`
- **Security:** `HttpException.message` is **never** serialized; unknown errors map to static generic messages

## Shared libraries

The `libs/common` namespace is intentionally small after the frontend/backend split. It is reserved for code that is platform-neutral or contractual enough to be consumed by both sides, plus a few implementation-neutral contracts that must stay stable while backend or frontend adapters change.

Current `libs/common` placement decisions:

| Project                                                   | Decision    | Why it remains or moves                                                                                                                                                                                                                                              |
| --------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/common/api-contracts` (`@app/common-api-contracts`) | Keep common | Generated OpenAPI/contract review types describe the API boundary between backend producers and frontend/generated clients. It must stay independent of either runtime even when direct frontend app imports are discouraged in favor of `@app/frontend-api-client`. |
| `libs/common/config` (`@app/common-config`)               | Keep common | The Joi-backed `createConfig` helper is a tiny platform-neutral configuration accessor used by backend config modules today and safe for other Node/shared packages without pulling Nest app concerns into common.                                                   |
| `libs/common/i18n/{runtime,keys}`                         | Keep common | Platform-neutral locale parsing, merge/fallback/interpolation mechanics and generated translation-key types. Backend/frontend/bot catalogs live under their owning runtime scopes.                                                                                   |
| `libs/common/notifications` (`@app/common-notifications`) | Keep common | Framework-neutral notification event, template, delivery, channel-content, provider, and error contracts. PostgreSQL and transport implementations stay backend-owned.                                                                                               |
| `libs/common/websocket` (`@app/common-websocket`)         | Keep common | Provider-neutral websocket/broadcast contracts with no browser, Nest, or backend-only dependency; the project is tagged `platform:shared`.                                                                                                                           |
| `libs/common/feature-flags` (`@app/common-feature-flags`) | Keep common | The flag key/value/context/provider contract plus static/environment implementations are shared by backend providers and future frontend/client gates; the Postgres-backed persistence adapter lives under `libs/backend/postgres/main/feature-flags/lib`.           |

- `libs/backend/common/bootstrap/lib` creates Nest apps with the common backend foundation: CLS request context (`ClsInterceptor`), raw-body capture, cookie parsing, Helmet, deny-all robots, extended query parsing, request logging, CORS, rate limiting, validation, response mapping, exception filtering, and Swagger setup.
- `libs/backend/common/exception/lib` provides RFC 9457 Problem Details exceptions with the `Exception` factory (static `type`/`title`/`detail`/`status`), domain exception classes, and `toProblemDetails` utility. Runtime context limited to `{ data?, meta?, cause? }`. The public alias is singular: `@app/backend-common-exception` -> `libs/backend/common/exception/lib`.
- `libs/backend/common/health/lib` provides the shared `BaseHealthController`, `HealthService`, health decorators/guards/interceptors, and indicator contract. Apps contribute app-specific health providers/config, while the shared controller owns `/health`, `/health/private`, `/live`, and `/ready`.
- `libs/backend/common/response/lib` is the response mapper layer. It standardizes `{ data }` success responses, maps `neverthrow` results, and exposes `ExceptionsResponseTransformer`/`ExceptionsFilter`.
- `libs/backend/common/swagger/lib` centralizes OpenAPI/Swagger setup with bearer security and problem response schemas.
- `libs/common/feature-flags` defines the cross-platform feature flag provider contract plus static/environment implementations; the Postgres-backed persistence adapter lives under `libs/backend/postgres/main/feature-flags/lib`.
- `libs/common/notifications` defines framework-neutral notification domain contracts. Application ports are notification-feature-owned, PostgreSQL implements them, and Telegram is the only active transport.
- `libs/backend/common/validation/lib` creates `createValidationPipe` validation exceptions backed by RFC 9457 Problem Details. Validation failures use the `errors[]` extension with field `detail` and JSON Pointer `pointer` entries.
- `libs/backend/feature/auth/shared/lib` contains auth roles, permissions, user/session contracts, default access-policy helpers, reusable bearer guard/RBAC decorators, and a disabled-by-default OAuth/OIDC foundation.
- `libs/backend/feature/auth/main/lib` contains register/login/me/logout controllers and JWT/password application services.
- `libs/backend/feature/user/shared/lib` and `libs/backend/feature/user/main/lib` contain the protected user profile feature.
- Admin shared code is split by runtime: `libs/frontend/feature/admin/shared/lib` (`@app/frontend-feature-admin-shared`) contains frontend-safe admin contracts, while `libs/backend/feature/admin/shared/lib` (`@app/backend-feature-admin-shared`) contains backend admin RBAC/permission logic. `libs/backend/feature/admin/main/lib` contains the protected admin API orchestration.
- Bot behavior is feature code: Discord logic lives in `@app/backend-feature-discord-bot`, Telegram runtime logic in `@app/backend-feature-telegram-bot`, and the narrow sibling transport contract in `@app/backend-feature-telegram-shared`. Deployable bot HTTP/worker processes stay under `apps/backend/<scope>/<app>`.
- `libs/frontend/api-support` is the frontend-safe non-UI utility boundary for API request state: locale getters, `apiFetch`/`apiRequest`, header construction, URL resolution, and fallback API error copy. It is the only non-test frontend source that may call raw `fetch`.
- `libs/frontend/api-client` is the generated/typed SDK layer. It wraps backend OpenAPI clients and may depend on API support, shared contracts, and common utilities, but not on React UI.
- `libs/common/design-tokens` is the renderer-neutral design-token package for web CSS variables and native Tamagui theme values.
- `libs/frontend/runtime` contains non-visual frontend runtime helpers such as i18n, query providers, shell state, locale, theme, and guarded platform utilities.
- `libs/frontend/ui-web` contains the shadcn-style React DOM UI facade for Astro islands, Vike SSR pages, and the admin SPA.
- `libs/frontend/ui-native` contains the Tamagui native UI facade for `mobile-app` and future Expo/React Native surfaces.
- `libs/frontend/ui-web` and `libs/frontend/ui-native` are the explicit renderer owners; non-visual concerns live in `libs/frontend/runtime`.

## Nx architecture tags

Projects use multiple tag dimensions so module-boundary rules can describe architecture without relying on folder names alone.

- `platform:backend`, `platform:frontend`, `platform:shared` describe runtime surface.
- `type:backend-app` and `type:frontend-app` mark deployable applications and keep app-specific constraints explicit; apps should not also carry a generic `type:app` tag.
- `type:feature-main` is reserved for backend feature modules that own controllers, use cases, and application-facing orchestration.
- `type:feature-shared` is for feature-level contracts/services shared by multiple apps or feature-main libs within the same runtime platform. Admin uses both frontend and backend feature-shared libraries; keep their `platform:*` tags separate.
- `type:data-access` is reserved for database modules with entities, repositories, and persistence adapters.
- `type:test-util` is reserved for test factories, Testcontainers setup, and component-test harnesses; test utilities should not also carry `type:common`.
- `type:asset` is for source-controlled static inputs such as scoped i18n catalog projects; common catalog adapters may depend on these assets, but assets should not import application code.
- `type:common`, `type:ui`, `type:util`, and `type:sdk` describe shared building blocks. Frontend apps may consume SDKs directly, SDKs may consume non-UI utilities, and UI should stay on UI/common/util dependencies rather than importing SDKs.
- `scope:<domain>` identifies a single ownership boundary such as `scope:auth`, `scope:admin`, `scope:user`, `scope:landing`, `scope:feature-flags`, or `scope:shared`. Feature-owned Postgres libraries live under the owning scope, use `type:data-access`, and keep the same `scope:<domain>` tag instead of inventing a second database scope.

New libraries should use the taxonomy above and, where practical, keep feature, data-access, and test-util responsibilities split.

Platform boundaries are enforced by tags as well as paths: frontend projects must not import `platform:backend` libraries, backend projects must not import `platform:frontend` libraries, and admin shared code must stay on the correct side of the frontend/backend split.

## Library naming conventions

Backend feature libraries use `libs/backend/feature/<scope>/<layer>/lib/...` paths and flattened `@app/backend-feature-<scope>-<layer>` aliases. Admin shared imports must use the explicit platform alias for their runtime:

- Feature main: `@app/backend-feature-auth-main`, `@app/backend-feature-user-main`, `@app/backend-feature-admin-main`.
- Feature shared: `@app/backend-feature-auth-shared`, `@app/backend-feature-user-shared`, `@app/frontend-feature-admin-shared` (frontend admin contracts), and `@app/backend-feature-admin-shared` (backend admin RBAC/permission logic).
- Bot features: `@app/backend-feature-discord-bot`, `@app/backend-feature-telegram-bot`.
- Data access: `@app/backend-postgres-main`, `@app/backend-postgres-main-auth`.
- Test utilities: `@app/backend-common-component-test`.
- Frontend API support: `@app/frontend-api-support`.
- Frontend API SDK: `@app/frontend-api-client`.
- Frontend runtime: `@app/frontend-runtime`.
- Frontend web UI: `@app/frontend-ui-web`.
- Frontend native UI: `@app/frontend-ui-native`.
- Common design tokens: `@app/common-design-tokens`.
- Backend exception foundation: `@app/backend-common-exception` only. Keep the path singular at `libs/backend/common/exception/lib` and Nx project name `@app/backend-common-exception`.
- Backend health foundation: `@app/backend-common-health` at `libs/backend/common/health/lib`.

For the next DB stage, data-access libs should contain `entity/`, `repository/`, and module/config exports. Feature libs should consume repositories through Nest providers instead of importing app code.

## Postgres data-access layer

Shared Postgres infrastructure lives under `libs/backend/postgres/main/shared/lib`; feature-owned data-access libraries live under the owning scope, such as `libs/backend/postgres/main/auth/lib`. Import them through their `@app/backend-postgres-main-*` aliases instead of spelling source-file paths in application code.

- `@app/backend-postgres-main` (`libs/backend/postgres/main/shared/lib`, source root `libs/backend/postgres/main/shared/lib/src`) owns shared Postgres/MikroORM configuration, the root module helper, and transaction helpers.
- `@app/backend-postgres-main-auth` (`libs/backend/postgres/main/auth/lib`, source root `libs/backend/postgres/main/auth/lib/src`) owns auth persistence objects such as `entity/` and `repository/` exports.

Configuration is environment driven. `DATABASE_URL` takes precedence; otherwise `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` are used with local-safe defaults. `POSTGRES_SSL=true` enables SSL and `POSTGRES_SSL_REJECT_UNAUTHORIZED=false` can be used for managed databases that require it. MikroORM does not auto-sync schemas in this boilerplate; schema changes are explicit MikroORM `Migration` classes under data-access libraries and are applied by `pnpm run db:migrate`, which records state in `mikro_orm_migrations`. Runtime migration does not read raw SQL files or use `psql` loops.

Repository wrappers return `neverthrow` `ResultAsync` values so feature code can handle persistence failures explicitly. New data-access libraries should follow the same shape: `entity/`, `repository/`, a Nest module, and a public `index.ts` barrel. Testcontainers-backed component tests live beside repository code as `*.component-spec.ts` and run only through the `component-test` target.

## API contracts and clients

OpenAPI producer output is committed as JSON under `apps/backend/*/*-app-api/contracts/openapi/*.json`. Shared generated contract/review types live under `libs/common/api-contracts/lib/src/generated`, and generated frontend clients live under `libs/frontend/api-client/lib/src/generated`. Backend API surface changes must keep these artifacts in sync with the source controllers and DTOs.

## i18n and Problem Details

Supported locales are `en` and `ru`; root locale catalogs live under `i18n/<locale>/<scope>/<component>.json`, and fallback is `en`. Frontend feature loaders own admin/user/landing catalogs, `@app/frontend-i18n-shared` owns shared frontend copy, `@app/backend-common-i18n` owns common/error backend copy, and each bot feature merges its own assets. Backend exception localization preserves RFC 9457 wire terms and stable `urn:problem:*` values; clients key logic off status/code/type rather than localized text.

## Planned testing layers

- Unit tests stay under the `test` target and continue to use Vitest coverage with 100% thresholds for testable source.
- Component tests run under separate `component-test` targets and use Testcontainers for real service dependencies. They require Docker and are intentionally separate from unit tests so normal `test` targets do not start containers.
- `@app/backend-common-component-test` provides shared PostgreSQL container helpers for DB-backed component tests.
- Backend e2e tests should exercise Nest apps through HTTP with `supertest`; DB-backed e2e/component tests should use Testcontainers and isolated fixtures.
- Frontend e2e currently uses static build smoke tests. Browser-level e2e coverage requires an instrumented browser test setup and will be introduced separately rather than hidden behind the existing static smoke target.

## E2E coverage

Backend e2e tests run as explicit Nx `e2e` targets for each Nest API app. They use Nest testing modules plus `supertest` for real HTTP requests and write V8 coverage reports under `coverage/e2e/apps/backend/*`. Unit coverage gates remain separate and still enforce 100% on testable source.

Frontend e2e tests cover the active frontend shapes: Vite SPA browser smokes
for `admin-app` and `user-app`, an Astro static build smoke for `landing-app`,
and a Vike SSR build smoke for `site-app`. `VITE_E2E_COVERAGE=true` enables
`vite-plugin-istanbul` for the Vite browser smokes; Astro and Vike coverage will
need framework-specific instrumentation before they can publish equivalent
browser coverage reports.

Use `pnpm run test:e2e:coverage` to run all backend and frontend e2e coverage targets. Playwright Chromium must be installed first with `pnpm exec playwright install chromium` locally, or `pnpm exec playwright install --with-deps chromium` on GitHub Actions.

## Deployable outputs

Nx builds backend apps into `dist/apps/backend/*` and frontend apps into
`dist/apps/frontend/*`. The root Dockerfile can package backend apps as Node
runtime images and static frontend apps as nginx static images. `site-app`
requires a Node SSR runtime image because Vike renders through the Fastify
server in `apps/frontend/site/server`.

## Current Nx topology diagram

```mermaid
graph TD
  AdminApp[admin-app] --> ApiClient[@app/frontend-api-client]
  UserApp[user-app] --> ApiClient
  SiteApp[site-app] --> ApiClient
  LandingApp[landing-app] --> FrontendUiWeb[@app/frontend-ui-web]
  AdminApp --> FrontendUiWeb
  UserApp --> FrontendUiWeb
  SiteApp --> FrontendUiWeb
  LandingApp --> FrontendRuntime[@app/frontend-runtime]
  UserApp --> FrontendRuntime
  SiteApp --> FrontendRuntime
  ApiClient --> ApiSupport[@app/frontend-api-support]
  ApiClient --> GeneratedClients[libs/frontend/api-client/lib/src/generated/**]
  GeneratedClients --> OpenApi[apps/backend/*/*-app-api/contracts/openapi/*.json]
  OpenApi --> SharedTypes[libs/common/api-contracts/lib/src/generated/**]
  UserApp --> ConsumerPact[apps/frontend/app/contracts/consumers/frontend-auth.pact.json]
  ConsumerPact --> AuthApi[auth-app-api]
  AdminApi[admin-app-api] --> Bootstrap[@app/backend-common-bootstrap]
  UserApi[user-app-api] --> Bootstrap
  AuthApi --> Bootstrap
  Bootstrap --> Exception[@app/backend-common-exception]
  Bootstrap --> Response[@app/backend-common-response]
  Bootstrap --> Validation[@app/backend-common-validation]
  AuthApi --> PgAuth[@app/backend-postgres-main-auth]
  AuthApi --> PgShared[@app/backend-postgres-main]
  AdminApi --> PgFlags[@app/backend-postgres-main-feature-flags]
  PgFlags --> PgShared
```

## Current contract and persistence layout

OpenAPI producer output is committed as JSON under `apps/backend/*/*-app-api/contracts/openapi/*.json`. The committed consumer Pact is `apps/frontend/app/contracts/consumers/frontend-auth.pact.json`. Shared generated contract/review types live under `libs/common/api-contracts/lib/src/generated/**`, and generated frontend clients live under `libs/frontend/api-client/lib/src/generated/**`. The authoritative manifest, schema, and typed loader are tooling-owned at `packages/tooling/config/api-contracts.json`, `packages/tooling/config/api-contracts.schema.json`, and `packages/tooling/src/commands/api/contracts-manifest.ts`; the repository-root `config/` directory is intentionally absent.

There is intentionally no repository-root contract artifact directory and no `openapi` or `consumers` artifact subtree inside `libs/common/api-contracts`; that library owns generated source under `lib/src/generated/**` only.

Canonical Postgres data access lives under `libs/backend/postgres/main/shared/lib` for shared database infrastructure and `libs/backend/postgres/main/<scope>/lib` for feature-owned persistence. Use `@app/backend-postgres-main`, `@app/backend-postgres-main-auth`, and `@app/backend-postgres-main-feature-flags` instead of non-canonical database paths. API errors standardize on RFC 9457 Problem Details through the singular `@app/backend-common-exception` alias.
