# @app/backend-postgres-main

Path: `libs/backend/postgres/main/shared/lib`
Nx project: `@app/backend-postgres-main`
Project type: `library`
Tags: `platform:backend`, `type:data-access`, `scope:postgres`

## Purpose

Backend PostgreSQL/data-access library for the postgres scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Keep persistence concerns here; expose behavior through feature/application boundaries instead of app-local database code.
- Respect the declared scope tag: `postgres`.

## Commands

```bash
pnpm exec nx run @app/backend-postgres-main:build
pnpm exec nx run @app/backend-postgres-main:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [API contracts](../../../../../../docs/api-contracts.md)
