# telegram-bot-api

## Ownership

This service composes the Telegram webhook/API runtime and shared health
controller. Keep reusable Telegram bot behavior in
`libs/backend/feature/telegram/bot/**`.

Runtime configuration expects Telegram bot environment variables such as
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_WEBHOOK_SECRET`,
`TELEGRAM_BOT_WEBHOOK_URL`, and `TELEGRAM_BOT_MODE`; never document real secret
values. In webhook mode startup registers the canonical `/telegram/webhook`
endpoint. Bot UI setup publishes a language-neutral default from the configured
default locale, then command lists and long and short bot-profile descriptions
for every supported locale. Commands are scoped to private chats. It also
publishes the persistent Mini App menu button when
`TELEGRAM_MINI_APP_URL` is safe.

Linked-account resolution is opt-in through `TELEGRAM_BOT_AUTH_URL` and a
dedicated `TELEGRAM_BOT_AUTH_SECRET`. The bot has no durable auth database;
the auth service owns tenant selection and canonical provider identity mapping.
See the [bridge configuration](../../../../docs/social-auth-bots.md#telegram-bots-with-grammy).

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
