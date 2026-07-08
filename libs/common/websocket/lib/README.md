# @app/common-websocket

Path: `libs/common/websocket/lib`
Nx project: `@app/common-websocket`
Project type: `library`
Tags: `platform:shared`, `type:common`, `scope:shared`, `boundary:websocket`, `framework:neutral`

## Purpose

Cross-runtime framework-neutral library for the shared scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Keep this library framework-neutral so it can be used by both backend and frontend runtimes.
- Respect the declared scope tag: `shared`.

## Commands

```bash
pnpm exec nx run @app/common-websocket:build
pnpm exec nx run @app/common-websocket:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../AGENTS.md)
- [Repository architecture](../../../../docs/architecture.md)
- [Command matrix](../../../../docs/command-matrix.md)
- [Testing](../../../../docs/testing.md)
