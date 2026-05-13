# Nest React Boilerplate

[![CI](https://github.com/nmime/nest-react-boilerplate/actions/workflows/ci.yml/badge.svg)](https://github.com/nmime/nest-react-boilerplate/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-22-brightgreen)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-11.1.1-orange)](https://pnpm.io)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

**A production-ready full-stack NestJS + Next.js boilerplate.**

A complete monorepo with the cross-cutting concerns a real SaaS needs, plus a typed contract from PostgreSQL all the way to React. Start with plain CRUD; graduate a context to full DDD only when it earns it.

## Features

- **Public landing + admin app** — `/` is a polished public landing page; `/dashboards/analytics` is the authenticated dashboard shell.
- **Auth & RBAC** — JWT + OAuth (Google / GitHub), role-based access control, session management.
- **Admin frontend, batteries included** — Next.js App Router, TanStack Query with type-safe hooks, React Hook Form + Zod, role-aware components for UI-level RBAC.
- **Durable writes & audit** — idempotency keys, optimistic locking via ETag, and domain-event-driven audit logging.
- **Observability** — standardized error responses (RFC 9457 problem details), structured logging with PII redaction, request-ID correlation.
- **End-to-end typed** — Drizzle drives database types; OpenAPI drives frontend types. Interactive API docs at `/docs`.
- **Modern toolchain** — NestJS 11 · Next.js 16 · React 19 · Drizzle ORM · shadcn/ui on Base UI · oxlint + oxfmt · Turborepo · pnpm 11.1.1.

## Requirements

- Node.js 22.x
- pnpm 11.1.1
- Docker / Docker Compose for local PostgreSQL and Redis

## Workspace

- **`api`** (`apps/api`, :3000) — NestJS backend, DDD, Drizzle ORM, Passport
- **`admin-shadcn`** (`apps/admin-shadcn`, :8080) — Public landing, admin/dashboard app, Next.js App Router, shadcn/ui
- **`@workspace/database`** (`packages/database`) — Schema definitions & migrations, Drizzle ORM
- **`@workspace/api-types`** (`packages/api-types`) — Shared OpenAPI type definitions, openapi-typescript
- **`@workspace/ui`** (`packages/ui`) — Shared UI component library, @base-ui/react
- **`@workspace/icons`** (`packages/icons`) — Shared icon set

## Environment

`pnpm install` runs `pnpm setup:env`, which copies `.env.example` to `.env` for the API, admin app, and database package.

Admin defaults:

```bash
NEXT_PUBLIC_APP_NAME="Nest React Boilerplate"
NEXT_PUBLIC_APP_URL="http://localhost:8080"
NEXT_PUBLIC_API_URL="http://localhost:3000"
```

## Quick Start

```bash
pnpm install
docker compose -f docker/docker-compose.yml up -d
pnpm --filter @workspace/database db:push
pnpm dev
```

- API: <http://localhost:3000>
- API docs: <http://localhost:3000/docs>
- Public landing: <http://localhost:8080>
- Admin dashboard: <http://localhost:8080/dashboards/analytics>

Docker Compose starts PostgreSQL with database `nestjs-boilerplate` and Redis.

## Verification

```bash
pnpm peers check
pnpm turbo format:check
pnpm turbo lint
pnpm turbo typecheck
pnpm turbo build
pnpm --filter api test
pnpm --filter admin-shadcn exec vitest run
```

API e2e tests require PostgreSQL and Redis:

```bash
docker compose -f docker/docker-compose.yml up -d
DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs-boilerplate \
JWT_SECRET=test-secret-key-min-32-chars-for-local \
REDIS_URL=redis://localhost:6379 \
pnpm --filter api test:e2e
```

## Common Commands

```bash
pnpm turbo build
pnpm turbo lint
pnpm turbo typecheck
pnpm turbo format          # auto-fix formatting (oxfmt)
pnpm turbo format:check    # CI formatting check
```

## Documentation

- [Architecture](./docs/architecture.md) — monorepo layout, DDD layering, request lifecycle
- [API Conventions](./docs/api-conventions.md) — URLs, responses, errors, auth, idempotency, optimistic locking
- [Technology Choices](./docs/technology-choices.md) — why Drizzle, Base UI, opt-in DDD, oxlint
- [Contributing](./CONTRIBUTING.md) — setup, workflows, testing, git, troubleshooting
