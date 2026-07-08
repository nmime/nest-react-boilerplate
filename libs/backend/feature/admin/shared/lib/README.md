# @app/backend-feature-admin-shared

Path: `libs/backend/feature/admin/shared/lib`
Nx project: `@app/backend-feature-admin-shared`
Project type: `library`
Tags: `platform:backend`, `type:feature-shared`, `scope:admin`

## Purpose

Backend feature-shared library for the admin scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Keep this as shared feature contracts/helpers only; avoid runtime app composition here.
- Respect the declared scope tag: `admin`.

## Commands

```bash
pnpm exec nx run @app/backend-feature-admin-shared:build
pnpm exec nx run @app/backend-feature-admin-shared:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [API contracts](../../../../../../docs/api-contracts.md)
