# @app/common-i18n-frontend-shared

Path: `libs/common/i18n/frontend/shared/lib`
Nx project: `@app/common-i18n-frontend-shared`
Project type: `library`
Tags: `platform:frontend`, `type:common`, `scope:shared`, `boundary:i18n`, `fsd:layer:shared`, `framework:neutral`

## Purpose

Frontend shared library for the shared scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import backend libraries from frontend code. Respect FSD tags and use frontend platform dependencies from `libs/frontend/package.json`.
- Respect the declared scope tag: `shared`.

## Commands

```bash
pnpm exec nx run @app/common-i18n-frontend-shared:build
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [Frontend FSD](../../../../../../docs/frontend-fsd.md)
