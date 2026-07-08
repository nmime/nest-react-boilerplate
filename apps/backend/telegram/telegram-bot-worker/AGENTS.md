# telegram-bot-worker Instructions

Follow [backend app rules](../../AGENTS.md) and the root
[AGENTS.md](../../../../AGENTS.md).

This worker owns Telegram polling runtime composition. Keep reusable Telegram bot
logic in `libs/backend/feature/telegram/bot/**`, keep secrets out of docs/logs,
and do not mix polling and webhook runtime behavior. See [README.md](README.md)
for commands and ownership.
