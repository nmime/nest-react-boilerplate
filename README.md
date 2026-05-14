# Nest React Boilerplate

[![CI](https://github.com/nmime/nest-react-boilerplate/actions/workflows/ci.yml/badge.svg)](https://github.com/nmime/nest-react-boilerplate/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-22-brightgreen)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-10.32.1-orange)](https://pnpm.io)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

A production-ready Nx workspace for React frontends and NestJS backend APIs. The repository is organized around deployable app surfaces plus shared libraries for UI, bootstrap, validation, response/result boundaries, and OAuth/OIDC readiness.

## Workspace layout

### Frontend apps

- `apps/frontend/admin` — `admin-app`, the internal admin surface.
- `apps/frontend/app` — `user-app`, the user-facing application surface.
- `apps/frontend/landing` — `landing-app`, the public product landing surface.
- `libs/frontend/ui` — `@app/frontend-ui`, shared React layout and UI primitives used by all frontend apps.

### Backend apps

- `apps/backend/admin-app-api` — `backend-admin-app-api`, admin API shell.
- `apps/backend/user-app-api` — `user-app-api`, user API shell.
- `apps/backend/auth-app-api` — `auth-app-api`, auth API shell with OAuth module wiring.

### Backend libraries

- `libs/common/bootstrap` — Nest app bootstrap helper with Helmet, CORS support, and strict validation defaults.
- `libs/common/validation` — `createProblemValidationPipe()` with `transform`, `whitelist`, and `forbidNonWhitelisted` enabled.
- `libs/common/response` — response helpers and `neverthrow` `Result` to API response mapping.
- `libs/features/auth/oauth` — disabled-by-default OAuth/OIDC shell using `openid-client` and `neverthrow` `ResultAsync`; it requires no secrets until explicitly configured.

## Architecture rules

Projects are tagged for Nx module-boundary enforcement:

- `platform:frontend` or `platform:backend`
- `type:frontend-app`, `type:backend-app`, `type:ui`, `type:common`, or `type:feature-shared`
- `scope:admin`, `scope:user`, `scope:landing`, or `scope:auth` for app surfaces

Frontend apps depend only on the shared UI library. Backend apps depend on backend common and feature-shared libraries. Backend shared libraries stay database- and service-agnostic so the boilerplate remains easy to extend.

## Requirements

- Node.js 22.x
- pnpm 10.32.1

## Install

```bash
pnpm install --frozen-lockfile
```

## Common Nx commands

```bash
pnpm exec nx show projects
pnpm exec nx run-many -t lint --all
pnpm exec nx run-many -t typecheck --all
pnpm exec nx run-many -t test --all
pnpm exec nx run-many -t build --all
```

Frontend static e2e smoke checks build each frontend app and verify generated artifacts:

```bash
pnpm exec nx run-many -t e2e --projects=admin-app,user-app,landing-app
```

Backend API smoke coverage is included in each backend app test target:

```bash
pnpm exec nx test backend-admin-app-api
pnpm exec nx test user-app-api
pnpm exec nx test auth-app-api
```

## Local development

Run an individual frontend app:

```bash
pnpm exec nx serve admin-app
pnpm exec nx serve user-app
pnpm exec nx serve landing-app
```

Run an individual backend API:

```bash
pnpm exec nx serve backend-admin-app-api
pnpm exec nx serve user-app-api
pnpm exec nx serve auth-app-api
```

Each backend API exposes `GET /health` and uses the shared validation/security bootstrap baseline.

## Verification before a PR

```bash
pnpm install --frozen-lockfile
pnpm exec nx run-many -t lint --all
pnpm exec nx run-many -t typecheck --all
pnpm exec nx run-many -t test --all
pnpm exec nx run-many -t e2e --projects=admin-app,user-app,landing-app
pnpm exec nx run-many -t build --all
```

## Documentation

- [Architecture](./docs/architecture.md)
- [API conventions](./docs/api-conventions.md)
- [Technology choices](./docs/technology-choices.md)
