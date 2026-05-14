# Architecture

This repository is an Nx monorepo with flat deployable applications and small shared libraries. It keeps the starter architecture ready to use without coupling the APIs to external databases, queues, or third-party services.

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

## Deployable outputs

Nx builds backend apps into `dist/apps/backend/*` and frontend apps into `dist/apps/frontend/*`. The root Dockerfile can package any backend app as a Node runtime image or any frontend app as an nginx static image.
