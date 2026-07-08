# telegram-bot-api Instructions

Follow [backend app rules](../../AGENTS.md) and the root
[AGENTS.md](../../../../AGENTS.md).

This service owns Telegram webhook/API composition. Keep reusable Telegram bot
logic in `libs/backend/feature/telegram/bot/**`, keep secrets out of docs/logs,
and do not mix webhook and polling runtime behavior. See [README.md](README.md)
for commands and ownership.
