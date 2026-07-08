# @app/common-notifications

Path: `libs/common/notifications/lib`
Nx project: `@app/common-notifications`
Project type: `library`
Tags: `platform:shared`, `type:common`, `scope:shared`, `boundary:notifications`, `framework:neutral`

## Purpose

Cross-runtime framework-neutral library for the shared scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Keep this library framework-neutral so it can be used by both backend and frontend runtimes.
- Respect the declared scope tag: `shared`.

## Commands

```bash
pnpm exec nx run @app/common-notifications:build
pnpm exec nx run @app/common-notifications:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../AGENTS.md)
- [Repository architecture](../../../../docs/architecture.md)
- [Command matrix](../../../../docs/command-matrix.md)
- [Testing](../../../../docs/testing.md)
