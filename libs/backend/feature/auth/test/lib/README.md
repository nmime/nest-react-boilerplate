# @app/backend-feature-auth-test

Path: `libs/backend/feature/auth/test/lib`
Nx project: `@app/backend-feature-auth-test`
Project type: `library`
Tags: `platform:backend`, `type:test-util`, `scope:auth`

## Purpose

Backend test utility library for the auth scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Use this only from tests or test support targets. Do not import test utilities into production runtime code.
- Respect the declared scope tag: `auth`.

## Commands

```bash
pnpm exec nx run @app/backend-feature-auth-test:component-test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [API contracts](../../../../../../docs/api-contracts.md)
