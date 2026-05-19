# Nest React Boilerplate

[![Node.js](https://img.shields.io/badge/node-26-brightgreen)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-10.32.1-orange)](https://pnpm.io)
[![Nx](https://img.shields.io/badge/Nx-22-blue)](https://nx.dev)

A production-oriented Nx monorepo starter for teams building React frontends and NestJS APIs on PostgreSQL.

This repository is intended to be a clean application foundation rather than a demo catalog. It provides the workspace structure, shared backend/frontend building blocks, database migration path, Docker packaging, and validation scripts needed to start a full-stack product without copying infrastructure from scratch.

## Architecture at a glance

The workspace is organized around deployable applications and small shared libraries:

- React/Vite frontends for the public landing surface, user workspace, and admin workspace.
- NestJS APIs for auth, user-facing API traffic, and admin API traffic.
- Shared backend libraries for bootstrap concerns, validation, RFC 7807 problem responses, Swagger/OpenAPI setup, auth/user/admin feature modules, and PostgreSQL data access.
- Shared frontend UI primitives used by the React applications, including localized product shell controls for language and theme preferences.
- TanStack Query as the frontend request/server-state manager for user/admin APIs, through generated API-client wrappers that inject bearer and locale headers from the shared frontend state layer.
- MobX as the client/UI shell state foundation for observable locale, theme, auth shell, and layout state; server-fetched user/profile/list data stays in TanStack Query caches.
- Docker and test tooling that exercise the same build, migration, and runtime paths used in local development.

See [Architecture](docs/architecture.md), [Frontend state](docs/frontend-state.md), and [Technology choices](docs/technology-choices.md) for the detailed project model and dependency rationale.

## Repository layout

```text
apps/
  backend/      NestJS API applications
  frontend/     React/Vite applications
  e2e/          full-stack Playwright suites
libs/
  common/       reusable backend foundation libraries
  feature/      domain feature modules and contracts
  frontend/     shared React UI library
  postgres/     MikroORM/PostgreSQL data-access libraries
docs/           architecture, testing, deployment, and operations notes
docker/         compose/nginx files for the containerized stack
tools/          local development, migration, Docker, and validation scripts
```

## Prerequisites

- Node.js 26.x
- pnpm 10.32.1 via Corepack
- Docker, when running PostgreSQL, component tests, Docker smoke tests, or the full-stack stack

```bash
corepack enable
pnpm install --frozen-lockfile
```

## Getting started

Create a local environment file, start PostgreSQL, apply migrations, then run the full stack:

```bash
cp .env.example .env
pnpm run dev:db
pnpm run db:migrate
pnpm run dev:fullstack
```

`dev:fullstack` starts the three backend APIs and three Vite frontends with local API base URL defaults. You can also run individual projects with Nx, for example:

```bash
pnpm exec nx serve auth-app-api
pnpm exec nx serve user-app
```

The backend APIs expose `GET /health`. Auth, user profile, and admin profile flows are wired through the shared auth and PostgreSQL layers so a new developer can validate the stack without adding application code first.

## User locale and theme preferences

Authenticated users have first-class locale and theme preferences. The auth API stores `locale` and `theme` on the auth user record, includes both values in `GET /auth/me` responses, and exposes `PATCH /auth/me/preferences` for partial updates. `theme` accepts `system`, `light`, or `dark` and defaults to `system`; locale remains limited to the supported locale set. The older `PATCH /auth/me/locale` route remains as a compatibility wrapper.

The frontend apps load saved preferences for authenticated sessions, apply them to the shared `LocaleStore`/`UiStore`, and persist guest choices locally. `ThemeSwitcher` and `LanguageSwitcher` are rendered through the shared product shell, so landing, user, and admin surfaces share the same behavior. Theme selection persists in `boilerplate.theme`, sets `data-theme-preference`, resolves `data-theme` to `light` or `dark`, and follows `prefers-color-scheme` while the preference is `system`.

Generated OpenAPI contracts and `@app/api-client` wrappers are the source for frontend auth preference calls; app code should not embed raw auth preference endpoint strings. See [Internationalization](docs/i18n.md), [Frontend state](docs/frontend-state.md), and [OpenAPI and typed client scaffold](docs/api-client.md) for the full flow.

## Database migrations

PostgreSQL persistence is managed through MikroORM. Migration classes are registered through the workspace migration tooling and applied with:

```bash
pnpm run db:migrate
```

Applied migrations are tracked by MikroORM in the `mikro_orm_migrations` table, making the command safe to rerun. The reset helper is limited to local/dev-looking databases and drops the app schema plus migration tracking before reapplying migrations:

```bash
pnpm run db:reset
```

For operational details, see [Deployment and local stack readiness](docs/deployment.md).

## Docker workflow

The root `Dockerfile` packages backend applications as Node runtime images and frontend applications as nginx static images. The Docker Compose stack includes PostgreSQL, a migration service, backend health checks, frontend nginx health checks, and same-origin proxying from the frontends to the APIs.

```bash
pnpm run docker:fullstack
pnpm run test:docker-smoke
pnpm run docker:down
```

Docker validation scripts intentionally default to conservative build parallelism for reliability on CI and small VPS hosts. See [Deployment and local stack readiness](docs/deployment.md) for the compose topology and runtime notes.

## Testing and validation

Common local checks:

```bash
pnpm run format:check
pnpm run api:contracts:check
pnpm run api:clients:check
pnpm run lint
pnpm run typecheck
pnpm run test:coverage
pnpm run test:component
pnpm run test:e2e
pnpm run test:fullstack
```

Unit and coverage checks use Vitest. Component tests cover database-backed Nest modules with Testcontainers. E2E and full-stack checks use Playwright, Docker Compose, real PostgreSQL migrations, API health probes, auth/user/admin HTTP flows, and frontend route assertions.

When auth DTOs, controllers, generated clients, preference stores, or product shell controls change, run the OpenAPI freshness checks plus affected backend/frontend tests before relying on broader `pnpm run check`. See [Testing matrix](docs/testing.md) for when to run each layer.

## Rocket-launch a new project

Use [`docs/new-project.md`](docs/new-project.md) and `pnpm init:project` to rename the boilerplate, replace safe placeholders, configure split environments, and run launch checks without rewriting Git history.

Additional launch docs:

- [Operations runbook](docs/operations.md)
- [Production Kubernetes/Ansible deployment](docs/production-deploy.md)
- [One-server Docker Compose production deployment](docs/docker-compose-production.md)
- [Production readiness checklist](docs/production-readiness.md)
- [OpenAPI and typed client scaffold](docs/api-client.md)
- [Frontend UX primitives](docs/frontend-ux.md)
- [Internationalization](docs/i18n.md)
- [Auth production roadmap](docs/auth-production-roadmap.md)
- [Branch protection recommendation](docs/branch-protection.md)

## Deployment and operations

Start from `.env.example`, replace placeholder values with secrets from your environment or secret manager, and keep production OpenAPI/CORS/auth settings explicit. The repository includes deployment guidance for Docker runtime validation, database migrations, health checks, and production hardening:

- [Deployment and local stack readiness](docs/deployment.md)
- [Production hardening](docs/production-hardening.md)
- [One-server Docker Compose production deployment](docs/docker-compose-production.md)
- [Production readiness checklist](docs/production-readiness.md)
- [API conventions](docs/api-conventions.md)

## Development conventions

- Keep deployable code in `apps/`; put reusable backend, frontend, data-access, and feature code in `libs/`.
- Prefer explicit MikroORM migrations over runtime schema synchronization.
- Keep Docker, local development, and CI validation paths aligned so smoke tests reflect production packaging.
- Add focused tests at the lowest useful layer, then use Docker/full-stack checks for integration confidence.
- Follow [CONTRIBUTING.md](CONTRIBUTING.md) and existing Nx project tags when adding projects or libraries.

## License and attribution

This project is open source under the [MIT License](LICENSE). Attribution and
mention of the original author (`nmime`, https://github.com/nmime) are
appreciated and recommended when you reuse or publish derivatives, but they are
not required beyond the MIT license terms.
