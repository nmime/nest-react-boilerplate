# @app/backend-feature-notification-main

Path: `libs/backend/feature/notification/main/lib`
Nx project: `@app/backend-feature-notification-main`
Project type: `library`
Tags: `platform:backend`, `type:feature-main`, `scope:notification`

## Purpose

Notification feature library: strategies (target: user/telegram-chat, transport: bot-channel), message strategies (string-format/Eta rendering), cron scheduler for pending notifications, health service, and HTTP controller.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code.
- Respect the declared scope tag: `notification`.

## Commands

```bash
pnpm exec nx run @app/backend-feature-notification-main:test
pnpm exec nx run @app/backend-feature-notification-main:build
```
