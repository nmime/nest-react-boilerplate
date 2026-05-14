# Architecture

This repository is an Nx monorepo with flat deployable applications and small shared libraries. It intentionally keeps the starter architecture ready-to-use without coupling the APIs to external databases, queues, or third-party services.

## Project map

```text
apps/
  frontend/
    admin/          admin-app
    app/            user-app
    landing/        landing-app
  backend/
    admin-app-api/  backend-admin-app-api
    user-app-api/   user-app-api
    auth-app-api/   auth-app-api
libs/
  frontend/ui       @app/frontend-ui
  common/bootstrap  @app/common/bootstrap
  common/validation @app/common/validation
  common/response   @app/common/response
  features/auth/oauth @app/features-auth-oauth
```

## Frontend

The three frontend apps are Vite React apps that share a single UI foundation from `libs/frontend/ui`.

- `apps/frontend/admin` is the admin console shell.
- `apps/frontend/app` is the user application shell.
- `apps/frontend/landing` is the public landing shell.

Each app has unit/component smoke tests and an `e2e` target. The e2e target is intentionally browser-free: it depends on `build` and runs `tools/frontend-static-smoke.mjs` to verify `index.html`, emitted assets, and app-specific built copy.

## Backend

The backend is split into three independent NestJS 11 API shells:

- `apps/backend/admin-app-api`
- `apps/backend/user-app-api`
- `apps/backend/auth-app-api`

Each API exposes `GET /health`, has unit tests, and has HTTP smoke tests that use Nest's testing utilities without external services.

Shared backend behavior lives in focused libraries:

- `libs/common/bootstrap` creates Nest apps with Helmet, CORS-ready defaults, and the shared validation pipe.
- `libs/common/validation` exposes strict validation helpers.
- `libs/common/response` maps success and problem responses, including `neverthrow` `Result` boundaries.
- `libs/features/auth/oauth` provides a disabled-by-default OAuth/OIDC shell using `openid-client` and `ResultAsync`.

## Nx tags and boundaries

Projects use tags that describe platform, project type, and app scope:

- Platform tags: `platform:frontend`, `platform:backend`
- Type tags: `type:frontend-app`, `type:backend-app`, `type:ui`, `type:common`, `type:feature-shared`
- Scope tags: `scope:admin`, `scope:user`, `scope:landing`, `scope:auth`

The root ESLint configuration enforces module boundaries:

- Frontend apps may depend on UI libraries.
- Backend apps may depend on common, feature-shared, utility, or SDK backend libraries.
- Backend and frontend platforms do not cross-import each other.
- Common libraries remain generic and reusable.

## Workspace conventions

- Use pnpm workspaces with pnpm 10.32.1.
- Use Nx project names in commands rather than filesystem paths.
- Keep deployable code under `apps/**` and shared code under `libs/**`.
- Add tests with the project they cover.
