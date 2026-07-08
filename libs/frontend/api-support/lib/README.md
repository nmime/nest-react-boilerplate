# @app/frontend-api-support

Path: `libs/frontend/api-support/lib`
Nx project: `@app/frontend-api-support`
Project type: `library`
Tags: `platform:frontend`, `type:util`, `scope:shared`, `fsd:layer:shared`

## Purpose

Frontend shared library for the shared scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import backend libraries from frontend code. Respect FSD tags and use frontend platform dependencies from `libs/frontend/package.json`.
- Respect the declared scope tag: `shared`.

## Commands

```bash
pnpm exec nx run @app/frontend-api-support:build
pnpm exec nx run @app/frontend-api-support:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../AGENTS.md)
- [Repository architecture](../../../../docs/architecture.md)
- [Command matrix](../../../../docs/command-matrix.md)
- [Testing](../../../../docs/testing.md)
- [Frontend FSD](../../../../docs/frontend-fsd.md)
