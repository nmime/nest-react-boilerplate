# @app/common-i18n

Path: `libs/common/i18n/lib`
Nx project: `@app/common-i18n`
Project type: `library`
Tags: `platform:shared`, `type:common`, `scope:shared`, `boundary:i18n`, `framework:neutral`

## Purpose

Cross-runtime framework-neutral library for the shared scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Keep this library framework-neutral so it can be used by both backend and frontend runtimes.
- Respect the declared scope tag: `shared`.

## Commands

```bash
pnpm exec nx run @app/common-i18n:build
pnpm exec nx run @app/common-i18n:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../AGENTS.md)
- [Repository architecture](../../../../docs/architecture.md)
- [Command matrix](../../../../docs/command-matrix.md)
- [Testing](../../../../docs/testing.md)
