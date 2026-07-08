# @app/backend-feature-user-shared

Path: `libs/backend/feature/user/shared/lib`
Nx project: `@app/backend-feature-user-shared`
Project type: `library`
Tags: `platform:backend`, `type:feature-shared`, `scope:user`

## Purpose

Backend feature-shared library for the user scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Keep this as shared feature contracts/helpers only; avoid runtime app composition here.
- Respect the declared scope tag: `user`.

## Commands

```bash
pnpm exec nx run @app/backend-feature-user-shared:build
pnpm exec nx run @app/backend-feature-user-shared:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [API contracts](../../../../../../docs/api-contracts.md)
