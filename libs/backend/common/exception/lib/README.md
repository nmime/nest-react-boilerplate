# @app/backend-common-exception

Path: `libs/backend/common/exception/lib`
Nx project: `@app/backend-common-exception`
Project type: `library`
Tags: `platform:backend`, `type:common`, `scope:shared`, `boundary:backend-kernel`

## Purpose

Backend common library for the shared scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Respect the declared scope tag: `shared`.

## Commands

```bash
pnpm exec nx run @app/backend-common-exception:build
pnpm exec nx run @app/backend-common-exception:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../AGENTS.md)
- [Repository architecture](../../../../../docs/architecture.md)
- [Command matrix](../../../../../docs/command-matrix.md)
- [Testing](../../../../../docs/testing.md)
- [API contracts](../../../../../docs/api-contracts.md)
