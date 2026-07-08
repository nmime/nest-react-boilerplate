# @app/backend-common-logger

Path: `libs/backend/common/logger/lib`
Nx project: `@app/backend-common-logger`
Project type: `library`
Tags: `platform:backend`, `type:common`, `scope:shared`, `boundary:infrastructure-adapter`

## Purpose

Backend common library for the shared scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Respect the declared scope tag: `shared`.

## Commands

```bash
pnpm exec nx run @app/backend-common-logger:build
pnpm exec nx run @app/backend-common-logger:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../AGENTS.md)
- [Repository architecture](../../../../../docs/architecture.md)
- [Command matrix](../../../../../docs/command-matrix.md)
- [Testing](../../../../../docs/testing.md)
- [API contracts](../../../../../docs/api-contracts.md)
