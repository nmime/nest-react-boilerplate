# @app/backend-common-s3

Path: `libs/backend/common/s3/lib`
Nx project: `@app/backend-common-s3`
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
pnpm exec nx run @app/backend-common-s3:build
pnpm exec nx run @app/backend-common-s3:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../AGENTS.md)
- [Repository architecture](../../../../../docs/architecture.md)
- [Command matrix](../../../../../docs/command-matrix.md)
- [Testing](../../../../../docs/testing.md)
- [API contracts](../../../../../docs/api-contracts.md)
