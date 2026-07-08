# @app/frontend-ui-native

Path: `libs/frontend/ui-native/lib`
Nx project: `@app/frontend-ui-native`
Project type: `library`
Tags: `platform:frontend`, `type:ui`, `scope:shared`, `fsd:layer:shared`

## Purpose

Frontend shared UI library for the shared scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import backend libraries from frontend code. Respect FSD tags and use frontend platform dependencies from `libs/frontend/package.json`.
- Keep UI primitives/components renderer-appropriate and covered by the relevant build/test/Storybook checks.
- Respect the declared scope tag: `shared`.

## Commands

```bash
pnpm exec nx run @app/frontend-ui-native:build
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../AGENTS.md)
- [Repository architecture](../../../../docs/architecture.md)
- [Command matrix](../../../../docs/command-matrix.md)
- [Testing](../../../../docs/testing.md)
- [Frontend FSD](../../../../docs/frontend-fsd.md)
