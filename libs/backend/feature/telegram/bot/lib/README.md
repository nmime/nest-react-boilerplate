# @app/backend-feature-telegram-bot

Path: `libs/backend/feature/telegram/bot/lib`
Nx project: `@app/backend-feature-telegram-bot`
Project type: `library`
Tags: `platform:backend`, `type:feature-main`, `scope:telegram`

## Purpose

Backend feature-main library for the telegram scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Keep feature orchestration, ports, and adapters scoped to this feature; share only stable contracts through shared/common libraries.
- Respect the declared scope tag: `telegram`.

## Commands

```bash
pnpm exec nx run @app/backend-feature-telegram-bot:build
pnpm exec nx run @app/backend-feature-telegram-bot:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [API contracts](../../../../../../docs/api-contracts.md)
