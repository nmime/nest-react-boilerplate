# @app/backend-feature-discord-bot

Path: `libs/backend/feature/discord/bot/lib`
Nx project: `@app/backend-feature-discord-bot`
Project type: `library`
Tags: `platform:backend`, `type:feature-main`, `scope:discord`

## Purpose

Backend feature-main library for the discord scope.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Keep feature orchestration, ports, and adapters scoped to this feature; share only stable contracts through shared/common libraries.
- Respect the declared scope tag: `discord`.

## Commands

```bash
pnpm exec nx run @app/backend-feature-discord-bot:build
pnpm exec nx run @app/backend-feature-discord-bot:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [API contracts](../../../../../../docs/api-contracts.md)
