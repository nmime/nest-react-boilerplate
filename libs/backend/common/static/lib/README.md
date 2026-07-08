# @app/backend-common-static

Path: `libs/backend/common/static/lib`
Nx project: `@app/backend-common-static`
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
pnpm exec nx run @app/backend-common-static:build
pnpm exec nx run @app/backend-common-static:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../AGENTS.md)
- [Repository architecture](../../../../../docs/architecture.md)
- [Command matrix](../../../../../docs/command-matrix.md)
- [Testing](../../../../../docs/testing.md)
- [API contracts](../../../../../docs/api-contracts.md)
