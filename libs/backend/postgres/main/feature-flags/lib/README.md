# @app/backend-postgres-main-feature-flags

Path: `libs/backend/postgres/main/feature-flags/lib`
Nx project: `@app/backend-postgres-main-feature-flags`
Project type: `library`
Tags: `platform:backend`, `type:data-access`, `scope:feature-flags`

## Purpose

Backend PostgreSQL/data-access library for the feature-flags scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Keep persistence concerns here; expose behavior through feature/application boundaries instead of app-local database code.
- Respect the declared scope tag: `feature-flags`.

## Commands

```bash
pnpm exec nx run @app/backend-postgres-main-feature-flags:build
pnpm exec nx run @app/backend-postgres-main-feature-flags:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [API contracts](../../../../../../docs/api-contracts.md)
