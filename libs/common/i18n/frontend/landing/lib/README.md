# @app/common-i18n-frontend-landing

Path: `libs/common/i18n/frontend/landing/lib`
Nx project: `@app/common-i18n-frontend-landing`
Project type: `library`
Tags: `platform:frontend`, `type:common`, `scope:landing`, `boundary:i18n`, `fsd:layer:shared`, `framework:neutral`

## Purpose

Frontend shared library for the landing scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import backend libraries from frontend code. Respect FSD tags and use frontend platform dependencies from `libs/frontend/package.json`.
- Respect the declared scope tag: `landing`.

## Commands

```bash
pnpm exec nx run @app/common-i18n-frontend-landing:build
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [Frontend FSD](../../../../../../docs/frontend-fsd.md)
