# @app/frontend-feature-landing-i18n

Path: `libs/frontend/feature/landing/i18n/lib`
Nx project: `@app/frontend-feature-landing-i18n`
Project type: `library`
Tags: `platform:frontend`, `type:feature-shared`, `scope:landing`, `boundary:i18n`, `fsd:layer:shared`, `framework:neutral`

## Purpose

Frontend feature-shared library for the landing scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import backend libraries from frontend code. Respect FSD tags and use frontend platform dependencies from `libs/frontend/package.json`.
- Keep this as shared feature contracts/helpers only; avoid runtime app composition here.
- Respect the declared scope tag: `landing`.

## Commands

```bash
pnpm exec nx show project @app/frontend-feature-landing-i18n
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [Frontend FSD](../../../../../../docs/frontend-fsd.md)
