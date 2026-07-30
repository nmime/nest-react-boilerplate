# @app/backend-mongodb-main-notification

## Purpose

Native MongoDB v7 persistence for notification templates, deliveries, segments,
uploads, audience snapshots, broadcasts, and command idempotency. Queue work is
fenced by expiring claim tokens and related mutations use replica-set
transactions.

Provider NATS/email/bot/push calls remain outside the database transaction and
are at least once. Completion must present the active claim token so a stale
worker cannot commit after its lease is reclaimed.

## Commands

```bash
pnpm exec nx run @app/backend-mongodb-main-notification:test
pnpm exec nx run @app/backend-mongodb-main-notification:component-test
pnpm exec nx run @app/backend-mongodb-main-notification:build
```
