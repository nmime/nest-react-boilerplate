# @app/frontend-feature-admin-i18n

Path: `libs/frontend/feature/admin/i18n/lib`
Nx project: `@app/frontend-feature-admin-i18n`
Project type: `library`
Tags: `platform:frontend`, `type:feature-shared`, `scope:admin`, `boundary:i18n`, `fsd:layer:shared`, `framework:neutral`

## Purpose

Frontend feature-shared library for the admin scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import backend libraries from frontend code. Respect FSD tags and use frontend platform dependencies from `libs/frontend/package.json`.
- Keep this as shared feature contracts/helpers only; avoid runtime app composition here.
- Respect the declared scope tag: `admin`.

## Commands

```bash
pnpm exec nx show project @app/frontend-feature-admin-i18n
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [Frontend FSD](../../../../../../docs/frontend-fsd.md)
