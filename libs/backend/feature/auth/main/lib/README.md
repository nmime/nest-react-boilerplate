# @app/backend-feature-auth-main

Path: `libs/backend/feature/auth/main/lib`
Nx project: `@app/backend-feature-auth-main`
Project type: `library`
Tags: `platform:backend`, `type:feature-main`, `scope:auth`

## Purpose

Backend feature-main library for the auth scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Keep feature orchestration, ports, and adapters scoped to this feature; share only stable contracts through shared/common libraries.
- Respect the declared scope tag: `auth`.

## Commands

```bash
pnpm exec nx run @app/backend-feature-auth-main:build
pnpm exec nx run @app/backend-feature-auth-main:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [API contracts](../../../../../../docs/api-contracts.md)
