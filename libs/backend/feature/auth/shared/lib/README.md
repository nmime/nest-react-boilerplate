# @app/backend-feature-auth-shared

Path: `libs/backend/feature/auth/shared/lib`
Nx project: `@app/backend-feature-auth-shared`
Project type: `library`
Tags: `platform:backend`, `type:feature-shared`, `scope:auth`

## Purpose

Backend feature-shared library for the auth scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Keep this as shared feature contracts/helpers only; avoid runtime app composition here.
- Respect the declared scope tag: `auth`.

## Commands

```bash
pnpm exec nx run @app/backend-feature-auth-shared:build
pnpm exec nx run @app/backend-feature-auth-shared:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [API contracts](../../../../../../docs/api-contracts.md)
