# telegram-bot-api

Path: `apps/backend/telegram/telegram-bot-api`
Nx project: `telegram-bot-api`
Package: `telegram-bot-api`
Runtime: NestJS API on Fastify
Default local port: `3013`

## Ownership

This service composes the Telegram webhook/API runtime and shared health
controller. Keep reusable Telegram bot behavior in
`libs/backend/feature/telegram/bot/**`.

Runtime configuration expects Telegram bot environment variables such as
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `TELEGRAM_BOT_MODE`; never
document real secret values.

## Commands

```bash
pnpm exec nx serve telegram-bot-api
pnpm exec nx build telegram-bot-api
pnpm exec nx run telegram-bot-api:test
```

## Docs

- [Backend app rules](../../AGENTS.md)
- [API conventions](../../../../docs/api-conventions.md)
- [Health checks](../../../../docs/operations/health-checks.md)
- [Social auth bots](../../../../docs/social-auth-bots.md)
