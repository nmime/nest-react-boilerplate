# @app/common-api-contracts

Path: `libs/common/api-contracts/lib`
Nx project: `@app/common-api-contracts`
Project type: `library`
Tags: `platform:shared`, `type:common`, `scope:api-contracts`, `boundary:contracts`, `framework:neutral`

## Purpose

Cross-runtime framework-neutral library for the api-contracts scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Keep this library framework-neutral so it can be used by both backend and frontend runtimes.
- Respect the declared scope tag: `api-contracts`.

## Commands

```bash
pnpm exec nx run @app/common-api-contracts:build
pnpm exec nx run @app/common-api-contracts:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../AGENTS.md)
- [Repository architecture](../../../../docs/architecture.md)
- [Command matrix](../../../../docs/command-matrix.md)
- [Testing](../../../../docs/testing.md)
