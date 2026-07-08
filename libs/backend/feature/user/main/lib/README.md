# @app/backend-feature-user-main

Path: `libs/backend/feature/user/main/lib`
Nx project: `@app/backend-feature-user-main`
Project type: `library`
Tags: `platform:backend`, `type:feature-main`, `scope:user`

## Purpose

Backend feature-main library for the user scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Keep feature orchestration, ports, and adapters scoped to this feature; share only stable contracts through shared/common libraries.
- Respect the declared scope tag: `user`.

## Commands

```bash
pnpm exec nx run @app/backend-feature-user-main:build
pnpm exec nx run @app/backend-feature-user-main:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [API contracts](../../../../../../docs/api-contracts.md)
