# telegram-bot-worker

Path: `apps/backend/telegram/telegram-bot-worker`
Nx project: `telegram-bot-worker`
Package: `telegram-bot-worker`
Runtime: NestJS worker process
Default local port: `3023`

## Ownership

This worker composes the Telegram polling runtime. Keep reusable Telegram bot
behavior in `libs/backend/feature/telegram/bot/**` and app-local runner wiring
inside this package.

Runtime configuration expects Telegram bot environment variables such as
`TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_MODE`; never document real secret values.

## Commands

```bash
pnpm exec nx serve telegram-bot-worker
pnpm exec nx build telegram-bot-worker
pnpm exec nx run telegram-bot-worker:test
```

## Docs

- [Backend app rules](../../AGENTS.md)
- [Health checks](../../../../docs/operations/health-checks.md)
- [Social auth bots](../../../../docs/social-auth-bots.md)
