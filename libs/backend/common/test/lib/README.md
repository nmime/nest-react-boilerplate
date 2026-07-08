# @app/backend-common-test

Path: `libs/backend/common/test/lib`
Nx project: `@app/backend-common-test`
Project type: `library`
Tags: `platform:backend`, `type:test-util`, `scope:shared`, `boundary:test-util`

## Purpose

Backend test utility library for the shared scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Use this only from tests or test support targets. Do not import test utilities into production runtime code.
- Respect the declared scope tag: `shared`.

## Commands

```bash
pnpm exec nx run @app/backend-common-test:build
pnpm exec nx run @app/backend-common-test:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../AGENTS.md)
- [Repository architecture](../../../../../docs/architecture.md)
- [Command matrix](../../../../../docs/command-matrix.md)
- [Testing](../../../../../docs/testing.md)
- [API contracts](../../../../../docs/api-contracts.md)
