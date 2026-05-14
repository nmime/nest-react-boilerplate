# Nest React Boilerplate

[![Node.js](https://img.shields.io/badge/node-26-brightgreen)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-10.32.1-orange)](https://pnpm.io)
[![Nx](https://img.shields.io/badge/Nx-22-blue)](https://nx.dev)

Production-oriented Nx workspace for React frontends and NestJS backend APIs. The repository is organized around deployable app surfaces plus shared libraries for UI, bootstrap, validation, response/result boundaries, and OAuth/OIDC readiness.

## Workspace layout

- `apps/frontend/admin` — `admin-app`, internal operations shell.
- `apps/frontend/app` — `user-app`, user workspace shell.
- `apps/frontend/landing` — `landing-app`, public landing shell.
- `apps/backend/admin-app-api` — `backend-admin-app-api`, admin API shell on port 3001 locally.
- `apps/backend/user-app-api` — `user-app-api`, user API shell on port 3002 locally.
- `apps/backend/auth-app-api` — `auth-app-api`, auth API shell on port 3003 locally.
- `libs/frontend/ui` — shared React UI primitives.
- `libs/common/bootstrap` — Nest bootstrap with Helmet, strict validation, and secure CORS defaults.
- `libs/common/validation` — validation problem details helpers.
- `libs/common/response` — API response/result helpers.
- `libs/features/auth/oauth` — disabled-by-default OAuth/OIDC foundation.

## Requirements

- Node.js 26.x
- pnpm 10.32.1

```bash
corepack enable
pnpm install --frozen-lockfile
```

## Quality gates

```bash
pnpm run format:check
pnpm exec nx run-many -t lint --all
pnpm exec nx run-many -t typecheck --all
pnpm run test:coverage
pnpm exec nx run-many -t e2e --projects=admin-app,user-app,landing-app
pnpm exec nx run-many -t build --all
pnpm run audit
```

Vitest coverage is configured with 100% line, branch, function, and statement thresholds for the boilerplate's own testable source. Framework entrypoints and config files are excluded from coverage gates.

## Local development

```bash
pnpm exec nx serve admin-app
pnpm exec nx serve user-app
pnpm exec nx serve landing-app

pnpm exec nx serve backend-admin-app-api
pnpm exec nx serve user-app-api
pnpm exec nx serve auth-app-api
```

Each backend API exposes `GET /health`.

## Runtime environment

Common backend variables:

- `NODE_ENV` — set to `production` for deployed services.
- `PORT` — listen port inside the process/container.
- `CORS_ORIGINS` or `CORS_ORIGIN` — comma-separated allowed origins. In production, no wildcard/reflected CORS is enabled unless an origin is provided.

OAuth placeholders are represented by the `AuthOAuthConfig` type (`issuerUrl`, `clientId`, `clientSecret`, `redirectUri`, `scopes`). OAuth is disabled by default until explicit configuration is wired by an application.

## Build and deployment

Build all deployable outputs:

```bash
pnpm exec nx run-many -t build --all
```

Backend outputs are emitted under `dist/apps/backend/*`. Frontend static outputs are emitted under `dist/apps/frontend/*`.

The root `Dockerfile` supports backend and frontend targets:

```bash
# Backend API example
docker build \
  --target backend \
  --build-arg NX_PROJECT=backend-admin-app-api \
  --build-arg BUILD_OUTPUT=dist/apps/backend/admin-app-api \
  -t nest-react/backend-admin-app-api .

# Frontend static example
docker build \
  --target frontend \
  --build-arg NX_PROJECT=admin-app \
  --build-arg FRONTEND_OUTPUT=dist/apps/frontend/admin \
  -t nest-react/admin-app .
```

Optional local container smoke stack:

```bash
docker compose -f docker/docker-compose.yml up --build
```

Frontend services are exposed on ports 8081-8083 and backend APIs on ports 3001-3003.
