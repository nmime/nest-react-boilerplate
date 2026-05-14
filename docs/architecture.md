# Architecture

This repository is an Nx monorepo with flat deployable applications and small shared libraries. It keeps the starter architecture ready to use while leaving clear seams for database, component-test, and feature growth inspired by the xRocket monorepo.

## Frontend apps

- `admin-app` in `apps/frontend/admin`
- `user-app` in `apps/frontend/app`
- `landing-app` in `apps/frontend/landing`

All three apps are Vite React apps that share UI primitives from `libs/frontend/ui`.

## Backend apps

- `backend-admin-app-api` in `apps/backend/admin-app-api`
- `user-app-api` in `apps/backend/user-app-api`
- `auth-app-api` in `apps/backend/auth-app-api`

Each API exposes `GET /health`, has unit tests, and has HTTP smoke tests using Nest testing utilities and `supertest`.

## Shared libraries

- `libs/common/bootstrap` creates Nest apps with Helmet, strict validation, and secure CORS defaults.
- `libs/common/validation` creates validation problem details.
- `libs/common/response` standardizes success and problem responses.
- `libs/features/auth/oauth` contains a disabled-by-default OAuth/OIDC foundation.
- `libs/frontend/ui` contains shared React components and layout.

## Nx architecture tags

Projects use multiple tag dimensions so module-boundary rules can describe architecture without relying on folder names alone.

- `platform:backend`, `platform:frontend`, `platform:shared` describe runtime surface.
- `type:app` marks deployable applications.
- `type:backend-app` and `type:frontend-app` keep app-specific constraints explicit.
- `type:feature-main` is reserved for backend feature modules that own controllers, use cases, and application-facing orchestration.
- `type:feature-shared` is for backend feature contracts/services shared by multiple apps or feature-main libs.
- `type:data-access` is reserved for database modules with entities, repositories, and persistence adapters.
- `type:test-util` is reserved for test factories, Testcontainers setup, and component-test harnesses.
- `type:common`, `type:ui`, `type:util`, and `type:sdk` describe shared building blocks.
- `scope:<domain>` identifies ownership such as `scope:auth`, `scope:admin`, `scope:user`, `scope:landing`, or `scope:shared`.

The current repository keeps existing project names and imports stable. New libraries should use the taxonomy above and, where practical, the xRocket-inspired split between feature, data-access, and test-util layers.

## Library naming conventions

Existing names remain valid for compatibility. New backend libraries should prefer explicit names that encode platform/domain/layer:

- Feature main: `@app/backend-auth-main` or existing-compatible `@app/features-auth-main`.
- Feature shared: `@app/backend-auth-shared` or existing-compatible `@app/features-auth-shared`.
- Data access: `@app/postgres-main`, `@app/postgres-main-auth`, `@app/postgres-main-user`.
- Test utilities: `@app/common-component-test`, `@app/feature-auth-test`.
- Frontend UI: `@app/frontend-ui`.

For the next DB stage, data-access libs should contain `entity/`, `repository/`, and module/config exports. Feature libs should consume repositories through Nest providers instead of importing app code.

## Planned testing layers

- Unit tests stay under the `test` target and continue to use Vitest coverage with 100% thresholds for testable source.
- Component tests will be added as a separate `component-test` target once Testcontainers-backed database scaffolding exists.
- Backend e2e tests should exercise Nest apps through HTTP with `supertest`; DB-backed e2e/component tests should use Testcontainers and isolated fixtures.
- Frontend e2e currently uses static build smoke tests. Browser-level e2e coverage requires an instrumented browser test setup and will be introduced separately rather than hidden behind the existing static smoke target.

## Deployable outputs

Nx builds backend apps into `dist/apps/backend/*` and frontend apps into `dist/apps/frontend/*`. The root Dockerfile can package any backend app as a Node runtime image or any frontend app as an nginx static image.
