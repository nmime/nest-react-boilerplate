# @app/backend-postgres-main-notification

Path: `libs/backend/postgres/main/notification/lib`
Nx project: `@app/backend-postgres-main-notification`
Project type: `library`
Tags: `platform:backend`, `type:data-access`, `scope:notification`

## Purpose

Notification data access library: MikroORM entities (Notification, Template, TemplateChannel, Delivery), domain enums/types, repositories, and migration for PostgreSQL.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code.
- Respect the declared scope tag: `notification`.

## Commands

```bash
pnpm exec nx run @app/backend-postgres-main-notification:test
pnpm exec nx run @app/backend-postgres-main-notification:build
```
