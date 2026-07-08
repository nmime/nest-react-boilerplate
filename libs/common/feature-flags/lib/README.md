# @app/common-feature-flags

Path: `libs/common/feature-flags/lib`
Nx project: `@app/common-feature-flags`
Project type: `library`
Tags: `platform:shared`, `type:common`, `scope:shared`, `boundary:feature-flags`, `framework:neutral`

## Purpose

Cross-runtime framework-neutral library for the shared scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Keep this library framework-neutral so it can be used by both backend and frontend runtimes.
- Respect the declared scope tag: `shared`.

## Commands

```bash
pnpm exec nx run @app/common-feature-flags:build
pnpm exec nx run @app/common-feature-flags:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../AGENTS.md)
- [Repository architecture](../../../../docs/architecture.md)
- [Command matrix](../../../../docs/command-matrix.md)
- [Testing](../../../../docs/testing.md)
