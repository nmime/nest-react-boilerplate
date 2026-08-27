# @app/backend-mongodb-main-payments

## Purpose

Payments native MongoDB collections, strict validators, replay-wall indexes, and the ordered-write
repository. This is the reference persistence axis: it ships complete but is not wired while the
workspace closure selects PostgreSQL.

The repository intentionally does not use MongoDB transactions. Webhook transitions write
`receipt → event → payment`; the unique receipt index, deterministic event id, idempotent payment
transition, and final receipt update make every crash prefix replayable. Outbox publication is
at-least-once because publish precedes the persisted mark.

## Verification

```bash
pnpm exec nx run @app/backend-mongodb-main-payments:build
pnpm exec nx run @app/backend-mongodb-main-payments:test -- --coverage
pnpm exec nx run @app/backend-mongodb-main-payments:component-test
```
